import { State } from './State';
import { StateValue, EventObject, DefaultContext } from './types';

export type ValueFromStateGetter<
  T,
  TContext extends DefaultContext,
  TEvent extends EventObject
> = (state: State<TContext, TEvent>) => T;

export type StatePatternTuple<
  T,
  TContext extends DefaultContext,
  TEvent extends EventObject
> = [StateValue, ValueFromStateGetter<T, TContext, TEvent>];

export function matchState<
  T,
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  state: State<TContext, TEvent> | StateValue,
  patterns: Array<StatePatternTuple<T, TContext, TEvent>>,
  defaultValue: ValueFromStateGetter<T, TContext, TEvent>
): T {
  const resolvedState = State.from(
    state,
    state instanceof State ? state.context : (undefined as any)
  );

  for (const [stateValue, getValue] of patterns) {
    if (resolvedState.matches(stateValue)) {
      return getValue(resolvedState);
    }
  }

  return defaultValue(resolvedState);
}
