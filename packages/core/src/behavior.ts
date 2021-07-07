import {
  EventObject,
  InvokeCallback,
  Subscribable,
  Subscription,
  InterpreterOptions,
  Spawnable,
  Observer,
  Lazy,
  Sender,
  Receiver,
  ActorRef,
  MachineContext
} from './types';
import {
  toSCXMLEvent,
  isPromiseLike,
  isObservable,
  isMachineNode,
  isSCXMLEvent,
  isFunction
} from './utils';
import { doneInvoke, error, actionTypes } from './actions';
import { StateMachine } from './StateMachine';
import { interpret, Interpreter } from './interpreter';
import { State } from './State';
import { CapturedState } from './capturedState';

export interface ActorContext {
  self: ActorRef<any, any>; // TODO: use type params
  name: string;
}

export const startSignalType = Symbol.for('xstate.invoke');
export const stopSignalType = Symbol.for('xstate.stop');
export const startSignal: StartSignal = { type: startSignalType };
export const stopSignal: StopSignal = { type: stopSignalType };

export interface StartSignal {
  type: typeof startSignalType;
}

export interface StopSignal {
  type: typeof stopSignalType;
}

export type LifecycleSignal = StartSignal | StopSignal;

/**
 * An object that expresses the behavior of an actor in reaction to received events,
 * as well as an optionally emitted stream of values.
 *
 * @template TReceived The received event
 * @template TEmitted The emitted value
 */

export interface Behavior<TEvent extends EventObject, TEmitted = any> {
  receive: (
    state: TEmitted,
    message: TEvent | LifecycleSignal,
    ctx: ActorContext
  ) => TEmitted;
  initial: TEmitted;
  subscribe?: (observer: Observer<TEmitted>) => Subscription | undefined;
}

export function createDeferredBehavior<TEvent extends EventObject>(
  lazyEntity: () => InvokeCallback
): Behavior<TEvent, undefined> {
  const parent = CapturedState.current?.actorRef;
  let canceled = false;
  const receivers = new Set<(e: EventObject) => void>();
  let dispose;

  const behavior: Behavior<TEvent, undefined> = {
    receive: (_, event, actorContext) => {
      if (event.type === startSignalType) {
        const sender: Sender<TEvent> = (e) => {
          if (canceled) {
            return;
          }

          parent?.send(toSCXMLEvent(e, { origin: actorContext.self }));
        };

        const receiver: Receiver<TEvent> = (newListener) => {
          receivers.add(newListener);
        };

        const callbackEntity = lazyEntity();
        dispose = callbackEntity(sender, receiver);

        if (isPromiseLike(dispose)) {
          dispose.then(
            (resolved) => {
              parent?.send(
                toSCXMLEvent(doneInvoke(actorContext.name, resolved) as any, {
                  origin: actorContext.self
                })
              );
              canceled = true;
            },
            (errorData) => {
              const errorEvent = error(actorContext.name, errorData);
              parent?.send(
                toSCXMLEvent(errorEvent, { origin: actorContext.self })
              );
              canceled = true;
            }
          );
        }
        return undefined;
      } else if (event.type === stopSignalType) {
        canceled = true;

        if (isFunction(dispose)) {
          dispose();
        }
        return undefined;
      }

      const plainEvent = isSCXMLEvent(event) ? event.data : event;
      receivers.forEach((receiver) => receiver(plainEvent));

      return undefined;
    },
    initial: undefined
  };

  return behavior;
}

export function createPromiseBehavior<T, TEvent extends EventObject>(
  lazyPromise: Lazy<PromiseLike<T>>
): Behavior<TEvent, T | undefined> {
  const parent = CapturedState.current?.actorRef;
  let canceled = false;
  const observers: Set<Observer<T>> = new Set();

  const behavior: Behavior<TEvent, T | undefined> = {
    receive: (_, event, actorContext) => {
      switch (event.type) {
        case startSignalType:
          const resolvedPromise = Promise.resolve(lazyPromise());

          resolvedPromise.then(
            (response) => {
              if (!canceled) {
                parent?.send(
                  toSCXMLEvent(doneInvoke(actorContext.name, response) as any, {
                    origin: actorContext.self
                  })
                );

                observers.forEach((observer) => {
                  observer.next?.(response);
                  observer.complete?.();
                });
              }
            },
            (errorData) => {
              if (!canceled) {
                const errorEvent = error(actorContext.name, errorData);

                parent?.send(
                  toSCXMLEvent(errorEvent, { origin: actorContext.self })
                );

                observers.forEach((observer) => {
                  observer.error?.(errorData);
                });
              }
            }
          );
          return undefined;
        case stopSignalType:
          canceled = true;
          observers.clear();
          return undefined;
        default:
          return undefined;
      }
    },
    subscribe: (observer) => {
      observers.add(observer);

      return {
        unsubscribe: () => {
          observers.delete(observer);
        }
      };
    },
    initial: undefined
  };

  return behavior;
}

