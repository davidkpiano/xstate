// everything in this file is copied from the core's source code
// it avoids a breaking change between this package and XState which is its peer dep
import { ActorRef, EventObject } from 'xstate';

interface ActorContext<TEvent extends EventObject, TEmitted> {
  parent?: ActorRef<any, any>;
  self: ActorRef<TEvent, TEmitted>;
  id: string;
  observers: Set<Observer<TEmitted>>;
}

export interface Behavior<TEvent extends EventObject, TEmitted = any> {
  transition: (
    state: TEmitted,
    event: TEvent,
    actorCtx: ActorContext<TEvent, TEmitted>
  ) => TEmitted;
  initialState: TEmitted;
  start?: (actorCtx: ActorContext<TEvent, TEmitted>) => TEmitted;
}

export function toObserver<T>(
  nextHandler: Observer<T> | ((value: T) => void),
  errorHandler?: (error: any) => void,
  completionHandler?: () => void
): Observer<T> {
  if (typeof nextHandler === 'object') {
    return nextHandler;
  }

  const noop = () => void 0;

  return {
    next: nextHandler,
    error: errorHandler || noop,
    complete: completionHandler || noop
  };
}

interface SpawnBehaviorOptions {
  id?: string;
  parent?: ActorRef<any>;
}

interface Observer<T> {
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}

interface BaseActorRef<TEvent extends EventObject> {
  send: (event: TEvent) => void;
}

function toActorRef<
  TEvent extends EventObject,
  TEmitted = any,
  TActorRefLike extends BaseActorRef<TEvent> = BaseActorRef<TEvent>
>(actorRefLike: TActorRefLike): ActorRef<TEvent, TEmitted> {
  return {
    subscribe: () => ({ unsubscribe: () => void 0 }),
    id: 'anonymous',
    getSnapshot: () => undefined,
    ...actorRefLike
  };
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
      observers.forEach((observer) => observer.next(state));
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
      observer.next(state);

      return {
        unsubscribe: () => {
          observers.delete(observer);
        }
      };
    }
  });

  const actorCtx = {
    parent: options.parent,
    self: actor,
    id: options.id || 'anonymous',
    observers
  };

  state = behavior.start ? behavior.start(actorCtx) : state;

  return actor;
}
