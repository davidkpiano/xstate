import { EventObject, MachineContext, StateConfig } from 'xstate';

export type MaybeLazy<T> = T | (() => T);
export interface UseMachineOptions<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  /**
   * If provided, will be merged with machine's `context`.
   */
  context?: Partial<TContext>;
  /**
   * The state to rehydrate the machine to. The machine will
   * start at this state instead of its `initialState`.
   */
  state?: StateConfig<TContext, TEvent>;
}
