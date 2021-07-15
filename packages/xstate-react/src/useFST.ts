import { useMemo } from 'react';
import { EventObject, SpawnedActorRef } from 'xstate';
import { FST } from 'xstate/lib/fst';
import { toActor } from 'xstate/lib/fst/actor';

export function useFST<TState, TEvent extends EventObject>(
  fst: FST<TState, TEvent>
): SpawnedActorRef<TEvent, TState> {
  const actor = useMemo(() => {
    return toActor(fst);
  }, [fst]);

  return actor;
}
