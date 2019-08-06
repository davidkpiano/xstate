import {
  getEventType,
  toStatePath,
  toStateValue,
  mapValues,
  path,
  toStatePaths,
  pathToStateValue,
  flatten,
  mapFilterValues,
  nestedPath,
  toArray,
  keys,
  isBuiltInEvent,
  partition,
  updateHistoryValue,
  updateContext,
  warn,
  isArray,
  isFunction,
  isString,
  toGuard,
  isMachine,
  toSCXMLEvent,
  toEventObject,
  mapContext
} from './utils';
import {
  Event,
  StateValue,
  TransitionConfig,
  StateTransition,
  StateValueMap,
  MachineOptions,
  ConditionPredicate,
  EventObject,
  HistoryStateNodeConfig,
  HistoryValue,
  StateNodeDefinition,
  TransitionDefinition,
  AssignAction,
  DelayedTransitionDefinition,
  ActivityDefinition,
  StateTypes,
  StateNodeConfig,
  StateSchema,
  TransitionsDefinition,
  StatesDefinition,
  StateNodesConfig,
  ActionTypes,
  RaisedEvent,
  FinalStateNodeConfig,
  InvokeDefinition,
  ActionObject,
  Mapper,
  PropertyMapper,
  SendAction,
  BuiltInEvent,
  Guard,
  GuardPredicate,
  GuardMeta,
  MachineConfig,
  PureAction,
  TransitionTarget,
  InvokeCreator,
  StateMachine,
  DoneEventObject,
  SingleOrArray,
  DefaultContext
} from './types';
import { matchesState } from './utils';
import { State, stateValuesEqual } from './State';
import * as actionTypes from './actionTypes';
import {
  start,
  stop,
  toActivityDefinition,
  send,
  cancel,
  after,
  raise,
  done,
  doneInvoke,
  error,
  toActionObject,
  resolveSend,
  initEvent,
  toActionObjects
} from './actions';
import { IS_PRODUCTION } from './environment';
import { DEFAULT_GUARD_TYPE } from './constants';
import {
  getValue,
  getConfiguration,
  has,
  getChildren,
  getAllStateNodes,
  isInFinalState
} from './stateUtils';

const STATE_DELIMITER = '.';
const NULL_EVENT = '';
const STATE_IDENTIFIER = '#';
const TARGETLESS_KEY = '';
const WILDCARD = '*';

const EMPTY_OBJECT = {};

const isStateId = (str: string) => str[0] === STATE_IDENTIFIER;
const createDefaultOptions = <
  TContext extends DefaultContext
>(): MachineOptions<TContext, any> => ({
  actions: {},
  guards: {},
  services: {},
  activities: {},
  delays: {},
  updater: updateContext
});

class StateNode<
  TContext extends DefaultContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject
