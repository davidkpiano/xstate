import {
  EventObject,
  Subscribable,
  InvokeDefinition,
  AnyEventObject,
  StateMachine,
  Spawnable,
  SCXML
} from './types';
import { isMachine, mapContext, toInvokeSource } from './utils';
import * as serviceScope from './serviceScope';
import { ActorRef, BaseActorRef } from './types';

export interface Actor<
  TContext = any,
  TEvent extends EventObject = AnyEventObject
> extends Subscribable<TContext> {
  id: string;
  send: (event: TEvent) => any; // TODO: change to void
  stop?: () => any | undefined;
  toJSON: () => {
    id: string;
  };
  meta?: InvokeDefinition<TContext, TEvent>;
  state?: any;
  deferred?: boolean;
}

export function createNullActor(id: string): ActorRef<any> {
  return {
    id,
    send: () => void 0,
    subscribe: () => ({
      unsubscribe: () => void 0
    }),
    getSnapshot: () => undefined,
    toJSON: () => ({
      id
    })
  };
}

/**
 * Creates a deferred actor that is able to be invoked given the provided
 * invocation information in its `.meta` value.
 *
 * @param invokeDefinition The meta information needed to invoke the actor.
 */
export function createInvocableActor<TC, TE extends EventObject>(
  invokeDefinition: InvokeDefinition<TC, TE>,
  machine: StateMachine<TC, any, TE, any>,
  context: TC,
  _event: SCXML.Event<TE>
): ActorRef<any> {
  const invokeSrc = toInvokeSource(invokeDefinition.src);
  const serviceCreator = machine?.options.services?.[invokeSrc.type];
  const resolvedData = invokeDefinition.data
    ? mapContext(invokeDefinition.data, context, _event)
    : undefined;
  const tempActor = serviceCreator
    ? createDeferredActor(
        serviceCreator as Spawnable,
        invokeDefinition.id,
        resolvedData
      )
    : createNullActor(invokeDefinition.id);

  // @ts-ignore
  tempActor.meta = invokeDefinition;

  return tempActor;
}

export function createDeferredActor(
  entity: Spawnable,
  id: string,
  data?: any
): ActorRef<any, undefined> {
  const tempActor = createNullActor(id);

  // @ts-ignore
  tempActor.deferred = true;

  if (isMachine(entity)) {
    // "mute" the existing service scope so potential spawned actors within the `.initialState` stay deferred here
    const initialState = ((tempActor as any).state = serviceScope.provide(
      undefined,
      () => (data ? entity.withContext(data) : entity).initialState
    ));
    tempActor.getSnapshot = () => initialState;
  }

  return tempActor;
}

export function isActor(item: any): item is ActorRef<any> {
  try {
    return typeof item.send === 'function';
  } catch (e) {
    return false;
  }
}

export function isSpawnedActor(item: any): item is ActorRef<any> {
  return isActor(item) && 'id' in item;
}

export function toActorRef<
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
