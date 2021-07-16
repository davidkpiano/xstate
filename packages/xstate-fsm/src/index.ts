import {
  StateMachine,
  EventObject,
  Typestate,
  InterpreterStatus,
  InitEvent
} from './types';

export * from './types';

const INIT_EVENT: InitEvent = { type: 'xstate.init' };
const ASSIGN_ACTION: StateMachine.AssignAction = 'xstate.assign';

function toArray<T>(item: T | T[] | undefined): T[] {
  return item === undefined ? [] : ([] as T[]).concat(item);
}

export function assign<TC extends object, TE extends EventObject = EventObject>(
  assignment:
    | StateMachine.Assigner<TC, TE>
    | StateMachine.PropertyAssigner<TC, TE>
): StateMachine.AssignActionObject<TC, TE> {
  return {
    type: ASSIGN_ACTION,
    assignment
  };
}

function toActionObject<TContext extends object, TEvent extends EventObject>(
  // tslint:disable-next-line:ban-types
  action:
    | string
    | StateMachine.ActionFunction<TContext, TEvent>
    | StateMachine.ActionObject<TContext, TEvent>,
  actionMap: StateMachine.ActionMap<TContext, TEvent> | undefined
) {
  action =
    typeof action === 'string' && actionMap && actionMap[action]
      ? actionMap[action]
      : action;
  return typeof action === 'string'
    ? {
        type: action
      }
    : typeof action === 'function'
    ? {
        type: action.name,
        exec: action
      }
    : action;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function createMatcher(value: string) {
  return (stateValue) => value === stateValue;
}

function toEventObject<TEvent extends EventObject>(
  event: TEvent['type'] | TEvent
): TEvent {
  return (typeof event === 'string' ? { type: event } : event) as TEvent;
}

function createUnchangedState<
  TC extends object,
  TE extends EventObject,
  TS extends Typestate<TC>
>(value: string, context: TC): StateMachine.State<TC, TE, TS> {
  return {
    value,
    context,
    actions: [],
    changed: false,
    matches: createMatcher(value)
  };
}

function handleActions<
  TContext extends object,
  TEvent extends EventObject = EventObject
>(
  actions: Array<StateMachine.ActionObject<TContext, TEvent>>,
  context: TContext,
  eventObject: TEvent
): [Array<StateMachine.ActionObject<TContext, TEvent>>, TContext, boolean] {
  let nextContext = context;
  let assigned = false;

  const nonAssignActions = actions.filter((action) => {
    if (action.type === ASSIGN_ACTION) {
      assigned = true;
      let tmpContext = Object.assign({}, nextContext);

      if (typeof action.assignment === 'function') {
        tmpContext = action.assignment(nextContext, eventObject);
      } else {
        Object.keys(action.assignment).forEach((key) => {
          tmpContext[key] =
            typeof action.assignment[key] === 'function'
              ? action.assignment[key](nextContext, eventObject)
              : action.assignment[key];
        });
      }

      nextContext = tmpContext;
      return false;
    }
    return true;
  });

  return [nonAssignActions, nextContext, assigned];
}

export function createMachine<
  TContext extends object,
  TEvent extends EventObject = EventObject,
  TState extends Typestate<TContext> = { value: any; context: TContext }
>(
  fsmConfig: StateMachine.Config<TContext, TEvent, TState>,
  options: {
    actions?: StateMachine.ActionMap<TContext, TEvent>;
  } = {}
): StateMachine.Machine<TContext, TEvent, TState> {
  if (!IS_PRODUCTION) {
    Object.keys(fsmConfig.states).forEach((state) => {
      if (fsmConfig.states[state].states) {
        throw new Error(`Nested finite states not supported.
            Please check the configuration for the "${state}" state.`);
      }
    });
  }

  const [initialActions, initialContext] = handleActions(
    toArray(fsmConfig.states[fsmConfig.initial].entry).map((action) =>
      toActionObject(action, options.actions)
    ),
    fsmConfig.context!,
    INIT_EVENT as TEvent
  );

  const machine = {
    config: fsmConfig,
    _options: options,
    initialState: {
      value: fsmConfig.initial,
      actions: initialActions,
      context: initialContext,
      matches: createMatcher(fsmConfig.initial)
    },
    transition: (
      state: string | StateMachine.State<TContext, TEvent, TState>,
      event: TEvent | TEvent['type']
    ): StateMachine.State<TContext, TEvent, TState> => {
      const { value, context } =
        typeof state === 'string'
          ? { value: state, context: fsmConfig.context! }
          : state;
      const eventObject = toEventObject<TEvent>(event);
      const stateConfig = fsmConfig.states[value];

      if (!IS_PRODUCTION && !stateConfig) {
        throw new Error(
          `State '${value}' not found on machine ${fsmConfig.id ?? ''}`
        );
      }

      if (stateConfig.on) {
        const transitions: Array<
          StateMachine.Transition<TContext, TEvent>
        > = toArray(stateConfig.on[eventObject.type]);

        for (const transition of transitions) {
          if (transition === undefined) {
            return createUnchangedState(value, context);
          }

          const {
            target,
            actions = [],
            guard
          }: StateMachine.TransitionObject<TContext, TEvent> =
            typeof transition === 'string'
              ? { target: transition }
              : transition;

          const isTargetless = target === undefined;

          const nextStateValue = target ?? value;
          const nextStateConfig = fsmConfig.states[nextStateValue];

          if (!IS_PRODUCTION && !nextStateConfig) {
            throw new Error(
              `State '${nextStateValue}' not found on machine ${
                fsmConfig.id ?? ''
              }`
            );
          }

          if (!guard || guard?.(context, eventObject)) {
            const allActions = (isTargetless
              ? toArray(actions)
              : ([] as any[])
                  .concat(stateConfig.exit, actions, nextStateConfig.entry)
                  .filter((a) => a)
            ).map<StateMachine.ActionObject<TContext, TEvent>>((action) =>
              toActionObject(action, (machine as any)._options.actions)
            );

            const [nonAssignActions, nextContext, assigned] = handleActions(
              allActions,
              context,
              eventObject
            );

            const resolvedTarget = target ?? value;

            return {
              value: resolvedTarget,
              context: nextContext,
              actions: nonAssignActions,
              changed:
                target !== value || nonAssignActions.length > 0 || assigned,
              matches: createMatcher(resolvedTarget)
            };
          }
        }
      }

      // No transitions match
      return createUnchangedState(value, context);
    }
  };
  return machine;
}

const executeStateActions = <
  TContext extends object,
  TEvent extends EventObject = any,
  TState extends Typestate<TContext> = { value: any; context: TContext }
>(
  state: StateMachine.State<TContext, TEvent, TState>,
  event: TEvent | InitEvent
) => state.actions.forEach(({ exec }) => exec && exec(state.context, event));

export function interpret<
  TContext extends object,
  TEvent extends EventObject = EventObject,
  TState extends Typestate<TContext> = { value: any; context: TContext }
>(
  machine: StateMachine.Machine<TContext, TEvent, TState>
): StateMachine.Service<TContext, TEvent, TState> {
  let state = machine.initialState;
  let status = InterpreterStatus.NotStarted;
  const listeners = new Set<StateMachine.StateListener<typeof state>>();

  const service = {
    _machine: machine,
    send: (event: TEvent | TEvent['type']): void => {
      if (status !== InterpreterStatus.Running) {
        return;
      }
      state = machine.transition(state, event);
      executeStateActions(state, toEventObject(event));
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener: StateMachine.StateListener<typeof state>) => {
      listeners.add(listener);
      listener(state);

      return {
        unsubscribe: () => listeners.delete(listener)
      };
    },
    start: (
      initialState?:
        | TState['value']
        | { context: TContext; value: TState['value'] }
    ) => {
      if (initialState) {
        const resolved =
          typeof initialState === 'object'
            ? initialState
            : { context: machine.config.context!, value: initialState };
        state = {
          value: resolved.value,
          actions: [],
          context: resolved.context,
          matches: createMatcher(resolved.value)
        };

        if (!IS_PRODUCTION) {
          if (!(state.value in machine.config.states)) {
            throw new Error(
              `Cannot start service in state '${
                state.value
              }'. The state is not found on machine${
                machine.config.id ? ` '${machine.config.id}'` : ''
              }.`
            );
          }
        }
      }
      status = InterpreterStatus.Running;
      executeStateActions(state, INIT_EVENT);
      return service;
    },
    stop: () => {
      status = InterpreterStatus.Stopped;
      listeners.clear();
      return service;
    },
    get state() {
      return state;
    },
    get status() {
      return status;
    }
  };

  return service;
}
