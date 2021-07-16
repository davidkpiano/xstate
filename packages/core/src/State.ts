import {
  StateValue,
  EventObject,
  ActionObject,
  EventType,
  StateConfig,
  SCXML,
  TransitionDefinition,
  Typestate,
  HistoryValue,
  NullEvent,
  ActorRef,
  MachineContext
} from './types';
import { matchesState, keys, isString } from './utils';
import { StateNode } from './StateNode';
import { isInFinalState, nextEvents, getMeta } from './stateUtils';
import { initEvent } from './actions';

export function isState<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(state: object | string): state is State<TContext, TEvent, TTypestate> {
  if (isString(state)) {
    return false;
  }

  return 'value' in state && 'history' in state;
}
export function bindActionToState<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  action: ActionObject<TContext, TEvent>,
  state: State<TContext, TEvent, any>
): ActionObject<TContext, TEvent> {
  const { exec } = action;
  const boundAction: ActionObject<TContext, TEvent> = {
    ...action,
    exec:
      exec !== undefined
        ? () =>
            exec(state.context, state.event as TEvent, {
              action,
              state,
              _event: state._event
            })
        : undefined
  };

  return boundAction;
}

export class State<
  TContext extends MachineContext,
  TEvent extends EventObject = EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
> {
  public value: StateValue;
  public context: TContext;
  public history?: State<TContext, TEvent, TTypestate>;
  public historyValue: HistoryValue<TContext, TEvent> = {};
  public actions: Array<ActionObject<TContext, TEvent>> = [];
  public meta: any = {};
  public event: TEvent;
  public _internalQueue: Array<SCXML.Event<TEvent> | NullEvent> = [];
  public _event: SCXML.Event<TEvent>;
  public _sessionid: string | null;
  /**
   * Indicates whether the state has changed from the previous state. A state is considered "changed" if:
   *
   * - Its value is not equal to its previous value, or:
   * - It has any new actions (side-effects) to execute.
   *
   * An initial state (with no history) will return `undefined`.
   */
  public changed: boolean | undefined;
  /**
   * The enabled state nodes representative of the state value.
   */
  public configuration: Array<StateNode<TContext, TEvent>>;
  /**
   * The next events that will cause a transition from the current state.
   */
  // @ts-ignore - getter for this gets configured in constructor so this property can stay non-enumerable
  public nextEvents: EventType[];
  /**
   * The transition definitions that resulted in this state.
   */
  public transitions: Array<TransitionDefinition<TContext, TEvent>>;
  /**
   * An object mapping actor names to spawned/invoked actors.
   */
  public children: Record<string, ActorRef<any>>;
  public tags: Set<string>;
  /**
   * Creates a new State instance for the given `stateValue` and `context`.
   * @param stateValue
   * @param context
   */
  public static from<
    TContext extends MachineContext,
    TEvent extends EventObject = EventObject
  >(
    stateValue: State<TContext, TEvent, any> | StateValue,
    context: TContext = {} as TContext
  ): State<TContext, TEvent, any> {
    if (stateValue instanceof State) {
      if (stateValue.context !== context) {
        return new State<TContext, TEvent>({
          value: stateValue.value,
          context,
          _event: stateValue._event,
          _sessionid: null,
          history: stateValue.history,
          actions: [],
          meta: {},
          configuration: [], // TODO: fix,
          transitions: [],
          children: {}
        });
      }

      return stateValue;
    }

    const _event = initEvent as SCXML.Event<TEvent>;

    return new State<TContext, TEvent>({
      value: stateValue,
      context,
      _event,
      _sessionid: null,
      history: undefined,
      actions: [],
      meta: undefined,
      configuration: [],
      transitions: [],
      children: {}
    });
  }
  /**
   * Creates a new State instance for the given `config`.
   * @param config The state config
   */
  public static create<
    TContext extends MachineContext,
    TEvent extends EventObject = EventObject
  >(config: StateConfig<TContext, TEvent>): State<TContext, TEvent, any> {
    return new State(config);
  }
  /**
   * Creates a new `State` instance for the given `stateValue` and `context` with no actions (side-effects).
   * @param stateValue
   * @param context
   */
  public static inert<TState extends State<any, any, any>>(
    state: TState
  ): TState;
  public static inert<
    TContext extends MachineContext,
    TEvent extends EventObject = EventObject
  >(stateValue: StateValue, context: TContext): State<TContext, TEvent>;
  public static inert(
    stateValue: State<any, any> | StateValue,
    context?: MachineContext
  ): State<any, any> {
    if (stateValue instanceof State) {
      if (!stateValue.actions.length) {
        return stateValue;
      }
      const _event = initEvent as SCXML.Event<any>;

      return new State<any>({
        value: stateValue.value,
        context: stateValue.context,
        _event,
        _sessionid: null,
        history: stateValue.history,
        configuration: stateValue.configuration,
        transitions: [],
        children: stateValue.children
      });
    }

    return State.from(stateValue, context);
  }

  /**
   * Creates a new `State` instance that represents the current state of a running machine.
   *
   * @param config
   */
  constructor(config: StateConfig<TContext, TEvent>) {
    this.value = config.value;
    this.context = config.context;
    this._event = config._event;
    this._sessionid = config._sessionid;
    this.event = this._event.data;
    this.history = config.history as this;
    this.historyValue = config.historyValue || {};
    this.actions = config.actions || [];
    this.meta = getMeta(config.configuration);
    this.matches = this.matches.bind(this);
    this.toStrings = this.toStrings.bind(this);
    this.configuration = config.configuration;
    this.transitions = config.transitions;
    this.children = config.children;
    this.tags = config.tags ?? new Set();

    Object.defineProperty(this, 'nextEvents', {
      enumerable: false,
      get: () => {
        return nextEvents(this.configuration);
      }
    });
  }

  /**
   * Returns an array of all the string leaf state node paths.
   * @param stateValue
   * @param delimiter The character(s) that separate each subpath in the string state node path.
   */
  public toStrings(
    stateValue: StateValue = this.value,
    delimiter: string = '.'
  ): string[] {
    if (isString(stateValue)) {
      return [stateValue];
    }
    const valueKeys = keys(stateValue);

    return valueKeys.concat(
      ...valueKeys.map((key) =>
        this.toStrings(stateValue[key], delimiter).map(
          (s) => key + delimiter + s
        )
      )
    );
  }

  public toJSON() {
    const { configuration, transitions, tags, ...jsonValues } = this;

    return { ...jsonValues, tags: Array.from(tags) };
  }

  /**
   * Whether the current state value is a subset of the given parent state value.
   * @param parentStateValue
   */
  public matches<TSV extends TTypestate['value']>(
    parentStateValue: TSV
  ): this is State<
    (TTypestate extends any
      ? { value: TSV; context: any } extends TTypestate
        ? TTypestate
        : never
      : never)['context'],
    TEvent,
    TTypestate
  > & { value: TSV } {
    return matchesState(parentStateValue as StateValue, this.value);
  }

  /**
   * Indicates whether the state is a final state.
   */
  public get done(): boolean {
    return isInFinalState(this.configuration);
  }

  /**
   * Whether the current state configuration has a state node with the specified `tag`.
   * @param tag
   */
  public hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }
}
