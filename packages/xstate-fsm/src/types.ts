export enum InterpreterStatus {
  NotStarted = 0,
  Running = 1,
  Stopped = 2
}

export type SingleOrArray<T> = T[] | T;
export interface EventObject {
  type: string;
}

export type InitEvent = { type: 'xstate.init' };

export declare namespace StateMachine {
  export type Action<TContext extends object, TEvent extends EventObject> =
    | string
    | AssignActionObject<TContext, TEvent>
    | ActionObject<TContext, TEvent>
    | ActionFunction<TContext, TEvent>;

  export type ActionMap<
    TContext extends object,
    TEvent extends EventObject
  > = Record<string, Exclude<Action<TContext, TEvent>, string>>;

  export interface ActionObject<
    TContext extends object,
    TEvent extends EventObject
  > {
    type: string;
    exec?: ActionFunction<TContext, TEvent>;
    [key: string]: any;
  }

  export type ActionFunction<
    TContext extends object,
    TEvent extends EventObject
  > = (context: TContext, event: TEvent | InitEvent) => void;

  export type AssignAction = 'xstate.assign';

  export interface AssignActionObject<
    TContext extends object,
    TEvent extends EventObject
  > extends ActionObject<TContext, TEvent> {
    type: AssignAction;
    assignment: Assigner<TContext, TEvent> | PropertyAssigner<TContext, TEvent>;
  }

  export interface TransitionObject<
    TContext extends object,
    TEvent extends EventObject
  > {
    target?: string;
    actions?: SingleOrArray<Action<TContext, TEvent>>;
    guard?: (context: TContext, event: TEvent) => boolean;
  }

  export type Transition<TContext extends object, TEvent extends EventObject> =
    | string
    | TransitionObject<TContext, TEvent>;
  export interface State<
    TContext extends object,
    TEvent extends EventObject,
    TState extends Typestate<TContext>
  > {
    value: TState['value'];
    context: TContext;
    actions: Array<ActionObject<TContext, TEvent>>;
    changed?: boolean | undefined;
    matches: <TSV extends TState['value']>(
      value: TSV
    ) => this is TState extends { value: TSV } ? TState : never;
  }

  export interface Config<
    TContext extends object,
    TEvent extends EventObject,
    TState extends Typestate<TContext> = { value: any; context: TContext }
  > {
    id?: string;
    initial: string;
    context?: TContext;
    states: {
      [key in TState['value']]: {
        on?: {
          [K in TEvent['type']]?: SingleOrArray<
            Transition<TContext, TEvent extends { type: K } ? TEvent : never>
          >;
        };
        exit?: SingleOrArray<Action<TContext, TEvent>>;
        entry?: SingleOrArray<Action<TContext, TEvent>>;
      };
    };
  }

  export interface Machine<
    TContext extends object,
    TEvent extends EventObject,
    TState extends Typestate<TContext>
  > {
    config: StateMachine.Config<TContext, TEvent, TState>;
    initialState: State<TContext, TEvent, TState>;
    transition: (
      state: string | State<TContext, TEvent, TState>,
      event: TEvent['type'] | TEvent
    ) => State<TContext, TEvent, TState>;
  }

  export type StateListener<T extends State<any, any, any>> = (
    state: T
  ) => void;

  export interface Service<
    TContext extends object,
    TEvent extends EventObject,
    TState extends Typestate<TContext> = { value: any; context: TContext }
  > {
    send: (event: TEvent | TEvent['type']) => void;
    subscribe: (
      listener: StateListener<State<TContext, TEvent, TState>>
    ) => {
      unsubscribe: () => void;
    };
    start: (
      initialState?:
        | TState['value']
        | { context: TContext; value: TState['value'] }
    ) => Service<TContext, TEvent, TState>;
    stop: () => Service<TContext, TEvent, TState>;
    readonly status: InterpreterStatus;
    readonly state: State<TContext, TEvent, TState>;
  }

  export type Assigner<TContext extends object, TEvent extends EventObject> = (
    context: TContext,
    event: TEvent
  ) => Partial<TContext>;

  export type PropertyAssigner<
    TContext extends object,
    TEvent extends EventObject
  > = {
    [K in keyof TContext]?:
      | ((context: TContext, event: TEvent) => TContext[K])
      | TContext[K];
  };
}

export interface Typestate<TContext extends object> {
  value: string;
  context: TContext;
}
