import { useState, useMemo, useEffect } from 'react';
import {
  interpret,
  EventObject,
  StateMachine,
  State,
  Interpreter,
  InterpreterOptions,
  MachineOptions,
  StateConfig,
  Typestate
} from 'xstate';
import { useSubscription, Subscription } from 'use-subscription';
import useConstant from './useConstant';
import { DIFFERENT_MACHINE_WARNING_MESSAGE } from './utils';

interface UseMachineOptions<TContext, TEvent extends EventObject> {
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

export function useMachine<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = any
>(
  machine: StateMachine<TContext, any, TEvent, TTypestate>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext, TEvent>> &
    Partial<MachineOptions<TContext, TEvent>> = {}
): [
  State<TContext, TEvent, any, TTypestate>,
  Interpreter<TContext, any, TEvent, TTypestate>['send'],
  Interpreter<TContext, any, TEvent, TTypestate>
] {
  if (process.env.NODE_ENV !== 'production') {
    const [initialMachine] = useState(machine);

    if (process.env.NODE_ENV !== 'production' && machine !== initialMachine) {
      console.warn(DIFFERENT_MACHINE_WARNING_MESSAGE);
    }
  }

  const {
    context,
    guards,
    actions,
    activities,
    services,
    delays,
    state: rehydratedState,
    ...interpreterOptions
  } = options;

  const service = useConstant(() => {
    const machineConfig = {
      context,
      guards,
      actions,
      activities,
      services,
      delays
    };

    const createdMachine = machine.withConfig(machineConfig, {
      ...machine.context,
      ...context
    } as TContext);

    return interpret(createdMachine, interpreterOptions).start(
      rehydratedState ? State.create(rehydratedState) : undefined
    );
  });

  const [state, setState] = useState(service.state);

  useEffect(() => {
    service.onTransition(currentState => {
      if (currentState.changed) {
        setState(currentState);
      }
    });

    // if service.state has not changed React should just bail out from this update
    setState(service.state);

    return () => {
      service.stop();
    };
  }, []);

  // Make sure actions and services are kept updated when they change.
  // This mutation assignment is safe because the service instance is only used
  // in one place -- this hook's caller.
  useEffect(() => {
    Object.assign(service.machine.options.actions, actions);
  }, [actions]);

  useEffect(() => {
    Object.assign(service.machine.options.services, services);
  }, [services]);

  return [state, service.send, service];
}

export function useService<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = any
>(
  service: Interpreter<TContext, any, TEvent, TTypestate>
): [
  State<TContext, TEvent, any, TTypestate>,
  Interpreter<TContext, any, TEvent, TTypestate>['send'],
  Interpreter<TContext, any, TEvent, TTypestate>
] {
  const subscription: Subscription<
    State<TContext, TEvent, any, TTypestate>
  > = useMemo(
    () => ({
      getCurrentValue: () => service.state || service.initialState,
      subscribe: callback => {
        const { unsubscribe } = service.subscribe(state => {
          if (state.changed !== false) {
            callback();
          }
        });
        return unsubscribe;
      }
    }),
    [service]
  );

  const state = useSubscription(subscription);

  return [state, service.send, service];
}
