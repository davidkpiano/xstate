import { useState, useRef, useEffect } from 'react';
import {
  interpret,
  EventObject,
  StateMachine,
  State,
  Interpreter,
  InterpreterOptions,
  MachineOptions,
  DefaultContext
} from 'xstate';

interface UseMachineOptions<TContext extends DefaultContext> {
  /**
   * If provided, will be merged with machine's context.
   */
  context?: Partial<TContext>;
  /**
   * If `true`, service will start immediately (before mount).
   */
  immediate: boolean;
}

const defaultOptions = {
  immediate: false
};

export function useMachine<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext>> &
    Partial<MachineOptions<TContext, TEvent>> = defaultOptions
): [
  State<TContext, TEvent>,
  Interpreter<TContext, any, TEvent>['send'],
  Interpreter<TContext, any, TEvent>
] {
  const {
    context,
    guards,
    actions,
    activities,
    services,
    delays,
    immediate,
    ...interpreterOptions
  } = options;

  const customMachine = machine.withConfig(
    {
      guards,
      actions,
      activities,
      services,
      delays
    },
    {
      ...machine.context,
      ...context
    } as TContext
  );

  // Reference the service
  const serviceRef = useRef<Interpreter<TContext, any, TEvent> | null>(null);

  // Create the service only once
  // See https://reactjs.org/docs/hooks-faq.html#how-to-create-expensive-objects-lazily
  if (serviceRef.current === null) {
    serviceRef.current = interpret(
      customMachine,
      interpreterOptions
    ).onTransition(state => {
      // Update the current machine state when a transition occurs
      if (state.changed) {
        setCurrent(state);
      }
    });
  }

  const service = serviceRef.current;

  // Start service immediately (before mount) if specified in options
  if (immediate) {
    service.start();
  }

  // Keep track of the current machine state
  const [current, setCurrent] = useState(service.initialState);

  useEffect(() => {
    // Start the service when the component mounts.
    // Note: the service will start only if it hasn't started already.
    service.start();

    return () => {
      // Stop the service when the component unmounts
      service.stop();
    };
  }, []);

  return [current, service.send, service];
}

export function useService<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  service: Interpreter<TContext, any, TEvent>
): [
  State<TContext, TEvent>,
  Interpreter<TContext, any, TEvent>['send'],
  Interpreter<TContext, any, TEvent>
] {
  const [current, setCurrent] = useState(service.state);

  useEffect(() => {
    // Set to current service state as there is a possibility
    // of a transition occurring between the initial useState()
    // initialization and useEffect() commit.
    setCurrent(service.state);

    const listener = state => {
      if (state.changed) {
        setCurrent(state);
      }
    };

    service.onTransition(listener);

    return () => {
      service.off(listener);
    };
  }, [service]);

  return [current, service.send, service];
}