> {
  /**
   * The relative key of the state node, which represents its location in the overall state value.
   */
  public key: string;
  /**
   * The unique ID of the state node.
   */
  public id: string;
  /**
   * The machine's own version.
   */
  public version?: string;
  /**
   * The type of this state node:
   *
   *  - `'atomic'` - no child state nodes
   *  - `'compound'` - nested child state nodes (XOR)
   *  - `'parallel'` - orthogonal nested child state nodes (AND)
   *  - `'history'` - history state node
   *  - `'final'` - final state node
   */
  public type: StateTypes;
  /**
   * The string path from the root machine node to this node.
   */
  public path: string[];
  /**
   * The initial state node key.
   */
  public initial?: keyof TStateSchema['states'];
  /**
   * (DEPRECATED) Whether the state node is a parallel state node.
   *
   * Use `type: 'parallel'` instead.
   */
  public parallel?: boolean;
  /**
   * Whether the state node is "transient". A state node is considered transient if it has
   * an immediate transition from a "null event" (empty string), taken upon entering the state node.
   */
  private _transient: boolean;
  /**
   * The child state nodes.
   */
  public states: StateNodesConfig<TContext, TStateSchema, TEvent>;
  /**
   * The type of history exhibited. Can be:
   *
   *  - `'shallow'` - recalls only top-level historical state value
   *  - `'deep'` - recalls historical state value at all levels
   */
  public history: false | 'shallow' | 'deep';
  /**
   * The action(s) to be executed upon entering the state node.
   */
  public onEntry: Array<ActionObject<TContext, TEvent>>; // TODO: deprecate (entry)
  /**
   * The action(s) to be executed upon exiting the state node.
   */
  public onExit: Array<ActionObject<TContext, TEvent>>; // TODO: deprecate (exit)
  /**
   * The activities to be started upon entering the state node,
   * and stopped upon exiting the state node.
   */
  public activities: Array<ActivityDefinition<TContext, TEvent>>;
  public strict: boolean;
  /**
   * The parent state node.
   */
  public parent?: StateNode<TContext, any, TEvent>;
  /**
   * The root machine node.
   */
  public machine: StateNode<TContext, any, TEvent>;
  /**
   * The meta data associated with this state node, which will be returned in State instances.
   */
  public meta?: TStateSchema extends { meta: infer D } ? D : any;
  /**
   * The data sent with the "done.state._id_" event if this is a final state node.
   */
  public data?: Mapper<TContext, TEvent> | PropertyMapper<TContext, TEvent>;
  /**
   * The string delimiter for serializing the path to a string. The default is "."
   */
  public delimiter: string;
  /**
   * The order this state node appears. Corresponds to the implicit SCXML document order.
   */
  public order: number = -1;
  /**
   * The services invoked by this state node.
   */
  public invoke: Array<InvokeDefinition<TContext, TEvent>>;

  public options: MachineOptions<TContext, TEvent>;

  /**
   * The raw config used to create the machine.
   */
  public config: StateNodeConfig<TContext, TStateSchema, TEvent>;

  public __xstatenode: true = true;

  private __cache = {
    events: undefined as Array<TEvent['type']> | undefined,
    relativeValue: new Map() as Map<StateNode<TContext>, StateValue>,
    initialStateValue: undefined as StateValue | undefined,
    initialState: undefined as State<TContext, TEvent> | undefined,
    transitions: undefined as
      | TransitionsDefinition<TContext, TEvent>
      | undefined,
    delayedTransitions: undefined as
      | Array<DelayedTransitionDefinition<TContext, TEvent>>
      | undefined
  };

  private idMap: Record<string, StateNode<TContext, any, TEvent>> = {};

  constructor(
    _config: StateNodeConfig<TContext, TStateSchema, TEvent>,
    options?: Partial<MachineOptions<TContext, TEvent>>,
    /**
     * The initial extended state
     */
    public context: Readonly<TContext> = _config.context || ({} as TContext)
  ) {
    const { parent, ...config } = _config;
    this.config = config;
    this.parent = parent;
    this.options = {
      ...createDefaultOptions<TContext>(),
      ...options
    };
    this.key = _config.key || _config.id || '(machine)';
    this.machine = this.parent ? this.parent.machine : this;
    this.path = this.parent ? this.parent.path.concat(this.key) : [];
    this.delimiter =
      _config.delimiter ||
      (this.parent ? this.parent.delimiter : STATE_DELIMITER);
    this.id =
      _config.id || [this.machine.key, ...this.path].join(this.delimiter);
    this.version = this.parent
      ? this.parent.version
      : (_config as MachineConfig<TContext, TStateSchema, TEvent>).version;
    this.type =
      _config.type ||
      (_config.parallel
        ? 'parallel'
        : _config.states && keys(_config.states).length
        ? 'compound'
        : _config.history
        ? 'history'
        : 'atomic');

    if (!IS_PRODUCTION) {
      warn(
        !('parallel' in _config),
        `The "parallel" property is deprecated and will be removed in version 4.1. ${
          _config.parallel
            ? `Replace with \`type: 'parallel'\``
            : `Use \`type: '${this.type}'\``
        } in the config for state node '${this.id}' instead.`
      );
    }

    this.initial = _config.initial;

    this.states = (_config.states
      ? mapValues(
          _config.states,
          (stateConfig: StateNodeConfig<TContext, any, TEvent>, key) => {
            const stateNode = new StateNode({
              ...stateConfig,
              key,
              parent: this
            });
            Object.assign(this.idMap, {
              [stateNode.id]: stateNode,
              ...stateNode.idMap
            });
            return stateNode;
          }
        )
      : EMPTY_OBJECT) as StateNodesConfig<TContext, TStateSchema, TEvent>;

    // Document order
    let order = 0;

    function dfs(sn: StateNode): void {
      sn.order = order++;

      for (const child of getChildren(sn)) {
        dfs(child);
      }
    }

    dfs(this);

    // History config
    this.history =
      _config.history === true ? 'shallow' : _config.history || false;

    this._transient = !!(_config.on && _config.on[NULL_EVENT]);
    this.strict = !!_config.strict;

    // TODO: deprecate (entry)
    this.onEntry = toArray(_config.entry || _config.onEntry).map(action =>
      toActionObject(action)
    );
    // TODO: deprecate (exit)
    this.onExit = toArray(_config.exit || _config.onExit).map(action =>
      toActionObject(action)
    );
    this.meta = _config.meta;
    this.data =
      this.type === 'final'
        ? (_config as FinalStateNodeConfig<TContext, TEvent>).data
        : undefined;
    this.invoke = toArray(_config.invoke).map((invokeConfig, i) => {
      if (isMachine(invokeConfig)) {
        (this.parent || this).options.services = {
          [invokeConfig.id]: invokeConfig,
          ...(this.parent || this).options.services
        };

        return {
          type: actionTypes.invoke,
          src: invokeConfig.id,
          id: invokeConfig.id
        };
      } else if (typeof invokeConfig.src !== 'string') {
        const invokeSrc = `${this.id}:invocation[${i}]`; // TODO: util function
        this.machine.options.services = {
          [invokeSrc]: invokeConfig.src as InvokeCreator<TContext>,
          ...this.machine.options.services
        };

        return {
          type: actionTypes.invoke,
          id: invokeSrc,
          ...invokeConfig,
          src: invokeSrc
        };
      } else {
        return {
          ...invokeConfig,
          type: actionTypes.invoke,
          id: invokeConfig.id || (invokeConfig.src as string),
          src: invokeConfig.src as string
        };
      }
    });
    this.activities = toArray(_config.activities)
      .concat(this.invoke)
      .map(activity => toActivityDefinition(activity));
  }

  private _init(): void {
    if (this.__cache.transitions) {
      return;
    }
    getAllStateNodes(this).forEach(stateNode => stateNode.on);
  }

  /**
   * Clones this state machine with custom options and context.
   *
   * @param options Options (actions, guards, activities, services) to recursively merge with the existing options.
   * @param context Custom context (will override predefined context)
   */
  public withConfig(
    options: Partial<MachineOptions<TContext, TEvent>>,
    context: TContext | undefined = this.context
  ): StateNode<TContext, TStateSchema, TEvent> {
    const { actions, activities, guards, services, delays } = this.options;

    return new StateNode(
      this.config,
      {
        actions: { ...actions, ...options.actions },
        activities: { ...activities, ...options.activities },
        guards: { ...guards, ...options.guards },
        services: { ...services, ...options.services },
        delays: { ...delays, ...options.delays }
      },
      context
    );
  }

  /**
   * Clones this state machine with custom context.
   *
   * @param context Custom context (will override predefined context, not recursive)
   */
  public withContext(
    context: TContext
  ): StateNode<TContext, TStateSchema, TEvent> {
    return new StateNode(this.config, this.options, context);
  }

  /**
   * The well-structured state node definition.
   */
  public get definition(): StateNodeDefinition<TContext, TStateSchema, TEvent> {
    return {
      id: this.id,
      key: this.key,
      version: this.version,
      type: this.type,
      initial: this.initial,
      history: this.history,
      states: mapValues(
        this.states,
        (state: StateNode<TContext, any, TEvent>) => state.definition
      ) as StatesDefinition<TContext, TStateSchema, TEvent>,
      on: this.on,
      onEntry: this.onEntry,
      onExit: this.onExit,
      activities: this.activities || [],
      meta: this.meta,
      order: this.order || -1,
      data: this.data,
      invoke: this.invoke
    };
  }

  public toJSON() {
    return this.definition;
  }

  /**
   * The mapping of events to transitions.
   */
  public get on(): TransitionsDefinition<TContext, TEvent> {
    return (
      this.__cache.transitions ||
      ((this.__cache.transitions = this.formatTransitions()),
      this.__cache.transitions)
    );
  }

  public get after(): Array<DelayedTransitionDefinition<TContext, TEvent>> {
    return (
      this.__cache.delayedTransitions ||
      ((this.__cache.delayedTransitions = this.getDelayedTransitions()),
      this.__cache.delayedTransitions)
    );
  }

  /**
   * All the transitions that can be taken from this state node.
   */
  public get transitions(): Array<TransitionDefinition<TContext, TEvent>> {
    return flatten(
      keys(this.on).map(
        event => this.on[event] as Array<TransitionDefinition<TContext, TEvent>>
      )
    );
  }

  /**
   * All delayed transitions from the config.
   */
  private getDelayedTransitions(): Array<
    DelayedTransitionDefinition<TContext, TEvent>
  > {
    const afterConfig = this.config.after;
    const { guards } = this.machine.options;

    if (!afterConfig) {
      return [];
    }

    if (isArray(afterConfig)) {
      return afterConfig.map((delayedTransition, i) => {
        const { delay, target } = delayedTransition;
        let delayRef: string | number;

        if (isFunction(delay)) {
          delayRef = `${this.id}:delay[${i}]`;
          this.options.delays[delayRef] = delay; // TODO: util function
        } else {
          delayRef = delay;
        }

        const event = after(delayRef, this.id);

        this.onEntry.push(send(event, { delay }));
        this.onExit.push(cancel(event));

        return {
          event,
          ...delayedTransition,
          source: this,
          target: target === undefined ? undefined : this.resolveTarget(target),
          cond: toGuard(delayedTransition.cond, guards),
          actions: toArray(delayedTransition.actions).map(action =>
            toActionObject(action)
          )
        };
      });
    }

    const allDelayedTransitions = flatten<
      DelayedTransitionDefinition<TContext, TEvent>
    >(
      keys(afterConfig).map(delayKey => {
        const delayedTransition = (afterConfig as Record<
          string,
          | TransitionConfig<TContext, TEvent>
          | Array<TransitionConfig<TContext, TEvent>>
        >)[delayKey];

        const delay = isNaN(+delayKey) ? delayKey : +delayKey;
        const event = after(delay, this.id);

        this.onEntry.push(send<TContext, TEvent>(event, { delay }));
        this.onExit.push(cancel(event));

        if (isString(delayedTransition)) {
          return [
            {
              source: this,
              target: this.resolveTarget(delayedTransition),
              delay,
              event,
              actions: []
            }
          ];
        }

        const delayedTransitions = toArray(delayedTransition);

        return delayedTransitions.map(transition => ({
          event,
          delay,
          ...transition,
          source: this,
          target:
            transition.target === undefined
              ? transition.target
              : this.resolveTarget(transition.target),
          cond: toGuard(transition.cond, guards),
          actions: toArray(transition.actions).map(action =>
            toActionObject(action)
          )
        }));
      })
    );

    allDelayedTransitions.sort((a, b) =>
      isString(a) || isString(b) ? 0 : +a.delay - +b.delay
    );

    return allDelayedTransitions;
  }

  /**
   * Returns the state nodes represented by the current state value.
   *
   * @param state The state value or State instance
   */
  public getStateNodes(
    state: StateValue | State<TContext, TEvent>
  ): Array<StateNode<TContext, any, TEvent>> {
    if (!state) {
      return [];
    }
    const stateValue =
      state instanceof State
        ? state.value
        : toStateValue(state, this.delimiter);

    if (isString(stateValue)) {
      const initialStateValue = this.getStateNode(stateValue).initial;

      return initialStateValue !== undefined
        ? this.getStateNodes({ [stateValue]: initialStateValue } as StateValue)
        : [this.states[stateValue]];
    }

    const subStateKeys = keys(stateValue);
    const subStateNodes: Array<
      StateNode<TContext, any, TEvent>
    > = subStateKeys.map(subStateKey => this.getStateNode(subStateKey));

    return subStateNodes.concat(
      subStateKeys.reduce(
        (allSubStateNodes, subStateKey) => {
          const subStateNode = this.getStateNode(subStateKey).getStateNodes(
            stateValue[subStateKey]
          );

          return allSubStateNodes.concat(subStateNode);
        },
        [] as Array<StateNode<TContext, any, TEvent>>
      )
    );
  }

  /**
   * Returns `true` if this state node explicitly handles the given event.
   *
   * @param event The event in question
   */
  public handles(event: Event<TEvent>): boolean {
    const eventType = getEventType<TEvent>(event);

    return this.events.indexOf(eventType) !== -1;
  }

  /**
   * Resolves the given `state` to a new `State` instance relative to this machine.
   *
   * This ensures that `.events` and `.nextEvents` represent the correct values.
   *
   * @param state The state to resolve
   */
  public resolveState(state: State<TContext, TEvent>): State<TContext, TEvent> {
    const configuration = Array.from(
      getConfiguration([], this.getStateNodes(state.value))
    );
    return new State({
      ...state,
      value: this.resolve(state.value),
      configuration
    });
  }

  private transitionLeafNode(
    stateValue: string,
    state: State<TContext, TEvent>,
    eventObject: TEvent
  ): StateTransition<TContext, TEvent> | undefined {
    const stateNode = this.getStateNode(stateValue);
    const next = stateNode.next(state, eventObject);

    if (!next || !next.transitions.length) {
      return this.next(state, eventObject);
    }

    return next;
  }
  private transitionCompoundNode(
    stateValue: StateValueMap,
    state: State<TContext, TEvent>,
    eventObject: TEvent
  ): StateTransition<TContext, TEvent> | undefined {
    const subStateKeys = keys(stateValue);

    const stateNode = this.getStateNode(subStateKeys[0]);
    const next = stateNode._transition(
      stateValue[subStateKeys[0]],
      state,
      eventObject
    );

    if (!next || !next.transitions.length) {
      return this.next(state, eventObject);
    }

    return next;
  }
  private transitionParallelNode(
    stateValue: StateValueMap,
    state: State<TContext, TEvent>,
    eventObject: TEvent
  ): StateTransition<TContext, TEvent> | undefined {
    const transitionMap: Record<string, StateTransition<TContext, TEvent>> = {};

    for (const subStateKey of keys(stateValue)) {
      const subStateValue = stateValue[subStateKey];

      if (!subStateValue) {
        continue;
      }

      const subStateNode = this.getStateNode(subStateKey);
      const next = subStateNode._transition(subStateValue, state, eventObject);
      if (next) {
        transitionMap[subStateKey] = next;
      }
    }

    const stateTransitions = keys(transitionMap).map(key => transitionMap[key]);
    const enabledTransitions = flatten(
      stateTransitions.map(st => st.transitions)
    );

    const willTransition = stateTransitions.some(
      st => st.transitions.length > 0
    );

    if (!willTransition) {
      return this.next(state, eventObject);
    }
    const entryNodes = flatten(stateTransitions.map(t => t.entrySet));

    const configuration = flatten(
      keys(transitionMap).map(key => transitionMap[key].configuration)
    );

    return {
      transitions: enabledTransitions,
      entrySet: entryNodes,
      exitSet: flatten(stateTransitions.map(t => t.exitSet)),
      configuration,
      source: state,
      actions: flatten(
        keys(transitionMap).map(key => {
          return transitionMap[key].actions;
        })
      )
    };
  }
  private _transition(
    stateValue: StateValue,
    state: State<TContext, TEvent>,
    event: TEvent
  ): StateTransition<TContext, TEvent> | undefined {
    // leaf node
    if (isString(stateValue)) {
      return this.transitionLeafNode(stateValue, state, event);
    }

    // hierarchical node
    if (keys(stateValue).length === 1) {
      return this.transitionCompoundNode(stateValue, state, event);
    }

    // orthogonal node
    return this.transitionParallelNode(stateValue, state, event);
  }
  private next(
    state: State<TContext, TEvent>,
    eventObject: TEvent
  ): StateTransition<TContext, TEvent> | undefined {
    const eventType = eventObject.type;
    const candidates = this.on[eventType as TEvent['type']] || [];
    const hasWildcard = this.on[WILDCARD];

    if (!candidates.length && !hasWildcard) {
      return {
        transitions: [],
        entrySet: [],
        exitSet: [],
        configuration: [],
        source: state,
        actions: []
      };
    }

    const actions: Array<ActionObject<TContext, TEvent>> = [];

    let nextStateStrings: Array<StateNode<TContext>> = [];
    let selectedTransition: TransitionDefinition<TContext, TEvent> | undefined;

    const allCandidates = hasWildcard
      ? candidates.concat(this.on['*'])
      : candidates;

    for (const candidate of allCandidates) {
      const { cond, in: stateIn } = candidate;
      const resolvedContext = state.context;

      const isInState = stateIn
        ? isString(stateIn) && isStateId(stateIn)
          ? // Check if in state by ID
            state.matches(
              toStateValue(this.getStateNodeById(stateIn).path, this.delimiter)
            )
          : // Check if in state by relative grandparent
            matchesState(
              toStateValue(stateIn, this.delimiter),
              path(this.path.slice(0, -2))(state.value)
            )
        : true;

      let guardPassed = false;

      try {
        guardPassed =
          !cond ||
          this.evaluateGuard(cond, resolvedContext, eventObject, state);
      } catch (err) {
        throw new Error(
          `Unable to evaluate guard '${cond!.name ||
            cond!
              .type}' in transition for event '${eventType}' in state node '${
            this.id
          }':\n${err.message}`
        );
      }

      if (guardPassed && isInState) {
        if (candidate.target !== undefined) {
          nextStateStrings = candidate.target;
        }
        actions.push(...candidate.actions);
        selectedTransition = candidate;
        break;
      }
    }

    if (!nextStateStrings.length) {
      return {
        transitions: selectedTransition ? [selectedTransition] : [],
        entrySet:
          selectedTransition && selectedTransition.internal ? [] : [this],
        exitSet:
          selectedTransition && selectedTransition.internal ? [] : [this],
        configuration: selectedTransition && state.value ? [this] : [],
        source: state,
        actions
      };
    }

    const nextStateNodes = flatten(
      nextStateStrings.map(stateNode => {
        return this.getRelativeStateNodes(stateNode, state.historyValue);
      })
    );

    const refinedSelectedTransition = selectedTransition as TransitionDefinition<
      TContext,
      TEvent
    >;
    const isInternal = !!refinedSelectedTransition.internal;

    const reentryNodes = isInternal
      ? []
      : flatten(nextStateNodes.map(n => this.nodesFromChild(n)));

    return {
      transitions: [refinedSelectedTransition],
      entrySet: reentryNodes,
      exitSet: isInternal ? [] : [this],
      configuration: nextStateNodes,
      source: state,
      actions
    };
  }

  private nodesFromChild(
    childStateNode: StateNode<TContext>
  ): Array<StateNode<TContext>> {
    if (childStateNode.escapes(this)) {
      return [];
    }

    const nodes: Array<StateNode<TContext>> = [];
    let marker: StateNode<TContext> | undefined = childStateNode;

    while (marker && marker !== this) {
      nodes.push(marker);
      marker = marker.parent;
    }
    nodes.push(this); // inclusive

    return nodes;
  }

  /**
   * Whether the given state node "escapes" this state node. If the `stateNode` is equal to or the parent of
   * this state node, it does not escape.
   */
  private escapes(stateNode: StateNode): boolean {
    if (this === stateNode) {
      return false;
    }

    let parent = this.parent;

    while (parent) {
      if (parent === stateNode) {
        return false;
      }
      parent = parent.parent;
    }

    return true;
  }
  private evaluateGuard(
    guard: Guard<TContext, TEvent>,
    context: TContext,
    eventObject: TEvent,
    state: State<TContext, TEvent>
  ): boolean {
    let condFn: ConditionPredicate<TContext, TEvent>;
    const { guards } = this.machine.options;
    const guardMeta: GuardMeta<TContext, TEvent> = {
      state,
      cond: guard,
      _event: toSCXMLEvent(eventObject)
    };

    // TODO: do not hardcode!
    if (guard.type === DEFAULT_GUARD_TYPE) {
      return (guard as GuardPredicate<TContext, TEvent>).predicate(
        context,
        eventObject,
        guardMeta
      );
    }

    if (!guards[guard.type]) {
      throw new Error(
        `Guard '${guard.type}' is not implemented on machine '${this.machine.id}'.`
      );
    }

    condFn = guards[guard.type];

    return condFn(context, eventObject, guardMeta);
  }

  private getActions(
    transition: StateTransition<TContext, TEvent>,
    currentContext: TContext,
    eventObject: TEvent,
    prevState?: State<TContext>
  ): Array<ActionObject<TContext, TEvent>> {
    const prevConfig = prevState
      ? getConfiguration([], this.getStateNodes(prevState.value))
      : getConfiguration([], [this]);
    const resolvedConfig = transition.configuration.length
      ? getConfiguration(prevConfig, transition.configuration)
      : prevConfig;

    for (const sn of resolvedConfig) {
      if (!has(prevConfig, sn)) {
        transition.entrySet.push(sn);
      }
    }
    for (const sn of prevConfig) {
      if (!has(resolvedConfig, sn) || has(transition.exitSet, sn.parent)) {
        transition.exitSet.push(sn);
      }
    }

    if (!transition.source) {
      transition.exitSet = [];

      // Ensure that root StateNode (machine) is entered
      transition.entrySet.push(this);
    }

    const doneEvents = flatten(
      transition.entrySet.map(sn => {
        const events: DoneEventObject[] = [];

        if (sn.type !== 'final') {
          return events;
        }

        const parent = sn.parent!;

        events.push(
          done(sn.id, sn.data), // TODO: deprecate - final states should not emit done events for their own state.
          done(
            parent.id,
            sn.data
              ? mapContext(sn.data, currentContext, eventObject)
              : undefined
          )
        );

        if (parent.parent) {
          const grandparent = parent.parent;

          if (grandparent.type === 'parallel') {
            if (
              getChildren(grandparent).every(parentNode =>
                isInFinalState(transition.configuration, parentNode)
              )
            ) {
              events.push(done(grandparent.id, grandparent.data));
            }
          }
        }

        return events;
      })
    );

    transition.exitSet.sort((a, b) => b.order - a.order);
    transition.entrySet.sort((a, b) => a.order - b.order);

    const entryStates = new Set(transition.entrySet);
    const exitStates = new Set(transition.exitSet);

    const [entryActions, exitActions] = [
      flatten(
        Array.from(entryStates).map(stateNode => {
          return [
            ...stateNode.activities.map(activity => start(activity)),
            ...stateNode.onEntry
          ];
        })
      ).concat(doneEvents.map(raise)),
      flatten(
        Array.from(exitStates).map(stateNode => [
          ...stateNode.onExit,
          ...stateNode.activities.map(activity => stop(activity))
        ])
      )
    ];

    const actions = toActionObjects(
      exitActions.concat(transition.actions).concat(entryActions),
      this.machine.options.actions
    ) as Array<ActionObject<TContext, TEvent>>;

    return actions;
  }

  /**
   * Determines the next state given the current `state` and sent `event`.
   *
   * @param state The current State instance or state value
   * @param event The event that was sent at the current state
   * @param context The current context (extended state) of the current state
   */
  public transition(
    state: StateValue | State<TContext, TEvent>,
    event: TEvent | TEvent['type'],
    context?: TContext
  ): State<TContext, TEvent, TStateSchema> {
    let currentState: State<TContext, TEvent>;

    if (state instanceof State) {
      currentState =
        context === undefined
          ? state
          : this.resolveState(State.from(state, context));
    } else {
      const resolvedStateValue = isString(state)
        ? this.resolve(pathToStateValue(this.getResolvedPath(state)))
        : this.resolve(state);
      const resolvedContext = context ? context : this.machine.context!;

      currentState = this.resolveState(
        State.from<TContext, TEvent>(resolvedStateValue, resolvedContext)
      );
    }

    const eventObject = toEventObject(event);
    const eventType = eventObject.type;

    if (!IS_PRODUCTION && eventType === WILDCARD) {
      throw new Error("An event cannot have the wildcard type ('*')");
    }

    if (this.strict) {
      if (this.events.indexOf(eventType) === -1 && !isBuiltInEvent(eventType)) {
        throw new Error(
          `Machine '${this.id}' does not accept event '${eventType}'`
        );
      }
    }

    const stateTransition = this._transition(
      currentState.value,
      currentState,
      eventObject
    ) || {
      transitions: [],
      configuration: [],
      entrySet: [],
      exitSet: [],
      source: currentState,
      actions: []
    };

    const prevConfig = getConfiguration(
      [],
      this.getStateNodes(currentState.value)
    );
    const resolvedConfig = stateTransition.configuration.length
      ? getConfiguration(prevConfig, stateTransition.configuration)
      : prevConfig;

    stateTransition.configuration = [...resolvedConfig];

    return this.resolveTransition(stateTransition, currentState, eventObject);
  }
  private resolveTransition(
    stateTransition: StateTransition<TContext, TEvent>,
    currentState?: State<TContext, TEvent>,
    _eventObject?: TEvent,
    context: TContext = this.machine.context!
  ): State<TContext, TEvent> {
    const { configuration } = stateTransition;
    // Transition will "apply" if:
    // - this is the initial state (there is no current state)
    // - OR there are transitions
    const willTransition =
      !currentState || stateTransition.transitions.length > 0;
    const resolvedStateValue = willTransition
      ? getValue(this.machine, configuration)
      : undefined;
    const historyValue = currentState
      ? currentState.historyValue
        ? currentState.historyValue
        : stateTransition.source
        ? (this.machine.historyValue(currentState.value) as HistoryValue)
        : undefined
      : undefined;
    const currentContext = currentState ? currentState.context : context;
    const eventObject = _eventObject || ({ type: ActionTypes.Init } as TEvent);
    const actions = this.getActions(
      stateTransition,
      currentContext,
      eventObject,
      currentState
    );
    const activities = currentState ? { ...currentState.activities } : {};
    for (const action of actions) {
      if (action.type === actionTypes.start) {
        activities[action.activity!.type] = action as ActivityDefinition<
          TContext,
          TEvent
        >;
      } else if (action.type === actionTypes.stop) {
        activities[action.activity!.type] = false;
      }
    }

    const [raisedEvents, otherActions] = partition(
      actions,
      (action): action is BuiltInEvent<TEvent> =>
        action.type === actionTypes.raise ||
        action.type === actionTypes.nullEvent
    );

    const [assignActions, nonEventActions] = partition(
      otherActions,
      (action): action is AssignAction<TContext, TEvent> =>
        action.type === actionTypes.assign
    );

    const updatedContext = assignActions.length
      ? this.options.updater(
          currentContext,
          eventObject,
          assignActions,
          currentState
        )
      : currentContext;

    const resolvedActions = flatten(
      nonEventActions.map(actionObject => {
        if (actionObject.type === actionTypes.send) {
          const sendAction = resolveSend(
            actionObject as SendAction<TContext, TEvent>,
            updatedContext,
            eventObject || { type: ActionTypes.Init }
          ) as ActionObject<TContext, TEvent>; // TODO: fix ActionTypes.Init

          if (isString(sendAction.delay)) {
            if (
              !this.machine.options.delays ||
              this.machine.options.delays[sendAction.delay] === undefined
            ) {
              if (!IS_PRODUCTION) {
                warn(
                  false,
                  // tslint:disable-next-line:max-line-length
                  `No delay reference for delay expression '${sendAction.delay}' was found on machine '${this.machine.id}'`
                );
              }

              // Do not send anything
              return sendAction;
            }

            const delayExpr = this.machine.options.delays[sendAction.delay];
            sendAction.delay =
              typeof delayExpr === 'number'
                ? delayExpr
                : delayExpr(
                    updatedContext,
                    eventObject || { type: ActionTypes.Init }
                  );
          }

          return sendAction;
        }

        if (actionObject.type === ActionTypes.Pure) {
          return (
            (actionObject as PureAction<TContext, TEvent>).get(
              updatedContext,
              eventObject
            ) || []
          );
        }

        return toActionObject(actionObject, this.options.actions);
      })
    );

    const stateNodes = resolvedStateValue
      ? this.getStateNodes(resolvedStateValue)
      : [];

    const isTransient = stateNodes.some(stateNode => stateNode._transient);
    if (isTransient) {
      raisedEvents.push({ type: actionTypes.nullEvent });
    }

    const meta = [this, ...stateNodes].reduce(
      (acc, stateNode) => {
        if (stateNode.meta !== undefined) {
          acc[stateNode.id] = stateNode.meta;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    const nextState = new State<TContext, TEvent>({
      value: resolvedStateValue || currentState!.value,
      context: updatedContext,
      event: eventObject || initEvent,
      _event: toSCXMLEvent(eventObject),
      historyValue: resolvedStateValue
        ? historyValue
          ? updateHistoryValue(historyValue, resolvedStateValue)
          : undefined
        : currentState
        ? currentState.historyValue
        : undefined,
      history:
        !resolvedStateValue || stateTransition.source
          ? currentState
          : undefined,
      actions: resolvedStateValue ? resolvedActions : [],
      activities: resolvedStateValue
        ? activities
        : currentState
        ? currentState.activities
        : {},
      meta: resolvedStateValue
        ? meta
        : currentState
        ? currentState.meta
        : undefined,
      events: resolvedStateValue ? (raisedEvents as TEvent[]) : [],
      configuration: resolvedStateValue
        ? stateTransition.configuration
        : currentState
        ? currentState.configuration
        : []
    });

    nextState.changed =
      eventObject.type === actionTypes.update || !!assignActions.length;

    // Dispose of penultimate histories to prevent memory leaks
    const { history } = nextState;
    if (history) {
      delete history.history;
    }

    if (!resolvedStateValue) {
      return nextState;
    }

    let maybeNextState = nextState;
    while (raisedEvents.length) {
      const currentActions = maybeNextState.actions;
      const raisedEvent = raisedEvents.shift()!;

      maybeNextState = this.transition(
        maybeNextState,
        (raisedEvent.type === actionTypes.nullEvent
          ? raisedEvent
          : (raisedEvent as RaisedEvent<TEvent>).event) as TEvent,
        maybeNextState.context
      );
      // Save original event to state
      maybeNextState.event = eventObject;
      maybeNextState.actions.unshift(...currentActions);
    }

    // Detect if state changed
    const changed =
      maybeNextState.changed ||
      (history
        ? !!maybeNextState.actions.length ||
          !!assignActions.length ||
          typeof history.value !== typeof maybeNextState.value ||
          !stateValuesEqual(maybeNextState.value, history.value)
        : undefined);

    maybeNextState.changed = changed;

    // Preserve original history after raised events
    maybeNextState.historyValue = nextState.historyValue;
    maybeNextState.history = history;

    return maybeNextState;
  }

  /**
   * Returns the child state node from its relative `stateKey`, or throws.
   */
  public getStateNode(stateKey: string): StateNode<TContext, any, TEvent> {
    if (isStateId(stateKey)) {
      return this.machine.getStateNodeById(stateKey);
    }

    if (!this.states) {
      throw new Error(
        `Unable to retrieve child state '${stateKey}' from '${this.id}'; no child states exist.`
      );
    }

    const result = this.states[stateKey];
    if (!result) {
      throw new Error(
        `Child state '${stateKey}' does not exist on '${this.id}'`
      );
    }

    return result;
  }

  /**
   * Returns the state node with the given `stateId`, or throws.
   *
   * @param stateId The state ID. The prefix "#" is removed.
   */
  public getStateNodeById(stateId: string): StateNode<TContext, any, TEvent> {
    const resolvedStateId = isStateId(stateId)
      ? stateId.slice(STATE_IDENTIFIER.length)
      : stateId;

    if (resolvedStateId === this.id) {
      return this;
    }

    const stateNode = this.machine.idMap[resolvedStateId];

    if (!stateNode) {
      throw new Error(
        `Child state node '#${resolvedStateId}' does not exist on machine '${this.id}'`
      );
    }

    return stateNode;
  }

  /**
   * Returns the relative state node from the given `statePath`, or throws.
   *
   * @param statePath The string or string array relative path to the state node.
   */
  public getStateNodeByPath(
    statePath: string | string[]
  ): StateNode<TContext, any, TEvent> {
    if (typeof statePath === 'string' && isStateId(statePath)) {
      try {
        return this.getStateNodeById(statePath.slice(1));
      } catch (e) {
        // try individual paths
        // throw e;
      }
    }

    const arrayStatePath = toStatePath(statePath, this.delimiter).slice();
    let currentStateNode: StateNode<TContext, any, TEvent> = this;
    while (arrayStatePath.length) {
      const key = arrayStatePath.shift()!;

      if (!key.length) {
        break;
      }

      currentStateNode = currentStateNode.getStateNode(key);
    }

    return currentStateNode;
  }

  /**
   * Resolves a partial state value with its full representation in this machine.
   *
   * @param stateValue The partial state value to resolve.
   */
  public resolve(stateValue: StateValue): StateValue {
    if (!stateValue) {
      return this.initialStateValue || EMPTY_OBJECT; // TODO: type-specific properties
    }

    switch (this.type) {
      case 'parallel':
        return mapValues(
          this.initialStateValue as Record<string, StateValue>,
          (subStateValue, subStateKey) => {
            return subStateValue
              ? this.getStateNode(subStateKey).resolve(
                  stateValue[subStateKey] || subStateValue
                )
              : EMPTY_OBJECT;
          }
        );

      case 'compound':
        if (isString(stateValue)) {
          const subStateNode = this.getStateNode(stateValue);

          if (
            subStateNode.type === 'parallel' ||
            subStateNode.type === 'compound'
          ) {
            return { [stateValue]: subStateNode.initialStateValue! };
          }

          return stateValue;
        }
        if (!keys(stateValue).length) {
          return this.initialStateValue || {};
        }

        return mapValues(stateValue, (subStateValue, subStateKey) => {
          return subStateValue
            ? this.getStateNode(subStateKey).resolve(subStateValue)
            : EMPTY_OBJECT;
        });

      default:
        return stateValue || EMPTY_OBJECT;
    }
  }

  private get resolvedStateValue(): StateValue {
    const { key } = this;

    if (this.type === 'parallel') {
      return {
        [key]: mapFilterValues<StateNode<TContext, any, TEvent>, StateValue>(
          this.states,
          stateNode => stateNode.resolvedStateValue[stateNode.key],
          stateNode => !(stateNode.type === 'history')
        )
      };
    }

    if (this.initial === undefined) {
      // If leaf node, value is just the state node's key
      return key;
    }

    if (!this.states[this.initial]) {
      throw new Error(`Initial state '${this.initial}' not found on '${key}'`);
    }

    return {
      [key]: this.states[this.initial].resolvedStateValue
    };
  }
  private getResolvedPath(stateIdentifier: string): string[] {
    if (isStateId(stateIdentifier)) {
      const stateNode = this.machine.idMap[
        stateIdentifier.slice(STATE_IDENTIFIER.length)
      ];

      if (!stateNode) {
        throw new Error(`Unable to find state node '${stateIdentifier}'`);
      }

      return stateNode.path;
    }

    return toStatePath(stateIdentifier, this.delimiter);
  }
  private get initialStateValue(): StateValue | undefined {
    if (this.__cache.initialStateValue) {
      return this.__cache.initialStateValue;
    }

    const initialStateValue = (this.type === 'parallel'
      ? mapFilterValues(
          this.states as Record<string, StateNode<TContext, any, TEvent>>,
          state => state.initialStateValue || EMPTY_OBJECT,
          stateNode => !(stateNode.type === 'history')
        )
      : isString(this.resolvedStateValue)
      ? undefined
      : this.resolvedStateValue[this.key]) as StateValue;

    this.__cache.initialStateValue = initialStateValue;

    return this.__cache.initialStateValue;
  }

  public getInitialState(
    stateValue: StateValue,
    context?: TContext
  ): State<TContext, TEvent> {
    const configuration = this.getStateNodes(stateValue);

    return this.resolveTransition(
      {
        configuration,
        entrySet: configuration,
        exitSet: [],
        transitions: [],
        source: undefined,
        actions: []
      },
      undefined,
      undefined,
      context
    );
  }

  /**
   * The initial State instance, which includes all actions to be executed from
   * entering the initial state.
   */
  public get initialState(): State<TContext, TEvent, TStateSchema> {
    this._init();
    const { initialStateValue } = this;

    if (!initialStateValue) {
      throw new Error(
        `Cannot retrieve initial state from simple state '${this.id}'.`
      );
    }

    return this.getInitialState(initialStateValue);
  }

  /**
   * The target state value of the history state node, if it exists. This represents the
   * default state value to transition to if no history value exists yet.
   */
  public get target(): StateValue | undefined {
    let target;
    if (this.type === 'history') {
      const historyConfig = this.config as HistoryStateNodeConfig<
        TContext,
        TEvent
      >;
      if (historyConfig.target && isString(historyConfig.target)) {
        target = isStateId(historyConfig.target)
          ? pathToStateValue(
              this.machine
                .getStateNodeById(historyConfig.target)
                .path.slice(this.path.length - 1)
            )
          : historyConfig.target;
      } else {
        target = historyConfig.target;
      }
    }

    return target;
  }

  public getStates(stateValue: StateValue): Array<StateNode<TContext>> {
    if (isString(stateValue)) {
      return [this.states[stateValue]];
    }

    const stateNodes: Array<StateNode<TContext>> = [];

    for (const key of keys(stateValue)) {
      stateNodes.push(...this.states[key].getStates(stateValue[key]));
    }

    return stateNodes;
  }

  /**
   * Returns the leaf nodes from a state path relative to this state node.
   *
   * @param relativeStateId The relative state path to retrieve the state nodes
   * @param history The previous state to retrieve history
   * @param resolve Whether state nodes should resolve to initial child state nodes
   */
  public getRelativeStateNodes(
    relativeStateId: StateNode<TContext>,
    historyValue?: HistoryValue,
    resolve: boolean = true
  ): Array<StateNode<TContext>> {
    return resolve
      ? relativeStateId.type === 'history'
        ? relativeStateId.resolveHistory(historyValue)
        : relativeStateId.initialStateNodes
      : [relativeStateId];
  }
  public get initialStateNodes(): Array<StateNode<TContext, any, TEvent>> {
    if (this.type === 'atomic' || this.type === 'final') {
      return [this];
    }

    // Case when state node is compound but no initial state is defined
    if (this.type === 'compound' && !this.initial) {
      if (!IS_PRODUCTION) {
        warn(false, `Compound state node '${this.id}' has no initial state.`);
      }
      return [this];
    }

    const initialStateNodePaths = toStatePaths(this.initialStateValue!);
    return flatten(
      initialStateNodePaths.map(initialPath =>
        this.getFromRelativePath(initialPath)
      )
    );
  }
  /**
   * Retrieves state nodes from a relative path to this state node.
   *
   * @param relativePath The relative path from this state node
   * @param historyValue
   */
  public getFromRelativePath(
    relativePath: string[],
    historyValue?: HistoryValue
  ): Array<StateNode<TContext, any, TEvent>> {
    if (!relativePath.length) {
      return [this];
    }

    const [stateKey, ...childStatePath] = relativePath;

    if (!this.states) {
      throw new Error(
        `Cannot retrieve subPath '${stateKey}' from node with no states`
      );
    }

    const childStateNode = this.getStateNode(stateKey);

    if (childStateNode.type === 'history') {
      return childStateNode.resolveHistory(historyValue);
    }

    if (!this.states[stateKey]) {
      throw new Error(
        `Child state '${stateKey}' does not exist on '${this.id}'`
      );
    }

    return this.states[stateKey].getFromRelativePath(
      childStatePath,
      historyValue
    );
  }

  private historyValue(
    relativeStateValue?: StateValue | undefined
  ): HistoryValue | undefined {
    if (!keys(this.states).length) {
      return undefined;
    }

    return {
      current: relativeStateValue || this.initialStateValue,
      states: mapFilterValues<
        StateNode<TContext, any, TEvent>,
        HistoryValue | undefined
      >(
        this.states,
        (stateNode, key) => {
          if (!relativeStateValue) {
            return stateNode.historyValue();
          }

          const subStateValue = isString(relativeStateValue)
            ? undefined
            : relativeStateValue[key];

          return stateNode.historyValue(
            subStateValue || stateNode.initialStateValue
          );
        },
        stateNode => !stateNode.history
      )
    };
  }
  /**
   * Resolves to the historical value(s) of the parent state node,
   * represented by state nodes.
   *
   * @param historyValue
   */
  private resolveHistory(
    historyValue?: HistoryValue
  ): Array<StateNode<TContext, any, TEvent>> {
    if (this.type !== 'history') {
      return [this];
    }

    const parent = this.parent!;

    if (!historyValue) {
      return this.target
        ? flatten(
            toStatePaths(this.target).map(relativeChildPath =>
              parent.getFromRelativePath(relativeChildPath)
            )
          )
        : parent.initialStateNodes;
    }

    const subHistoryValue = nestedPath<HistoryValue>(parent.path, 'states')(
      historyValue
    ).current;

    if (isString(subHistoryValue)) {
      return [parent.getStateNode(subHistoryValue)];
    }

    return flatten(
      toStatePaths(subHistoryValue!).map(subStatePath => {
        return this.history === 'deep'
          ? parent.getFromRelativePath(subStatePath)
          : [parent.states[subStatePath[0]]];
      })
    );
  }

  /**
   * All the state node IDs of this state node and its descendant state nodes.
   */
  public get stateIds(): string[] {
    const childStateIds = flatten(
      keys(this.states).map(stateKey => {
        return this.states[stateKey].stateIds;
      })
    );
    return [this.id].concat(childStateIds);
  }

  /**
   * All the event types accepted by this state node and its descendants.
   */
  public get events(): Array<TEvent['type']> {
    if (this.__cache.events) {
      return this.__cache.events;
    }
    const { states } = this;
    const events = new Set(this.ownEvents);

    if (states) {
      for (const stateId of keys(states)) {
        const state = states[stateId];
        if (state.states) {
          for (const event of state.events) {
            events.add(`${event}`);
          }
        }
      }
    }

    return (this.__cache.events = Array.from(events));
  }

  /**
   * All the events that have transitions directly from this state node.
   *
   * Excludes any inert events.
   */
  public get ownEvents(): Array<TEvent['type']> {
    const events = new Set(
      keys(this.on).filter(key => {
        const transitions = this.on[key];
        return transitions.some(transition => {
          return !(
            !transition.target &&
            !transition.actions.length &&
            transition.internal
          );
        });
      })
    );

    return Array.from(events);
  }
  private resolveTarget(
    _target: SingleOrArray<string | StateNode<TContext>>,
    internal: boolean = false
  ): Array<StateNode<TContext>> {
    const targets = toArray(_target);
    return flatten(
      targets.map(target => {
        if (!isString(target)) {
          return [target];
        }

        const isInternalTarget = target[0] === this.delimiter;
        internal = internal === undefined ? isInternalTarget : internal;

        // If internal target is defined on machine,
        // do not include machine key on target
        if (isInternalTarget && !this.parent) {
          return [this.getStateNodeByPath(target.slice(1))];
        }

        const resolvedTarget = isInternalTarget ? this.key + target : target;

        if (this.parent) {
          try {
            const targetStateNode = this.parent.getStateNodeByPath(
              resolvedTarget
            );
            return [targetStateNode];
          } catch (err) {
            throw new Error(
              `Invalid transition definition for state node '${this.id}':\n${err.message}`
            );
          }
        } else {
          return [this.getStateNodeByPath(resolvedTarget)];
        }
      })
    );
  }

  private formatTransition(
    target: TransitionTarget<TContext> | undefined,
    transitionConfig: TransitionConfig<TContext, TEvent> | undefined,
    event: string
  ): TransitionDefinition<TContext, TEvent> {
    let internal = transitionConfig ? transitionConfig.internal : undefined;
    const targets = toArray(target);
    const { guards } = this.machine.options;

    // Format targets to their full string path
    const formattedTargets = targets.map(_target => {
      if (!isString(_target)) {
        return _target;
      }

      const isInternalTarget = _target[0] === this.delimiter;
      internal = internal === undefined ? isInternalTarget : internal;

      // If internal target is defined on machine,
      // do not include machine key on target
      if (isInternalTarget) {
        return this.getStateNodeByPath(_target.slice(1));
      }

      const resolvedTarget = isInternalTarget
        ? this.key + _target
        : `${_target}`;

      if (this.parent) {
        try {
          const targetStateNode = this.parent.getStateNodeByPath(
            resolvedTarget
          );
          return targetStateNode;
        } catch (err) {
          throw new Error(
            `Invalid transition definition for state node '${this.id}' on event '${event}':\n${err.message}`
          );
        }
      } else {
        return this.getStateNodeByPath(resolvedTarget);
      }
    });

    if (transitionConfig === undefined) {
      return {
        target: target === undefined ? undefined : formattedTargets,
        source: this,
        actions: [],
        internal: target === undefined || internal,
        event
      };
    }

    // Check if there is no target (targetless)
    // An undefined transition signals that the state node should not transition from that event.
    const isTargetless = target === undefined || target === TARGETLESS_KEY;

    return {
      ...transitionConfig,
      actions: toActionObjects(toArray(transitionConfig.actions)),
      cond: toGuard(transitionConfig.cond, guards),
      target: isTargetless ? undefined : formattedTargets,
      source: this,
      internal: (isTargetless && internal === undefined) || internal,
      event
    };
  }
  private formatTransitions(): TransitionsDefinition<TContext, TEvent> {
    const onConfig = this.config.on;
    const doneConfig = this.config.onDone
      ? {
          [`${done(this.id)}`]: this.config.onDone
        }
      : undefined;
    const invokeConfig = this.invoke.reduce(
      (acc, invokeDef) => {
        if (invokeDef.onDone) {
          acc[doneInvoke(invokeDef.id)] = invokeDef.onDone;
        }
        if (invokeDef.onError) {
          acc[error(invokeDef.id)] = invokeDef.onError;
        }
        return acc;
      },
      {} as any
    );

    const delayedTransitions = this.after;

    const formattedTransitions: TransitionsDefinition<
      TContext,
      TEvent
    > = mapValues(
      { ...onConfig, ...doneConfig, ...invokeConfig },
      (
        value:
          | TransitionConfig<TContext, TEvent>
          | string
          | StateMachine<any, any, any>
          | undefined,
        event
      ) => {
        if (value === undefined) {
          return [{ target: undefined, event, actions: [], internal: true }];
        }

        const transitions = toArray(value);

        if (!IS_PRODUCTION) {
          const hasNonLastUnguardedTarget = transitions
            .slice(0, -1)
            .some(
              transition =>
                isString(transition) ||
                isMachine(transition) ||
                (!('cond' in transition) && !('in' in transition))
            );

          const eventText =
            event.length === 0 ? 'the transient event' : `event '${event}'`;

          warn(
            !hasNonLastUnguardedTarget,
            `One or more transitions for ${eventText} on state '${this.id}' are unreachable. ` +
              `Make sure that the default transition is the last one defined.`
          );
        }

        return transitions.map(transition => {
          if (isString(transition) || isMachine(transition)) {
            return this.formatTransition(transition, undefined, event);
          }

          if (!IS_PRODUCTION) {
            for (const key of keys(transition)) {
              if (
                [
                  'target',
                  'actions',
                  'internal',
                  'in',
                  'cond',
                  'event'
                ].indexOf(key) === -1
              ) {
                throw new Error(
                  // tslint:disable-next-line:max-line-length
                  `State object mapping of transitions is deprecated. Check the config for event '${event}' on state '${this.id}'.`
                );
              }
            }
          }

          return this.formatTransition(transition.target, transition, event);
        });
      }
    ) as TransitionsDefinition<TContext, TEvent>;

    for (const delayedTransition of delayedTransitions) {
      formattedTransitions[delayedTransition.event] =
        formattedTransitions[delayedTransition.event] || [];
      formattedTransitions[delayedTransition.event].push(
        delayedTransition as TransitionDefinition<
          TContext,
          TEvent | EventObject
        >
      );
    }

    return formattedTransitions;
  }
}

export { StateNode };
