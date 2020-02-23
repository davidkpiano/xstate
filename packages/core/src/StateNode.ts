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
  mapContext,
  toTransitionConfigArray,
  normalizeTarget
} from './utils';
import {
  Event,
  StateValue,
  TransitionConfig,
  StateTransition,
  StateValueMap,
  MachineOptions,
  EventObject,
  HistoryStateNodeConfig,
  HistoryValue,
  StateNodeDefinition,
  TransitionDefinition,
  AssignAction,
  DelayedTransitionDefinition,
  ActivityDefinition,
  StateNodeConfig,
  StateSchema,
  StatesDefinition,
  StateNodesConfig,
  FinalStateNodeConfig,
  InvokeDefinition,
  ActionObject,
  Mapper,
  PropertyMapper,
  SendAction,
  NullEvent,
  Guard,
  GuardPredicate,
  GuardMeta,
  MachineConfig,
  PureAction,
  InvokeCreator,
  DoneEventObject,
  SingleOrArray,
  LogAction,
  SendActionObject,
  SpecialTargets,
  RaiseAction,
  SCXML,
  RaiseActionObject,
  ActivityActionObject,
  InvokeActionObject,
  Typestate,
  TransitionDefinitionMap,
  DelayExpr
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
  toActionObjects,
  resolveLog,
  resolveRaise,
  assign
} from './actions';
import { IS_PRODUCTION } from './environment';
import { DEFAULT_GUARD_TYPE, STATE_DELIMITER } from './constants';
import {
  getValue,
  getConfiguration,
  has,
  getChildren,
  getAllStateNodes,
  isInFinalState,
  isLeafNode
} from './stateUtils';
import { Actor, createInvocableActor } from './Actor';

const NULL_EVENT = '';
const STATE_IDENTIFIER = '#';
const WILDCARD = '*';

const EMPTY_OBJECT = {};

const isStateId = (str: string) => str[0] === STATE_IDENTIFIER;
const createDefaultOptions = <TContext>(): MachineOptions<TContext, any> => ({
  actions: {},
  guards: {},
  services: {},
  activities: {},
  delays: {}
});

const validateArrayifiedTransitions = <TContext>(
  stateNode: StateNode<any, any, any>,
  event: string,
  transitions: Array<
    TransitionConfig<TContext, EventObject> & {
      event: string;
    }
  >
) => {
  const hasNonLastUnguardedTarget = transitions
    .slice(0, -1)
    .some(
      transition =>
        !('cond' in transition) &&
        !('in' in transition) &&
        (isString(transition.target) || isMachine(transition.target))
    );
  const eventText =
    event === NULL_EVENT ? 'the transient event' : `event '${event}'`;

  warn(
    !hasNonLastUnguardedTarget,
    `One or more transitions for ${eventText} on state '${stateNode.id}' are unreachable. ` +
      `Make sure that the default transition is the last one defined.`
  );
};

