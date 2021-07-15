import { FST } from '.';
import { EventObject, Observer, SpawnedActorRef } from '..';
import { toObserver } from '../utils';

export function toActor<TState, TEvent extends EventObject, TOutput = any>(
  fst: FST<TState, TEvent, TOutput>,
  handleOutput?: (output: TOutput) => void
): SpawnedActorRef<TEvent, TState> {
  let currentState = fst.initialState;
  const observers = new Set<Observer<TState>>();

  const actor: SpawnedActorRef<TEvent, TState> = {
    id: '',
    send: (event: TEvent) => {
      const [nextState, output] = fst.transition(currentState, event);

      currentState = nextState;
      output && handleOutput?.(output);

      observers.forEach((observer) => observer.next(nextState));
    },
    subscribe: (next, onError?, onComplete?) => {
      const observer = toObserver(next, onError, onComplete);

      observers.add(observer);
      observer.next(currentState);

      return {
        unsubscribe: () => {
          observers.delete(observer);
        }
      };
    },
    getSnapshot: () => currentState
  };

  return actor;
}
