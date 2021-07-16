import { readable } from 'svelte/store';
import {
  interpret,
  EventObject,
  MachineNode,
  State,
  InterpreterOptions,
  MachineImplementations,
  StateConfig,
  Typestate
} from 'xstate';

interface UseMachineOptions<
  TContext extends object,
  TEvent extends EventObject
> {
  /**
   * If provided, will be merged with machine's `context`.
   */
  context: Partial<TContext>;
  /**
   * The state to rehydrate the machine to. The machine will
   * start at this state instead of its `initialState`.
   */
  state: StateConfig<TContext, TEvent>;
}

export function useMachine<
  TContext extends object,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext>
>(
  machine: MachineNode<TContext, TEvent, TTypestate>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext, TEvent>> &
    Partial<MachineImplementations<TContext, TEvent>> = {}
) {
  const {
    context,
    guards,
    actions,
    actors,
    delays,
    state: rehydratedState,
    ...interpreterOptions
  } = options;

  const machineConfig = {
    context,
    guards,
    actions,
    actors,
    delays
  };

  const resolvedMachine = machine.provide({
    ...machineConfig,
    context
  });

  const service = interpret(resolvedMachine, interpreterOptions).start(
    rehydratedState ? new State(rehydratedState) : undefined
  );

  const state = readable(service.state, (set) => {
    service.subscribe((state) => {
      if (state.changed) {
        set(state);
      }
    });

    return () => {
      service.stop();
    };
  });

  return { state, send: service.send, service };
}
