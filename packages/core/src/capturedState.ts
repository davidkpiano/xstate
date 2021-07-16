import { ActionTypes, InvokeActionObject, ActorRef } from './types';

export const CapturedState = {
  current: {
    actorRef: undefined as ActorRef<any, any> | undefined,
    spawns: [] as InvokeActionObject[]
  }
};

export function captureSpawn(actorRef: ActorRef<any, any>, name: string) {
  CapturedState.current.spawns.push({
    type: ActionTypes.Invoke,
    src: actorRef,
    ref: actorRef,
    id: name
  });

  return actorRef;
}

export function flushSpawns() {
  const { current } = CapturedState;
  const flushed = current.spawns;
  current.spawns = [];
  return flushed;
}
