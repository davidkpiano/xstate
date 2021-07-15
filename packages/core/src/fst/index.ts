// https://en.wikipedia.org/wiki/Finite-state_transducer

import type { State, StateMachine } from '..';

export { toActor as fromActor } from './actor';
export { fromMachine } from './machine';
export { fromReducer } from './reducer';

export type FSTTransition<TState, TEvent, TOutput> = (
  state: TState,
  input: TEvent
) => [TState] | [TState, TOutput];

export interface FST<TState, TEvent, TOutput = any> {
  transition: FSTTransition<TState, TEvent, TOutput>;
  initialState: TState;
  nextEvents?: (state: TState) => TEvent[];
}

export type StateTransducerFrom<T> = T extends StateMachine<
  infer TContext,
  any,
  infer TEvent
>
  ? FST<State<TContext, TEvent>, TEvent, any[]>
  : never;