class StateNode<
  TContext = any,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject,
  TTypestate extends Typestate<TContext> = any
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
  public type: 'atomic' | 'compound' | 'parallel' | 'final' | 'history';
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
   * The type of history on this state node. Can be:
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

  public __xstatenode: true = true;

  private __cache = {
    events: undefined as Array<TEvent['type']> | undefined,
    relativeValue: new Map() as Map<StateNode<TContext>, StateValue>,
    initialStateValue: undefined as StateValue | undefined,
    initialState: undefined as State<TContext, TEvent> | undefined,
    on: undefined as TransitionDefinitionMap<TContext, TEvent> | undefined,
    transitions: undefined as
      | Array<TransitionDefinition<TContext, TEvent>>
      | undefined,
    candidates: {} as {
      [K in TEvent['type'] | NullEvent['type'] | '*']:
        | Array<
            TransitionDefinition<
              TContext,
              K extends TEvent['type']
                ? Extract<TEvent, { type: K }>
                : EventObject
            >
          >
        | undefined;
    },
    delayedTransitions: undefined as
      | Array<DelayedTransitionDefinition<TContext, TEvent>>
      | undefined
  };

  private idMap: Record<string, StateNode<TContext, any, TEvent>> = {};

  constructor(
    /**
     * The raw config used to create the machine.
     */
    public config: StateNodeConfig<TContext, TStateSchema, TEvent>,
    options?: Partial<MachineOptions<TContext, TEvent>>,
    /**
     * The initial extended state
     */
    public context?: Readonly<TContext>
  ) {
    this.options = Object.assign(createDefaultOptions<TContext>(), options);
    this.parent = this.options._parent;
    this.key =
      this.config.key || this.options._key || this.config.id || '(machine)';
    this.machine = this.parent ? this.parent.machine : this;
    this.path = this.parent ? this.parent.path.concat(this.key) : [];
    this.delimiter =
      this.config.delimiter ||
      (this.parent ? this.parent.delimiter : STATE_DELIMITER);
    this.id =
      this.config.id || [this.machine.key, ...this.path].join(this.delimiter);
    this.version = this.parent
      ? this.parent.version
      : (this.config as MachineConfig<TContext, TStateSchema, TEvent>).version;
    this.type =
      this.config.type ||
      (this.config.parallel
        ? 'parallel'
        : this.config.states && keys(this.config.states).length
        ? 'compound'
        : this.config.history
        ? 'history'
        : 'atomic');

    if (!IS_PRODUCTION) {
      warn(
        !('parallel' in this.config),
        `The "parallel" property is deprecated and will be removed in version 4.1. ${
          this.config.parallel
            ? `Replace with \`type: 'parallel'\``
            : `Use \`type: '${this.type}'\``
        } in the config for state node '${this.id}' instead.`
      );
    }

    this.initial = this.config.initial;

    this.states = (this.config.states
      ? mapValues(
          this.config.states,
          (stateConfig: StateNodeConfig<TContext, any, TEvent>, key) => {
            const stateNode = new StateNode(stateConfig, {
              _parent: this,
              _key: key
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

    function dfs(stateNode: StateNode<TContext, any, TEvent>): void {
      stateNode.order = order++;

      for (const child of getChildren(stateNode)) {
        dfs(child);
      }
    }

    dfs(this);

    // History config
    this.history =
      this.config.history === true ? 'shallow' : this.config.history || false;

    this._transient = !this.config.on
      ? false
      : Array.isArray(this.config.on)
      ? this.config.on.some(({ event }: { event: string }) => {
          return event === NULL_EVENT;
        })
      : NULL_EVENT in this.config.on;
    this.strict = !!this.config.strict;

    // TODO: deprecate (entry)
    this.onEntry = toArray(this.config.entry || this.config.onEntry).map(
      action => toActionObject(action)
    );

    if (this.parent && this.config.context) {
      this.onEntry.unshift(assign(this.config.context));
    }

    // TODO: deprecate (exit)
    this.onExit = toArray(this.config.exit || this.config.onExit).map(action =>
      toActionObject(action)
    );
    this.meta = this.config.meta;
    this.data =
      this.type === 'final'
        ? (this.config as FinalStateNodeConfig<TContext, TEvent>).data
        : undefined;
    this.invoke = toArray(this.config.invoke).map((invokeConfig, i) => {
      if (isMachine(invokeConfig)) {
        this.machine.options.services = {
          [invokeConfig.id]: invokeConfig,
          ...this.machine.options.services
        };

        return {
          type: actionTypes.invoke,
          src: invokeConfig.id,
          id: invokeConfig.id
        };
      } else if (typeof invokeConfig.src !== 'string') {
        const invokeSrc = `${this.id}:invocation[${i}]`; // TODO: util function
        this.machine.options.services = {
          [invokeSrc]: invokeConfig.src as InvokeCreator<TContext, TEvent>,
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
    this.activities = toArray(this.config.activities)
      .concat(this.invoke)
      .map(activity => toActivityDefinition(activity));
    this.transition = this.transition.bind(this);
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
      transitions: this.transitions,
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
  public get on(): TransitionDefinitionMap<TContext, TEvent> {
    if (this.__cache.on) {
      return this.__cache.on;
    }

    const transitions = this.transitions;

    return (this.__cache.on = transitions.reduce(
      (map, transition) => {
        map[transition.eventType] = map[transition.eventType] || [];
        map[transition.eventType].push(transition as any);
        return map;
      },
      {} as TransitionDefinitionMap<TContext, TEvent>
    ));
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
    return (
      this.__cache.transitions ||
      ((this.__cache.transitions = this.formatTransitions()),
      this.__cache.transitions)
    );
  }

  private getCandidates(eventName: TEvent['type'] | NullEvent['type'] | '*') {
    if (this.__cache.candidates[eventName]) {
      return this.__cache.candidates[eventName];
    }

    const transient = eventName === NULL_EVENT;

    const candidates = this.transitions.filter(transition => {
      const sameEventType = transition.eventType === eventName;
      // null events should only match against eventless transitions
      return transient
        ? sameEventType
        : sameEventType || transition.eventType === WILDCARD;
    }) as any;
    this.__cache.candidates[eventName] = candidates;
    return candidates;
  }

  /**
   * All delayed transitions from the config.
   */
  private getDelayedTransitions(): Array<
    DelayedTransitionDefinition<TContext, TEvent>
  > {
    const afterConfig = this.config.after;

    if (!afterConfig) {
      return [];
    }

    const mutateEntryExit = (
      delay: string | number | DelayExpr<TContext, TEvent>,
      i: number
    ) => {
      const delayRef = isFunction(delay) ? `${this.id}:delay[${i}]` : delay;

      const eventType = after(delayRef, this.id);

      this.onEntry.push(send(eventType, { delay }));
      this.onExit.push(cancel(eventType));

      return eventType;
    };

    const delayedTransitions = isArray(afterConfig)
      ? afterConfig.map((transition, i) => {
          const eventType = mutateEntryExit(transition.delay, i);
          return { ...transition, event: eventType };
        })
      : flatten(
          keys(afterConfig).map((delay, i) => {
            const configTransition = afterConfig[delay];
            const resolvedTransition = isString(configTransition)
              ? { target: configTransition }
              : configTransition;

            const resolvedDelay = !isNaN(+delay) ? +delay : delay;

            const eventType = mutateEntryExit(resolvedDelay, i);

            return toArray(resolvedTransition).map(transition => ({
              ...transition,
              event: eventType,
              delay: resolvedDelay
            }));
          })
        );

    return delayedTransitions.map(delayedTransition => {
      const { delay } = delayedTransition;

      return {
        ...this.formatTransition(delayedTransition),
        delay
      };
    });
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

    return this.events.includes(eventType);
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
    _event: SCXML.Event<TEvent>
  ): StateTransition<TContext, TEvent> | undefined {
    const stateNode = this.getStateNode(stateValue);
    const next = stateNode.next(state, _event);

    if (!next || !next.transitions.length) {
      return this.next(state, _event);
    }

    return next;
  }
  private transitionCompoundNode(
    stateValue: StateValueMap,
    state: State<TContext, TEvent>,
    _event: SCXML.Event<TEvent>
  ): StateTransition<TContext, TEvent> | undefined {
    const subStateKeys = keys(stateValue);

    const stateNode = this.getStateNode(subStateKeys[0]);
    const next = stateNode._transition(
      stateValue[subStateKeys[0]],
      state,
      _event
    );

    if (!next || !next.transitions.length) {
      return this.next(state, _event);
    }

    return next;
  }
  private transitionParallelNode(
    stateValue: StateValueMap,
    state: State<TContext, TEvent>,
    _event: SCXML.Event<TEvent>
  ): StateTransition<TContext, TEvent> | undefined {
    const transitionMap: Record<string, StateTransition<TContext, TEvent>> = {};

    for (const subStateKey of keys(stateValue)) {
      const subStateValue = stateValue[subStateKey];

      if (!subStateValue) {
        continue;
      }

      const subStateNode = this.getStateNode(subStateKey);
      const next = subStateNode._transition(subStateValue, state, _event);
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
      return this.next(state, _event);
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
    _event: SCXML.Event<TEvent>
  ): StateTransition<TContext, TEvent> | undefined {
    // leaf node
    if (isString(stateValue)) {
      return this.transitionLeafNode(stateValue, state, _event);
    }

    // hierarchical node
    if (keys(stateValue).length === 1) {
      return this.transitionCompoundNode(stateValue, state, _event);
    }

    // orthogonal node
    return this.transitionParallelNode(stateValue, state, _event);
  }
  private next(
    state: State<TContext, TEvent>,
    _event: SCXML.Event<TEvent>
  ): StateTransition<TContext, TEvent> | undefined {
    const eventName = _event.name;
    const actions: Array<ActionObject<TContext, TEvent>> = [];

    let nextStateNodes: Array<StateNode<TContext, any, TEvent>> = [];
    let selectedTransition: TransitionDefinition<TContext, TEvent> | undefined;

    for (const candidate of this.getCandidates(eventName)) {
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
          !cond || this.evaluateGuard(cond, resolvedContext, _event, state);
      } catch (err) {
        throw new Error(
          `Unable to evaluate guard '${cond!.name ||
            cond!
              .type}' in transition for event '${eventName}' in state node '${
            this.id
          }':\n${err.message}`
        );
      }

      if (guardPassed && isInState) {
        if (candidate.target !== undefined) {
          nextStateNodes = candidate.target;
        }
        actions.push(...candidate.actions);
        selectedTransition = candidate;
        break;
      }
    }

    if (!selectedTransition) {
      return undefined;
    }
    if (!nextStateNodes.length) {
      return {
        transitions: [selectedTransition],
        entrySet: [],
        exitSet: [],
        configuration: state.value ? [this] : [],
        source: state,
        actions
      };
    }

    const allNextStateNodes = flatten(
      nextStateNodes.map(stateNode => {
        return this.getRelativeStateNodes(stateNode, state.historyValue);
      })
    );

    const isInternal = !!selectedTransition.internal;

    const reentryNodes = isInternal
      ? []
      : flatten(allNextStateNodes.map(n => this.nodesFromChild(n)));

    return {
      transitions: [selectedTransition],
      entrySet: reentryNodes,
      exitSet: isInternal ? [] : [this],
      configuration: allNextStateNodes,
      source: state,
      actions
    };
  }

  private nodesFromChild(
    childStateNode: StateNode<TContext, any, TEvent>
  ): Array<StateNode<TContext, any, TEvent>> {
    if (childStateNode.escapes(this)) {
      return [];
    }

    const nodes: Array<StateNode<TContext, any, TEvent>> = [];
    let marker: StateNode<TContext, any, TEvent> | undefined = childStateNode;

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
  private escapes(stateNode: StateNode<TContext, any, TEvent>): boolean {
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
    _event: SCXML.Event<TEvent>,
    state: State<TContext, TEvent>
  ): boolean {
    const { guards } = this.machine.options;
    const guardMeta: GuardMeta<TContext, TEvent> = {
      state,
      cond: guard,
      _event
    };

    // TODO: do not hardcode!
    if (guard.type === DEFAULT_GUARD_TYPE) {
      return (guard as GuardPredicate<TContext, TEvent>).predicate(
        context,
        _event.data,
        guardMeta
      );
    }

    const condFn = guards[guard.type];

    if (!condFn) {
      throw new Error(
        `Guard '${guard.type}' is not implemented on machine '${this.machine.id}'.`
      );
    }

    return condFn(context, _event.data, guardMeta);
  }

  private getActions(
    transition: StateTransition<TContext, TEvent>,
    currentContext: TContext,
    _event: SCXML.Event<TEvent>,
    prevState?: State<TContext>
  ): Array<ActionObject<TContext, TEvent>> {
    const prevConfig = getConfiguration(
      [],
      prevState ? this.getStateNodes(prevState.value) : [this]
    );
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
            sn.data ? mapContext(sn.data, currentContext, _event) : undefined
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
      ).concat(doneEvents.map(raise) as Array<ActionObject<TContext, TEvent>>),
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
    state: StateValue | State<TContext, TEvent> = this.initialState,
    event: Event<TEvent> | SCXML.Event<TEvent>,
    context?: TContext
  ): State<TContext, TEvent, TStateSchema, TTypestate> {
    const _event = toSCXMLEvent(event);
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

    if (!IS_PRODUCTION && _event.name === WILDCARD) {
      throw new Error(`An event cannot have the wildcard type ('${WILDCARD}')`);
    }

    if (this.strict) {
      if (!this.events.includes(_event.name) && !isBuiltInEvent(_event.name)) {
        throw new Error(
          `Machine '${this.id}' does not accept event '${_event.name}'`
        );
      }
    }

    const stateTransition = this._transition(
      currentState.value,
      currentState,
      _event
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

    return this.resolveTransition(stateTransition, currentState, _event);
  }

  private resolveRaisedTransition(
    state: State<TContext, TEvent, TStateSchema, TTypestate>,
    _event: SCXML.Event<TEvent> | NullEvent,
    originalEvent: SCXML.Event<TEvent>
  ): State<TContext, TEvent, TStateSchema, TTypestate> {
    const currentActions = state.actions;

    state = this.transition(state, _event as SCXML.Event<TEvent>);
    // Save original event to state
    state._event = originalEvent;
    state.event = originalEvent.data;
    state.actions.unshift(...currentActions);
    return state;
  }

  private resolveTransition(
    stateTransition: StateTransition<TContext, TEvent>,
    currentState?: State<TContext, TEvent>,
    _event: SCXML.Event<TEvent> = initEvent as SCXML.Event<TEvent>,
    context: TContext = this.machine.context!
  ): State<TContext, TEvent, TStateSchema, TTypestate> {
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
    const actions = this.getActions(
      stateTransition,
      currentContext,
      _event,
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

    const [assignActions, otherActions] = partition(
      actions,
      (action): action is AssignAction<TContext, TEvent> =>
        action.type === actionTypes.assign
    );

    const updatedContext = assignActions.length
      ? updateContext(currentContext, _event, assignActions, currentState)
      : currentContext;

    const resolvedActions = flatten(
      otherActions.map(actionObject => {
        switch (actionObject.type) {
          case actionTypes.raise:
            return resolveRaise(actionObject as RaiseAction<TEvent>);
          case actionTypes.send:
            const sendAction = resolveSend(
              actionObject as SendAction<TContext, TEvent>,
              updatedContext,
              _event,
              this.machine.options.delays
            ) as ActionObject<TContext, TEvent>; // TODO: fix ActionTypes.Init

            if (!IS_PRODUCTION) {
              // warn after resolving as we can create better contextual message here
              warn(
                !isString(actionObject.delay) ||
                  typeof sendAction.delay === 'number',
                // tslint:disable-next-line:max-line-length
                `No delay reference for delay expression '${actionObject.delay}' was found on machine '${this.machine.id}'`
              );
            }

            return sendAction;
          case actionTypes.log:
            return resolveLog(
              actionObject as LogAction<TContext, TEvent>,
              updatedContext,
              _event
            );
          case actionTypes.pure:
            return (
              (actionObject as PureAction<TContext, TEvent>).get(
                updatedContext,
                _event.data
              ) || []
            );
          default:
            return toActionObject(actionObject, this.options.actions);
        }
      })
    );

    const [raisedEvents, nonRaisedActions] = partition(
      resolvedActions,
      (
        action
      ): action is
        | RaiseActionObject<TEvent>
        | SendActionObject<TContext, TEvent> =>
        action.type === actionTypes.raise ||
        (action.type === actionTypes.send &&
          (action as SendActionObject<TContext, TEvent>).to ===
            SpecialTargets.Internal)
    );

    const invokeActions = resolvedActions.filter(action => {
      return (
        action.type === actionTypes.start &&
        (action as ActivityActionObject<TContext, TEvent>).activity.type ===
          actionTypes.invoke
      );
    }) as Array<InvokeActionObject<TContext, TEvent>>;

    const children = invokeActions.reduce(
      (acc, action) => {
        acc[action.activity.id] = createInvocableActor(action.activity);

        return acc;
      },
      currentState
        ? { ...currentState.children }
        : ({} as Record<string, Actor>)
    );

    const resolvedConfiguration = resolvedStateValue
      ? stateTransition.configuration
      : currentState
      ? currentState.configuration
      : [];

    const meta = resolvedConfiguration.reduce(
      (acc, stateNode) => {
        if (stateNode.meta !== undefined) {
          acc[stateNode.id] = stateNode.meta;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    const isDone = isInFinalState(resolvedConfiguration, this);

    const nextState = new State<TContext, TEvent, TStateSchema, TTypestate>({
      value: resolvedStateValue || currentState!.value,
      context: updatedContext,
      _event,
      // Persist _sessionid between states
      _sessionid: currentState ? currentState._sessionid : null,
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
      actions: resolvedStateValue ? nonRaisedActions : [],
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
      events: [],
      configuration: resolvedConfiguration,
      transitions: stateTransition.transitions,
      children,
      done: isDone
    });

    nextState.changed =
      _event.name === actionTypes.update || !!assignActions.length;

    // Dispose of penultimate histories to prevent memory leaks
    const { history } = nextState;
    if (history) {
      delete history.history;
    }

    if (!resolvedStateValue) {
      return nextState;
    }

    let maybeNextState = nextState;

    if (!isDone) {
      const isTransient =
        this._transient ||
        configuration.some(stateNode => stateNode._transient);

      if (isTransient) {
        maybeNextState = this.resolveRaisedTransition(
          maybeNextState,
          {
            type: actionTypes.nullEvent
          },
          _event
        );
      }

      while (raisedEvents.length) {
        const raisedEvent = raisedEvents.shift()!;
        maybeNextState = this.resolveRaisedTransition(
          maybeNextState,
          raisedEvent._event,
          _event
        );
      }
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

    let initialStateValue: StateValue | undefined;

    if (this.type === 'parallel') {
      initialStateValue = mapFilterValues(
        this.states as Record<string, StateNode<TContext, any, TEvent>>,
        state => state.initialStateValue || EMPTY_OBJECT,
        stateNode => !(stateNode.type === 'history')
      );
    } else if (this.initial !== undefined) {
      if (!this.states[this.initial]) {
        throw new Error(
          `Initial state '${this.initial}' not found on '${this.key}'`
        );
      }

      initialStateValue = (isLeafNode(this.states[this.initial])
        ? this.initial
        : {
            [this.initial]: this.states[this.initial].initialStateValue
          }) as StateValue;
    }

    this.__cache.initialStateValue = initialStateValue;

    return this.__cache.initialStateValue;
  }

  public getInitialState(
    stateValue: StateValue,
    context?: TContext
  ): State<TContext, TEvent, TStateSchema, TTypestate> {
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
  public get initialState(): State<TContext, TEvent, TStateSchema, TTypestate> {
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
      if (isString(historyConfig.target)) {
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

  /**
   * Returns the leaf nodes from a state path relative to this state node.
   *
   * @param relativeStateId The relative state path to retrieve the state nodes
   * @param history The previous state to retrieve history
   * @param resolve Whether state nodes should resolve to initial child state nodes
   */
  public getRelativeStateNodes(
    relativeStateId: StateNode<TContext, any, TEvent>,
    historyValue?: HistoryValue,
    resolve: boolean = true
  ): Array<StateNode<TContext, any, TEvent>> {
    return resolve
      ? relativeStateId.type === 'history'
        ? relativeStateId.resolveHistory(historyValue)
        : relativeStateId.initialStateNodes
      : [relativeStateId];
  }
  public get initialStateNodes(): Array<StateNode<TContext, any, TEvent>> {
    if (isLeafNode(this)) {
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
    relativePath: string[]
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
      return childStateNode.resolveHistory();
    }

    if (!this.states[stateKey]) {
      throw new Error(
        `Child state '${stateKey}' does not exist on '${this.id}'`
      );
    }

    return this.states[stateKey].getFromRelativePath(childStatePath);
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
      const historyTarget = this.target;
      return historyTarget
        ? flatten(
            toStatePaths(historyTarget).map(relativeChildPath =>
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
      this.transitions
        .filter(transition => {
          return !(
            !transition.target &&
            !transition.actions.length &&
            transition.internal
          );
        })
        .map(transition => transition.eventType)
    );

    return Array.from(events);
  }
  private resolveTarget(
    _target: Array<string | StateNode<TContext, any, TEvent>> | undefined
  ): Array<StateNode<TContext, any, TEvent>> | undefined {
    if (_target === undefined) {
      // an undefined target signals that the state node should not transition from that state when receiving that event
      return undefined;
    }

    return _target.map(target => {
      if (!isString(target)) {
        return target;
      }

      const isInternalTarget = target[0] === this.delimiter;

      // If internal target is defined on machine,
      // do not include machine key on target
      if (isInternalTarget && !this.parent) {
        return this.getStateNodeByPath(target.slice(1));
      }

      const resolvedTarget = isInternalTarget ? this.key + target : target;

      if (this.parent) {
        try {
          const targetStateNode = this.parent.getStateNodeByPath(
            resolvedTarget
          );
          return targetStateNode;
        } catch (err) {
          throw new Error(
            `Invalid transition definition for state node '${this.id}':\n${err.message}`
          );
        }
      } else {
        return this.getStateNodeByPath(resolvedTarget);
      }
    });
  }

  private formatTransition(
    transitionConfig: TransitionConfig<TContext, TEvent> & {
      event: TEvent['type'] | NullEvent['type'] | '*';
    }
  ): TransitionDefinition<TContext, TEvent> {
    const normalizedTarget = normalizeTarget(transitionConfig.target);
    const internal =
      'internal' in transitionConfig
        ? transitionConfig.internal
        : normalizedTarget
        ? normalizedTarget.some(
            _target => isString(_target) && _target[0] === this.delimiter
          )
        : true;
    const { guards } = this.machine.options;

    const target = this.resolveTarget(normalizedTarget);

    const actions = toActionObjects(toArray(transitionConfig.actions));

    if (transitionConfig.context) {
      actions.unshift(assign(transitionConfig.context));
    }

    return {
      ...transitionConfig,
      actions,
      cond: toGuard(transitionConfig.cond, guards),
      target,
      source: this,
      internal,
      eventType: transitionConfig.event
    };
  }
  private formatTransitions(): Array<TransitionDefinition<TContext, TEvent>> {
    let onConfig: Array<
      TransitionConfig<TContext, EventObject> & {
        event: string;
      }
    >;

    if (!this.config.on) {
      onConfig = [];
    } else if (Array.isArray(this.config.on)) {
      onConfig = this.config.on;
    } else {
      const {
        [WILDCARD]: wildcardConfigs = [],
        ...strictOnConfigs
      } = this.config.on;

      onConfig = flatten(
        keys(strictOnConfigs)
          .map(key => {
            const arrayified = toTransitionConfigArray<TContext, EventObject>(
              key,
              strictOnConfigs![key as string]
            );
            if (!IS_PRODUCTION) {
              validateArrayifiedTransitions(this, key, arrayified);
            }
            return arrayified;
          })
          .concat(
            toTransitionConfigArray(WILDCARD, wildcardConfigs as SingleOrArray<
              TransitionConfig<TContext, EventObject> & {
                event: '*';
              }
            >)
          )
      );
    }

    const doneConfig = this.config.onDone
      ? toTransitionConfigArray(String(done(this.id)), this.config.onDone)
      : [];

    const invokeConfig = flatten(
      this.invoke.map(invokeDef => {
        const settleTransitions: any[] = [];
        if (invokeDef.onDone) {
          settleTransitions.push(
            ...toTransitionConfigArray(
              String(doneInvoke(invokeDef.id)),
              invokeDef.onDone
            )
          );
        }
        if (invokeDef.onError) {
          settleTransitions.push(
            ...toTransitionConfigArray(
              String(error(invokeDef.id)),
              invokeDef.onError
            )
          );
        }
        return settleTransitions;
      })
    );

    const delayedTransitions = this.after;

    const formattedTransitions = flatten(
      [...doneConfig, ...invokeConfig, ...onConfig].map(
        (
          transitionConfig: TransitionConfig<TContext, TEvent> & {
            event: TEvent['type'] | NullEvent['type'] | '*';
          }
        ) =>
          toArray(transitionConfig).map(transition =>
            this.formatTransition(transition)
          )
      )
    );

    for (const delayedTransition of delayedTransitions) {
      formattedTransitions.push(delayedTransition as any);
    }

    return formattedTransitions;
  }
}

export { StateNode };
