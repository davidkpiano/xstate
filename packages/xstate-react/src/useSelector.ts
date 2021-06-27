import { useEffect, useState, useDebugValue } from 'react';
import { ActorRef, Interpreter, Subscribable } from 'xstate';
import { isActorWithState } from './useActor';
import { getServiceSnapshot } from './useService';

function isService(actor: any): actor is Interpreter<any, any, any, any> {
  return 'state' in actor && 'machine' in actor;
}

const defaultCompare = (a, b) => a === b;
const defaultGetSnapshot = (a) =>
  isService(a)
    ? getServiceSnapshot(a)
    : isActorWithState(a)
    ? a.state
    : undefined;

export function useSelector<
  TActor extends ActorRef<any, any>,
  T,
  TEmitted = TActor extends Subscribable<infer Emitted> ? Emitted : never
>(
  actor: TActor,
  selector: (emitted: TEmitted) => T,
  compare: (a: T, b: T) => boolean = defaultCompare,
  getSnapshot: (a: TActor) => TEmitted = defaultGetSnapshot
): T {
  const [state, setState] = useState(() => ({
    actor,
    value: selector(getSnapshot(actor))
  }));

  let valueToReturn = state.value;
  let value = selector(getSnapshot(actor));
  if (state.actor !== actor || !compare(valueToReturn, value)) {
    valueToReturn = value;
    setState({
      actor,
      value: valueToReturn
    });
  }

  useDebugValue(valueToReturn);

  useEffect(() => {
    let didUnsubscribe = false;
    const checkForUpdates = (emitted: TEmitted) => {
      if (didUnsubscribe) {
        return false;
      }

      const value = selector(emitted);
      setState((prevState) => {
        if (prevState.actor !== actor) {
          return prevState;
        }

        if (compare(prevState.value, value)) {
          return prevState;
        }

        return { ...prevState, value };
      });
    };
    const sub = actor.subscribe(checkForUpdates);
    checkForUpdates(getSnapshot(actor));

    return () => {
      didUnsubscribe = true;
      sub.unsubscribe();
    };
  }, [actor, selector, compare, getSnapshot]);

  return valueToReturn;
}
