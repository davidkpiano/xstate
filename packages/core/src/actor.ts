import {
  EventObject,
  Subscribable,
  SCXML,
  InvokeCallback,
  InterpreterOptions,
  ActorRef,
  Lazy,
  BaseActorRef,
  MachineContext,
  Behavior
} from './types';
import { StateMachine } from './StateMachine';
import { State } from './State';
import {
  ActorContext,
  createMachineBehavior,
  createDeferredBehavior,
  createPromiseBehavior,
  createObservableBehavior,
  createBehaviorFrom,
  LifecycleSignal,
  startSignal,
  stopSignal
} from './behaviors';
import { registry } from './registry';
import * as capturedState from './capturedState';
import { ObservableActorRef } from './ObservableActorRef';
import { toSCXMLEvent } from './utils';

const nullSubscription = {
  unsubscribe: () => void 0
};

export function isActorRef(item: any): item is ActorRef<any> {
  return !!item && typeof item === 'object' && typeof item.send === 'function';
}

export function isSpawnedActorRef(item: any): item is ActorRef<any> {
  return isActorRef(item) && 'name' in item;
}

export function fromObservable<TEvent extends EventObject>(
  observable: Subscribable<TEvent>,
  name: string
): ActorRef<never> {
  return new ObservableActorRef(
    createObservableBehavior(() => observable),
    name
  );
}

export function fromPromise<T>(
  promise: PromiseLike<T>,
  name: string
): ActorRef<never> {
  return new ObservableActorRef(
    createPromiseBehavior(() => promise),
    name
  );
}

export function fromCallback<TEvent extends EventObject>(
  callback: InvokeCallback,
  name: string
): ActorRef<SCXML.Event<TEvent>> {
  return new ObservableActorRef(
    createDeferredBehavior(() => callback),
    name
  );
}

export function fromMachine<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  machine: StateMachine<TContext, TEvent>,
  name: string,
  options?: Partial<InterpreterOptions>
): ActorRef<TEvent> {
  return new ObservableActorRef(createMachineBehavior(machine, options), name);
}

export function spawn<TReceived extends EventObject, TEmitted>(
  behavior: Behavior<TReceived, TEmitted>,
  // TODO: use more universal uniqueid)
  name: string = registry.bookId()
) {
  const actorRef = new ObservableActorRef(behavior, name);
  return capturedState.captureSpawn(actorRef, name);
}

export function spawnPromise<T>(
  lazyPromise: Lazy<PromiseLike<T>>,
  name?: string
) {
  return spawn(createPromiseBehavior(lazyPromise), name);
}

export function spawnObservable<T extends EventObject>(
  lazyObservable: Lazy<Subscribable<T>>,
  name?: string
) {
  return spawn(createObservableBehavior(lazyObservable), name);
}

export function spawnMachine(
  machine: StateMachine<any, any, any>,
  name?: string
) {
  return spawn(createMachineBehavior(machine), name);
}

export function spawnCallback(callback: InvokeCallback, name?: string) {
  return spawn(
    createDeferredBehavior(() => callback),
    name
  );
}

export function spawnFrom<TEvent extends EventObject, TEmitted>(
  entity: PromiseLike<TEmitted>,
  name?: string
): ObservableActorRef<TEvent, TEmitted>;
export function spawnFrom<TEvent extends EventObject, TEmitted>(
  entity: Subscribable<any>,
  name?: string
): ObservableActorRef<any, TEmitted>;
export function spawnFrom<
  TEvent extends EventObject,
  TEmitted extends State<any, any>
>(
  entity: StateMachine<TEmitted['context'], any, TEmitted['event']>,
  name?: string
): ObservableActorRef<TEvent, TEmitted>;
export function spawnFrom<TEvent extends EventObject>(
  entity: InvokeCallback,
  name?: string
): ObservableActorRef<TEvent, undefined>;
export function spawnFrom(entity: any): ObservableActorRef<any, any> {
  return spawn(createBehaviorFrom(entity)) as ObservableActorRef<any, any>; // TODO: fix
}

enum ProcessingStatus {
  NotProcessing,
  Processing
}

export class Actor<TEvent extends EventObject, TEmitted> {
  public current: TEmitted;
  private context: ActorContext<TEvent, TEmitted>;
  private behavior: Behavior<TEvent, TEmitted>;
  private mailbox: Array<TEvent | LifecycleSignal> = [];
  private processingStatus: ProcessingStatus = ProcessingStatus.NotProcessing;
  public name: string;

  constructor(
    behavior: Behavior<TEvent, TEmitted>,
    name: string,
    actorContext: ActorContext<TEvent, TEmitted>
  ) {
    this.behavior = behavior;
    this.name = name;
    this.context = actorContext;
    this.current = behavior.initialState;
  }
  public start() {
    this.current = this.behavior.transition(
      this.current,
      startSignal,
      this.context
    );
    return this;
  }
  public stop() {
    this.mailbox.length = 0; // TODO: test this behavior
    this.current = this.behavior.transition(
      this.current,
      stopSignal,
      this.context
    );
  }
  public subscribe(observer) {
    return this.behavior.subscribe?.(observer) || nullSubscription;
  }
  public receive(event: TEvent | LifecycleSignal) {
    this.mailbox.push(event);
    if (this.processingStatus === ProcessingStatus.NotProcessing) {
      this.flush();
    }
  }
  private flush() {
    this.processingStatus = ProcessingStatus.Processing;
    while (this.mailbox.length) {
      const event = this.mailbox.shift()!;
      // @ts-ignore
      this.context._event = toSCXMLEvent(event);

      this.current = this.behavior.transition(
        this.current,
        this.context._event.data as TEvent,
        this.context
      );
    }
    this.processingStatus = ProcessingStatus.NotProcessing;
  }
}

export function isSpawnedActor(item: any): item is ActorRef<any> {
  return isActorRef(item) && 'id' in item;
}

export function toActorRef<
  TEvent extends EventObject,
  TEmitted = any,
  TActorRefLike extends BaseActorRef<TEvent> = BaseActorRef<TEvent>
>(actorRefLike: TActorRefLike): ActorRef<TEvent, TEmitted> & TActorRefLike {
  return {
    subscribe: () => ({ unsubscribe: () => void 0 }),
    name: 'anonymous',
    getSnapshot: () => undefined,
    ...actorRefLike
  };
}
