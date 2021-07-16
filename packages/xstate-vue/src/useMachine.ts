import { shallowRef, Ref } from 'vue';
import {
  EventObject,
  MachineNode,
  State,
  Interpreter,
  InterpreterOptions,
  MachineImplementations,
  Typestate,
  MachineContext
} from 'xstate';

import { UseMachineOptions, MaybeLazy } from './types';

import { useInterpret } from './useInterpret';

export function useMachine<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  getMachine: MaybeLazy<MachineNode<TContext, TEvent, TTypestate>>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext, TEvent>> &
    Partial<MachineImplementations<TContext, TEvent>> = {}
): {
  state: Ref<State<TContext, TEvent, TTypestate>>;
  send: Interpreter<TContext, TEvent, TTypestate>['send'];
  service: Interpreter<TContext, TEvent, TTypestate>;
} {
  const service = useInterpret(getMachine, options, listener);

  const { initialState } = service.machine;
  const state = shallowRef(
    (options.state ? State.create(options.state) : initialState) as State<
      TContext,
      TEvent,
      TTypestate
    >
  );

  function listener(nextState: State<TContext, TEvent, TTypestate>) {
    // Only change the current state if:
    // - the incoming state is the "live" initial state (since it might have new actors)
    // - OR the incoming state actually changed.
    //
    // The "live" initial state will have .changed === undefined.
    const initialStateChanged =
      nextState.changed === undefined && Object.keys(nextState.children).length;

    if (nextState.changed || initialStateChanged) {
      state.value = nextState;
    }
  }

  return { state, send: service.send, service };
}