export function createObservableBehavior<
  T extends EventObject,
  TEvent extends EventObject
>(lazyObservable: Lazy<Subscribable<T>>): Behavior<TEvent, T | undefined> {
  const parent = CapturedState.current?.actorRef;
  let subscription: Subscription | undefined;
  let observable: Subscribable<T> | undefined;

  const behavior: Behavior<TEvent, T | undefined> = {
    receive: (_, event, actorContext) => {
      if (event.type === startSignalType) {
        observable = lazyObservable();
        subscription = observable.subscribe(
          (value) => {
            parent?.send(toSCXMLEvent(value, { origin: actorContext.self }));
          },
          (err) => {
            parent?.send(
              toSCXMLEvent(error(actorContext.name, err) as any, {
                origin: actorContext.self
              })
            );
          },
          () => {
            parent?.send(
              toSCXMLEvent(doneInvoke(actorContext.name) as any, {
                origin: actorContext.self
              })
            );
          }
        );
      } else if (event.type === stopSignalType) {
        subscription && subscription.unsubscribe();
      }

      return undefined;
    },
    subscribe: (observer) => {
      return observable?.subscribe(observer);
    },
    initial: undefined
  };

  return behavior;
}

export function createMachineBehavior<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  machine:
    | StateMachine<TContext, TEvent>
    | Lazy<StateMachine<TContext, TEvent>>,
  options?: Partial<InterpreterOptions>
): Behavior<TEvent, State<TContext, TEvent>> {
  const parent = CapturedState.current?.actorRef;
  let service: Interpreter<TContext, TEvent> | undefined;
  let subscription: Subscription;
  let resolvedMachine: StateMachine<TContext, TEvent>;

  const behavior: Behavior<TEvent, State<TContext, TEvent>> = {
    receive: (state, event, actorContext) => {
      resolvedMachine = isFunction(machine) ? machine() : machine;

      if (event.type === startSignalType) {
        service = interpret(resolvedMachine, {
          ...options,
          parent,
          id: actorContext.name
        });
        service.onDone((doneEvent) => {
          parent?.send(
            toSCXMLEvent(doneEvent, {
              origin: actorContext.self
            })
          );
        });

        if (options?.sync) {
          subscription = service.subscribe((state) => {
            parent?.send(
              toSCXMLEvent(
                {
                  type: actionTypes.update,
                  state
                },
                { origin: actorContext.self }
              )
            );
          });
        }
        service.start();
        return state;
      }

      if (event.type === stopSignalType) {
        service?.stop();
        subscription && subscription.unsubscribe(); // TODO: might not be necessary
        return state;
      }

      service?.send(event);
      return state;
    },
    subscribe: (observer) => {
      return service?.subscribe(observer);
    },
    get initial() {
      resolvedMachine =
        resolvedMachine || (isFunction(machine) ? machine() : machine);
      return resolvedMachine.initialState; // TODO: this should get from machine.getInitialState(ref)
    }
  };

  return behavior;
}

export function createBehaviorFrom<TEvent extends EventObject, TEmitted>(
  entity: PromiseLike<TEmitted>
): Behavior<TEvent, TEmitted>;
export function createBehaviorFrom<TEvent extends EventObject, TEmitted>(
  entity: Subscribable<any>
): Behavior<any, TEmitted>;
export function createBehaviorFrom<
  TEvent extends EventObject,
  TEmitted extends State<any, any>
>(
  entity: StateMachine<TEmitted['context'], any, TEmitted['event']>
): Behavior<TEvent, TEmitted>;
export function createBehaviorFrom<TEvent extends EventObject>(
  entity: InvokeCallback
): Behavior<TEvent, undefined>;
export function createBehaviorFrom(entity: Spawnable): Behavior<any, any> {
  if (isPromiseLike(entity)) {
    return createPromiseBehavior(() => entity);
  }

  if (isObservable<any>(entity)) {
    return createObservableBehavior(() => entity);
  }

  if (isMachineNode(entity)) {
    // @ts-ignore
    return createMachineBehavior(entity);
  }

  if (isFunction(entity)) {
    return createDeferredBehavior(() => entity);
  }

  throw new Error(`Unable to create behavior from entity`);
}
