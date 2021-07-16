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
  MachineContext,
  Behavior
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
import { toActorRef } from './actor';
import { toObserver } from './utils';
import { SCXML } from '../dist/xstate.cjs';

/**
 * Returns an actor behavior from a reducer and its initial state.
 *
 * @param transition The pure reducer that returns the next state given the current state and event.
 * @param initialState The initial state of the reducer.
 * @returns An actor behavior
 */
export function fromReducer<TState, TEvent extends EventObject>(
  transition: (
    state: TState,
    event: TEvent,
    actorContext: ActorContext<TEvent, TState>
  ) => TState,
  initialState: TState
): Behavior<TEvent, TState> {
  return {
    transition: (state, event, actorCtx) => {
      // @ts-ignore TODO
      const resolvedEvent = isSCXMLEvent(event) ? event.data : event;
      // @ts-ignore TODO
      return transition(state, resolvedEvent, actorCtx);
    },
    initialState
  };
}

type PromiseEvents<T> =
  | { type: 'fulfill'; data: T }
  | { type: 'reject'; error: unknown };

type PromiseState<T> =
  | {
      status: 'pending';
      data: undefined;
      error: undefined;
    }
  | {
      status: 'fulfilled';
      data: T;
      error: undefined;
    }
  | {
      status: 'rejected';
      data: undefined;
      error: any;
    };

export function fromPromise<T>(
  promiseFn: () => Promise<T>
): Behavior<PromiseEvents<T>, PromiseState<T>> {
  const initialState: PromiseState<T> = {
    error: undefined,
    data: undefined,
    status: 'pending'
  };

  return {
    transition: (state, event, { parent, name, observers }) => {
      switch (event.type) {
        case 'fulfill':
          parent?.send(doneInvoke(name, event.data));
          return {
            error: undefined,
            data: event.data,
            status: 'fulfilled'
          };
        case 'reject':
          parent?.send(error(name, event.error));
          observers.forEach((observer) => {
            observer.error?.(event.error);
          });
          return {
            error: event.error,
            data: undefined,
            status: 'rejected'
          };
        default:
          return state;
      }
    },
    initialState,
    start: ({ self }) => {
      promiseFn().then(
        (data) => {
          self.send({ type: 'fulfill', data });
        },
        (reason) => {
          self.send({ type: 'reject', error: reason });
        }
      );

      return initialState;
    }
  };
}

interface SpawnBehaviorOptions {
  id?: string;
  parent?: ActorRef<any>;
}

export function spawnBehavior<TEvent extends EventObject, TEmitted>(
  behavior: Behavior<TEvent, TEmitted>,
  options: SpawnBehaviorOptions = {}
): ActorRef<TEvent, TEmitted> {
  let state = behavior.initialState;
  const observers = new Set<Observer<TEmitted>>();
  const mailbox: TEvent[] = [];
  let flushing = false;

  const flush = () => {
    if (flushing) {
      return;
    }
    flushing = true;
    while (mailbox.length > 0) {
      const event = mailbox.shift()!;
      state = behavior.transition(state, event, actorCtx);
      observers.forEach((observer) => observer.next?.(state));
    }
    flushing = false;
  };

  const actor = toActorRef({
    id: options.id,
    send: (event: TEvent) => {
      mailbox.push(event);
      flush();
    },
    getSnapshot: () => state,
    subscribe: (next, handleError?, complete?) => {
      const observer = toObserver(next, handleError, complete);
      observers.add(observer);
      observer.next?.(state);

      return {
        unsubscribe: () => {
          observers.delete(observer);
        }
      };
    }
  });

  const actorCtx: ActorContext<TEvent, TEmitted> = {
    parent: options.parent,
    self: actor,
    name: options.id || 'anonymous',
    observers,
    _event: null as any
  };

  state = behavior.start ? behavior.start(actorCtx) : state;

  return actor;
}

export interface ActorContext<TEvent extends EventObject, TEmitted> {
  parent?: ActorRef<any, any>;
  self: ActorRef<TEvent, TEmitted>;
  name: string;
  observers: Set<Observer<TEmitted>>;
  _event: SCXML.Event<TEvent>;
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

function isSignal(
  event: EventObject | LifecycleSignal
): event is LifecycleSignal {
  return typeof event.type === 'symbol';
}

export function createDeferredBehavior<TEvent extends EventObject>(
  lazyEntity: () => InvokeCallback
): Behavior<TEvent, undefined> {
  const parent = CapturedState.current?.actorRef;
  let canceled = false;
  const receivers = new Set<(e: EventObject) => void>();
  let dispose;

  const behavior: Behavior<TEvent, undefined> = {
    transition: (_, event, actorContext) => {
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

      if (isSignal(event)) {
        // TODO: unrecognized signal
        return undefined;
      }

      const plainEvent = isSCXMLEvent(event) ? event.data : event;
      receivers.forEach((receiver) => receiver(plainEvent));

      return undefined;
    },
    initialState: undefined
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
    transition: (_, event, actorContext) => {
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
    initialState: undefined
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
    transition: (_, event, actorContext) => {
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
    initialState: undefined
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
    transition: (state, event, actorContext) => {
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

      if (isSignal(event)) {
        // TODO: unrecognized signal
        return state;
      }

      service?.send(actorContext._event);
      return state;
    },
    subscribe: (observer) => {
      return service?.subscribe(observer);
    },
    get initialState() {
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

interface SpawnBehaviorOptions {
  id?: string;
  parent?: ActorRef<any>;
}
