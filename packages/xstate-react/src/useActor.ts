import { useState, useRef } from 'react';
import useIsomorphicLayoutEffect from 'use-isomorphic-layout-effect';
import { Sender } from './types';
import { ActorRef, EventObject } from 'xstate';
import useConstant from './useConstant';

export function isActorWithState<T extends ActorRef<any>>(
  actorRef: T
): actorRef is T & { state: any } {
  return 'state' in actorRef;
}

function isDeferredActor<T extends ActorRef<any>>(
  actorRef: T
): actorRef is T & { deferred: boolean } {
  return 'deferred' in actorRef;
}

type EmittedFromActorRef<
  TActor extends ActorRef<any, any>
> = TActor extends ActorRef<any, infer TEmitted> ? TEmitted : never;

const noop = () => {
  /* ... */
};

function defaultGetSnapshot<TEmitted>(
  actorRef: ActorRef<any, TEmitted>
): TEmitted | undefined {
  return 'getSnapshot' in actorRef
    ? actorRef.getSnapshot()
    : isActorWithState(actorRef)
    ? actorRef.state
    : undefined;
}

export function useActor<TActor extends ActorRef<any, any>, TEmitted = any>(
  actorRef: TActor,
  getSnapshot?: (actor: TActor) => EmittedFromActorRef<TActor>
): [EmittedFromActorRef<TActor>, TActor['send']];
export function useActor<TEvent extends EventObject, TEmitted>(
  actorRef: ActorRef<TEvent, TEmitted>,
  getSnapshot?: (actor: ActorRef<TEvent, TEmitted>) => TEmitted
): [TEmitted, Sender<TEvent>];
export function useActor(
  actorRef: ActorRef<EventObject, unknown>,
  getSnapshot: (
    actor: ActorRef<EventObject, unknown>
  ) => unknown = defaultGetSnapshot
): [unknown, Sender<EventObject>] {
  const actorRefRef = useRef(actorRef);
  const deferredEventsRef = useRef<EventObject[]>([]);
  const [current, setCurrent] = useState(() => getSnapshot(actorRef));

  const send: Sender<EventObject> = useConstant(() => (event) => {
    const currentActorRef = actorRefRef.current;
    // If the previous actor is a deferred actor,
    // queue the events so that they can be replayed
    // on the non-deferred actor.
    if (isDeferredActor(currentActorRef) && currentActorRef.deferred) {
      deferredEventsRef.current.push(event);
    } else {
      currentActorRef.send(event);
    }
  });

  useIsomorphicLayoutEffect(() => {
    actorRefRef.current = actorRef;
    setCurrent(getSnapshot(actorRef));
    const subscription = actorRef.subscribe({
      next: (emitted) => setCurrent(emitted),
      error: noop,
      complete: noop
    });

    // Dequeue deferred events from the previous deferred actorRef
    while (deferredEventsRef.current.length > 0) {
      const deferredEvent = deferredEventsRef.current.shift()!;

      actorRef.send(deferredEvent);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [actorRef]);

  return [current, send];
}
