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
  isMachine
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
  OmniEventObject,
  RaisedEvent,
  FinalStateNodeConfig,
  InvokeDefinition,
  OmniEvent,
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
  StateMachine
} from './types';
import { matchesState } from './utils';
import { State, stateValuesEqual } from './State';
import * as actionTypes from './actionTypes';
import {
  start,
  stop,
  toEventObject,
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
import { StateTree } from './StateTree';
import { IS_PRODUCTION } from './environment';
import { DEFAULT_GUARD_TYPE } from './constants';
import { getValue, getConfiguration } from './stateUtils';

const STATE_DELIMITER = '.';
const NULL_EVENT = '';
const STATE_IDENTIFIER = '#';
const TARGETLESS_KEY = '';

const EMPTY_OBJECT = {};

const isStateId = (str: string) => str[0] === STATE_IDENTIFIER;
const createDefaultOptions = <TContext>(): MachineOptions<TContext, any> => ({
  actions: {},
  guards: {},
  services: {},
  activities: {},
  delays: {},
  updater: updateContext
});

class StateNode<
  TContext = any,
  TStateSchema extends StateSchema = any,
  TEvent extends OmniEventObject<EventObject> = OmniEventObject<EventObject>
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
  /**
   * The delayed transitions.
   */
  public after: Array<DelayedTransitionDefinition<TContext, TEvent>>;
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
  public order: number;
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
      | undefined
  };

  private idMap: Record<string, StateNode<TContext, any, TEvent>> = {};

  constructor(
    _config: StateNodeConfig<TContext, TStateSchema, TEvent>,
    options?: Partial<MachineOptions<TContext, TEvent>>,
    /**
     * The initial extended state
     */
    public context?: Readonly<TContext>
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

    if (!IS_PRODUCTION && _config.id) {
      if (_config.id.includes(this.delimiter)) {
        throw new Error(`Explicitly configured state node ID ("${_config.id}") cannot contain path delimiter ("${this.delimiter}").`);
      }

      if (_config.id[0] === STATE_IDENTIFIER) {
        throw new Error(
          `State node ID ("${_config.id}") shouldn't start with "${STATE_IDENTIFIER}".`
        );
      }
    }

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
    this.order = _config.order || -1;

    this.states = (_config.states
      ? mapValues(
          _config.states,
          (stateConfig: StateNodeConfig<TContext, any, TEvent>, key, _, i) => {
            const stateNode = new StateNode({
              ...stateConfig,
              key,
              order: stateConfig.order === undefined ? i : stateConfig.order,
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
    this.after = this.getDelayedTransitions();
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
    if (this.after) {
      return this.after;
    }

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
          target: target === undefined ? undefined : toArray<any>(target),
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
              target: [delayedTransition],
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
              : toArray<any>(transition.target), // TODO: fix generic
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
    return new State({
      ...state,
      value: this.resolve(state.value),
      tree: this.getStateTree(state.value)
    });
  }

  private transitionLeafNode(
    stateValue: string,
    state: State<TContext, TEvent>,
    eventObject: OmniEventObject<TEvent>
  ): StateTransition<TContext, TEvent> {
    const stateNode = this.getStateNode(stateValue);
    const next = stateNode.next(state, eventObject);

    if (!next.tree) {
      const { actions, tree, transitions, entrySet, configuration } = this.next(
        state,
        eventObject
      );

      return {
        tree,
        transitions,
        entrySet,
        configuration,
        source: state,
        actions
      };
    }

    return next;
  }
  private transitionCompoundNode(
    stateValue: StateValueMap,
    state: State<TContext, TEvent>,
    eventObject: OmniEventObject<TEvent>
  ): StateTransition<TContext, TEvent> {
    const subStateKeys = keys(stateValue);

    const stateNode = this.getStateNode(subStateKeys[0]);
    const next = stateNode._transition(
      stateValue[subStateKeys[0]],
      state,
      eventObject
    );

    if (!next.tree) {
      const { actions, tree, transitions, entrySet, configuration } = this.next(
        state,
        eventObject
      );

      return {
        tree,
        transitions,
        entrySet,
        configuration,
        source: state,
        actions
      };
    }

    return next;
  }
  private transitionParallelNode(
    stateValue: StateValueMap,
    state: State<TContext, TEvent>,
    eventObject: OmniEventObject<TEvent>
  ): StateTransition<TContext, TEvent> {
    const noTransitionKeys: string[] = [];
    const transitionMap: Record<string, StateTransition<TContext, TEvent>> = {};

    for (const subStateKey of keys(stateValue)) {
      const subStateValue = stateValue[subStateKey];

      if (!subStateValue) {
        continue;
      }

      const subStateNode = this.getStateNode(subStateKey);

      const next = subStateNode._transition(subStateValue, state, eventObject);

      if (!next.tree) {
        noTransitionKeys.push(subStateKey);
      }

      transitionMap[subStateKey] = next;
    }

    const stateTransitions = keys(transitionMap).map(key => transitionMap[key]);
    const enabledTransitions = flatten(
      stateTransitions.map(st => st.transitions)
    );

    const willTransition = stateTransitions.some(
      transition => transition.tree !== undefined
    );

    if (!willTransition) {
      const {
        actions,
        tree,
        transitions,
        entrySet,
        configuration: _configuration
      } = this.next(state, eventObject);

      return {
        tree,
        transitions,
        entrySet,
        configuration: _configuration,
        source: state,
        actions
      };
    }

    const targetNodes = flatten(stateTransitions.map(st => st.configuration));
    const prevNodes = this.getStateNodes(stateValue);
    const entryNodes = flatten(stateTransitions.map(t => t.entrySet));

    // console.log(targetNodes.map(t => t.id));
    // console.log([...getConfiguration(prevNodes, targetNodes)].map(c => c.id));

    const stateValueFromConfiguration = getValue(
      this.machine,
      getConfiguration(prevNodes, targetNodes)
    );
    // console.log(sv);

    const combinedTree = new StateTree(
      this.machine,
      stateValueFromConfiguration
    );

    for (const entryNode of entryNodes) {
      combinedTree.addReentryNode(entryNode);
    }

    // const allTrees = keys(transitionMap)
    //   .map(key => transitionMap[key].tree)
    //   .filter(t => t !== undefined) as StateTree[];

    // const combinedTree = allTrees.reduce((acc, t) => {
    //   return acc.combine(t);
    // });

    const allPaths = combinedTree.paths;
    const configuration = flatten(
      keys(transitionMap).map(key => transitionMap[key].configuration)
    );

    // External transition that escapes orthogonal region
    if (
      allPaths.length === 1 &&
      !matchesState(toStateValue(this.path, this.delimiter), combinedTree.value)
    ) {
      return {
        tree: combinedTree,
        entrySet: [],
        transitions: enabledTransitions,
        configuration,
        source: state,
        actions: flatten(
          keys(transitionMap).map(key => {
            return transitionMap[key].actions;
          })
        )
      };
    }

    // const allResolvedTrees = keys(transitionMap).map(key => {
    //   const { tree } = transitionMap[key];

    //   if (tree) {
    //     return tree;
    //   }

    //   const subValue = path(this.path)(state.value)[key];

    //   return new StateTree(this.getStateNode(key), subValue).absolute;
    // });

    // const finalCombinedTree = allResolvedTrees.reduce((acc, t) => {
    //   return acc.combine(t);
    // });

    return {
      tree: combinedTree,
      transitions: enabledTransitions,
      entrySet: [],
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
    event: OmniEventObject<TEvent>
  ): StateTransition<TContext, TEvent> {
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
    eventObject: OmniEventObject<TEvent>
  ): StateTransition<TContext, TEvent> {
    const eventType = eventObject.type;
    const candidates: Array<TransitionDefinition<TContext, TEvent>> = this.on[
      eventType
    ];

    if (!candidates || !candidates.length) {
      return {
        tree: undefined,
        transitions: [],
        entrySet: [],
        configuration: [],
        source: state,
        actions: []
      };
    }

    const actions: Array<ActionObject<TContext, TEvent>> = this._transient
      ? [{ type: actionTypes.nullEvent }]
      : [];

    let nextStateStrings: TransitionTarget<TContext> = [];
    let selectedTransition: TransitionDefinition<TContext, TEvent> | undefined;

    for (const candidate of candidates) {
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
        actions.push(...toArray(candidate.actions));
        selectedTransition = candidate;
        break;
      }
    }

    if (!nextStateStrings.length) {
      return {
        tree:
          selectedTransition! && state.value // targetless transition
            ? new StateTree(this, path(this.path)(state.value)).absolute
            : undefined,
        transitions: selectedTransition ? [selectedTransition] : [],
        entrySet:
          selectedTransition && selectedTransition.internal ? [] : [this],
        configuration: selectedTransition && state.value ? [this] : [],
        source: state,
        actions
      };
    }

    const nextStateNodes = flatten(
      nextStateStrings.map(str => {
        if (str instanceof StateNode) {
          return str as StateNode<TContext, any, any>; // TODO: fix anys
        }
        return this.getRelativeStateNodes(str, state.historyValue);
      })
    );

    const refinedSelectedTransition = selectedTransition as TransitionDefinition<TContext, TEvent>;
    const isInternal = !!refinedSelectedTransition.internal;

    const reentryNodes = isInternal
      ? []
      : flatten(nextStateNodes.map(n => this.nodesFromChild(n)));

    const trees = nextStateNodes.map(stateNode => stateNode.tree);
    const combinedTree = trees.reduce((acc, t) => {
      return acc.combine(t);
    });

    reentryNodes.forEach(reentryNode =>
      combinedTree.addReentryNode(reentryNode)
    );

    return {
      tree: combinedTree,
      transitions: [refinedSelectedTransition],
      entrySet: reentryNodes,
      configuration: nextStateNodes,
      source: state,
      actions
    };
  }

  /**
   * The state tree represented by this state node.
   */
  private get tree(): StateTree {
    const stateValue = toStateValue(this.path, this.delimiter);

    return new StateTree(this.machine, stateValue);
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
  private getStateTree(stateValue: StateValue): StateTree {
    return new StateTree(this, stateValue);
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
    eventObject: OmniEventObject<TEvent>,
    state: State<TContext, TEvent>
  ): boolean {
    let condFn: ConditionPredicate<TContext, OmniEventObject<TEvent>>;
    const { guards } = this.machine.options;
    const guardMeta: GuardMeta<TContext, TEvent> = {
      state,
      cond: guard
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
    prevState?: State<TContext>
  ): Array<ActionObject<TContext, TEvent>> {
    const entryExitStates = transition.tree
      ? transition.tree.resolved.getEntryExitStates(
          prevState ? this.getStateTree(prevState.value) : undefined
        )
      : { entry: [], exit: [] };
    const doneEvents = transition.tree
      ? transition.tree.getDoneEvents(new Set(entryExitStates.entry))
      : [];

    if (!transition.source) {
      entryExitStates.exit = [];

      // Ensure that root StateNode (machine) is entered
      entryExitStates.entry.unshift(this);
    }

    const entryStates = new Set(entryExitStates.entry);
    const exitStates = new Set(entryExitStates.exit);

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
    event: OmniEvent<TEvent>,
    context?: TContext
  ): State<TContext, TEvent> {
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
    );

    if (stateTransition.tree) {
      stateTransition.tree = stateTransition.tree.resolved;
    }

    // const prevConfig = this.machine.getStateNodes(currentState.value);

    // const cv = getValue(
    //   this.machine,
    //   getConfiguration(prevConfig, stateTransition.configuration)
    // );

    // if (stateTransition.tree) {
    //   const eq = stateValuesEqual(cv, stateTransition.tree.value);
    //   console.log(eq);
    // }
    // if (!eq) {
    //   console.log('prevConfig', prevConfig.map(c => c.id));
    //   console.log('config', [...stateTransition.configuration].map(c => c.id));
    //   console.log(cv, stateTransition.tree!.value);
    // }

    return this.resolveTransition(stateTransition, currentState, eventObject);
  }
  private resolveTransition(
    stateTransition: StateTransition<TContext, TEvent>,
    currentState?: State<TContext, TEvent>,
    _eventObject?: OmniEventObject<TEvent>
  ): State<TContext, TEvent> {
    const resolvedStateValue = stateTransition.tree
      ? stateTransition.tree.value
      : undefined;
    const historyValue = currentState
      ? currentState.historyValue
        ? currentState.historyValue
        : stateTransition.source
        ? (this.machine.historyValue(currentState.value) as HistoryValue)
        : undefined
      : undefined;
    const currentContext = currentState
      ? currentState.context
      : stateTransition.context || this.machine.context!;
    const eventObject = _eventObject || { type: ActionTypes.Init };

    if (!IS_PRODUCTION && stateTransition.tree) {
      try {
        this.ensureValidPaths(stateTransition.tree.paths); // TODO: ensure code coverage for this
      } catch (e) {
        throw new Error(
          `Event '${
            eventObject ? eventObject.type : 'none'
          }' leads to an invalid configuration: ${e.message}`
        );
      }
    }

    const actions = this.getActions(stateTransition, currentState);
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
      ? this.options.updater(currentContext, eventObject, assignActions)
      : currentContext;

    const resolvedActions = flatten(
      nonEventActions.map(actionObject => {
        if (actionObject.type === actionTypes.send) {
          const sendAction = resolveSend(
            actionObject as SendAction<TContext, OmniEventObject<TEvent>>,
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
      tree: resolvedStateValue
        ? stateTransition.tree
        : currentState
        ? currentState.tree
        : undefined
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
        raisedEvent.type === actionTypes.nullEvent
          ? raisedEvent
          : (raisedEvent as RaisedEvent<TEvent>).event,
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

  private ensureValidPaths(paths: string[][]): void {
    if (!IS_PRODUCTION) {
      const visitedParents = new Map<
        StateNode<TContext, any, TEvent>,
        Array<StateNode<TContext, any, TEvent>>
      >();

      const stateNodes = flatten(
        paths.map(_path => this.getRelativeStateNodes(_path))
      );

      outer: for (const stateNode of stateNodes) {
        let marker = stateNode;

        while (marker.parent) {
          if (visitedParents.has(marker.parent)) {
            if (marker.parent.type === 'parallel') {
              continue outer;
            }

            throw new Error(
              `State node '${stateNode.id}' shares parent '${
                marker.parent.id
              }' with state node '${visitedParents
                .get(marker.parent)!
                .map(a => a.id)}'`
            );
          }

          if (!visitedParents.get(marker.parent)) {
            visitedParents.set(marker.parent, [stateNode]);
          } else {
            visitedParents.get(marker.parent)!.push(stateNode);
          }

          marker = marker.parent;
        }
      }
    } else {
      return;
    }
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
    context: TContext = this.machine.context!
  ): State<TContext, TEvent> {
    const tree = this.getStateTree(stateValue);
    const configuration = this.getStateNodes(stateValue);
    configuration.forEach(stateNode => {
      tree.addReentryNode(stateNode);
    });

    return this.resolveTransition({
      tree,
      configuration,
      entrySet: configuration,
      transitions: [],
      source: undefined,
      actions: [],
      context
    });
  }

  /**
   * The initial State instance, which includes all actions to be executed from
   * entering the initial state.
   */
  public get initialState(): State<TContext, TEvent> {
    if (this.__cache.initialState) {
      return this.__cache.initialState;
    }
    const { initialStateValue } = this;

    if (!initialStateValue) {
      throw new Error(
        `Cannot retrieve initial state from simple state '${this.id}'.`
      );
    }

    this.__cache.initialState = this.getInitialState(initialStateValue);

    return this.__cache.initialState;
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
    relativeStateId: string | string[],
    historyValue?: HistoryValue,
    resolve: boolean = true
  ): Array<StateNode<TContext, any, TEvent>> {
    if (isString(relativeStateId) && isStateId(relativeStateId)) {
      const unresolvedStateNode = this.getStateNodeById(relativeStateId);

      return resolve
        ? unresolvedStateNode.type === 'history'
          ? unresolvedStateNode.resolveHistory(historyValue)
          : unresolvedStateNode.initialStateNodes
        : [unresolvedStateNode];
    }

    const statePath = toStatePath(relativeStateId, this.delimiter);

    const rootStateNode = this.parent || this;

    const unresolvedStateNodes = rootStateNode.getFromRelativePath(
      statePath,
      historyValue
    );

    if (!resolve) {
      return unresolvedStateNodes;
    }
    return flatten(
      unresolvedStateNodes.map(stateNode => stateNode.initialStateNodes)
    );
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
        return `#${_target.id}`;
      }

      if (isStateId(_target)) {
        return _target
      }

      const isInternalTarget = _target[0] === this.delimiter;
      internal = internal === undefined ? isInternalTarget : internal;

      // If internal target is defined on machine,
      // do not include machine key on target
      if (isInternalTarget && !this.parent) {
        return `#${this.getStateNodeByPath(_target.slice(1)).id}`;
      }

      const resolvedTarget = isInternalTarget
        ? this.key + _target
        : `${_target}`;

      try {
        if (!this.parent) {
          throw new Error(`Child state '${resolvedTarget}' does not exist on '${this.id}'`);
        }
        const targetStateNode = this.parent.getStateNodeByPath(
          resolvedTarget
        );
        return `#${targetStateNode.id}`;
      } catch (err) {
        throw new Error(
          `Invalid transition for state node '${this.id}' on event '${event}':\n${err.message}`
        );
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
    const onConfig = this.config.on || EMPTY_OBJECT;
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
      (value: TransitionConfig<TContext, TEvent> | string | StateMachine<any, any, any> | undefined, event) => {
        if (value === undefined) {
          return [{ target: undefined, event, actions: [], internal: true }];
        }

        if (isArray(value)) {
          return value.map(targetTransitionConfig =>
            this.formatTransition(
              targetTransitionConfig.target,
              targetTransitionConfig,
              event
            )
          );
        }

        if (isString(value) || isMachine(value)) {
          return [this.formatTransition([value], undefined, event)];
        }

        if (!IS_PRODUCTION) {
          for (const key of keys(value)) {
            if (
              ['target', 'actions', 'internal', 'in', 'cond', 'event'].indexOf(
                key
              ) === -1
            ) {
              throw new Error(
                // tslint:disable-next-line:max-line-length
                `State object mapping of transitions is deprecated. Check the config for event '${event}' on state '${this.id}'.`
              );
            }
          }
        }

        return [this.formatTransition(value.target, value, event)];
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
