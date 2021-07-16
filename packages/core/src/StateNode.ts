import {
  getEventType,
  mapValues,
  flatten,
  toArray,
  keys,
  isString,
  toInvokeConfig,
  toInvokeSource,
  isFunction
} from './utils';
import {
  Event,
  Transitions,
  EventObject,
  HistoryStateNodeConfig,
  StateNodeDefinition,
  TransitionDefinition,
  DelayedTransitionDefinition,
  StateNodeConfig,
  StatesDefinition,
  StateNodesConfig,
  FinalStateNodeConfig,
  InvokeDefinition,
  ActionObject,
  Mapper,
  PropertyMapper,
  NullEvent,
  SCXML,
  TransitionDefinitionMap,
  InitialTransitionDefinition,
  MachineContext
} from './types';
import { State } from './State';
import * as actionTypes from './actionTypes';
import { toActionObject } from './actions';
import { formatInitialTransition } from './stateUtils';
import {
  getDelayedTransitions,
  formatTransitions,
  getCandidates
} from './stateUtils';
import { evaluateGuard } from './guards';
import { StateMachine } from './StateMachine';

const EMPTY_OBJECT = {};

interface StateNodeOptions<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  _key: string;
  _parent?: StateNode<TContext, TEvent>;
  _machine: StateMachine<TContext, TEvent>;
}

export class StateNode<
  TContext extends MachineContext = MachineContext,
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
   * The child state nodes.
   */
  public states: StateNodesConfig<TContext, TEvent>;
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
  public entry: Array<ActionObject<TContext, TEvent>>;
  /**
   * The action(s) to be executed upon exiting the state node.
   */
  public exit: Array<ActionObject<TContext, TEvent>>;
  /**
   * The parent state node.
   */
  public parent?: StateNode<TContext, TEvent>;
  /**
   * The root machine node.
   */
  public machine: StateMachine<TContext, TEvent>;
  /**
   * The meta data associated with this state node, which will be returned in State instances.
   */
  public meta?: any;
  /**
   * The data sent with the "done.state._id_" event if this is a final state node.
   */
  public doneData?:
    | Mapper<TContext, TEvent, any>
    | PropertyMapper<TContext, TEvent, any>;
  /**
   * The order this state node appears. Corresponds to the implicit SCXML document order.
   */
  public order: number = -1;

  // TODO: make private
  public __cache = {
    events: undefined as Array<TEvent['type']> | undefined,
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
      | undefined,
    invoke: undefined as Array<InvokeDefinition<TContext, TEvent>> | undefined
  };

  private __initial?: InitialTransitionDefinition<TContext, TEvent>;

  public tags: string[] = [];

  constructor(
    /**
     * The raw config used to create the machine.
     */
    public config: StateNodeConfig<TContext, TEvent>,
    options: StateNodeOptions<TContext, TEvent>
  ) {
    this.parent = options._parent;
    this.key = this.config.key || options._key;
    this.machine = options._machine;
    this.path = this.parent ? this.parent.path.concat(this.key) : [];
    this.id =
      this.config.id ||
      [this.machine.key, ...this.path].join(this.machine.delimiter);
    this.type =
      this.config.type ||
      (this.config.states && keys(this.config.states).length
        ? 'compound'
        : this.config.history
        ? 'history'
        : 'atomic');

    this.order = this.machine.idMap.size;
    this.machine.idMap.set(this.id, this);

    this.states = (this.config.states
      ? mapValues(
          this.config.states,
          (stateConfig: StateNodeConfig<TContext, TEvent>, key) => {
            const stateNode = new StateNode(stateConfig, {
              _parent: this,
              _key: key as string,
              _machine: this.machine
            });
            return stateNode;
          }
        )
      : EMPTY_OBJECT) as StateNodesConfig<TContext, TEvent>;

    if (this.type === 'compound' && !this.config.initial) {
      throw new Error(
        `No initial state specified for compound state node "#${
          this.id
        }". Try adding { initial: "${
          Object.keys(this.states)[0]
        }" } to the state config.`
      );
    }

    // History config
    this.history =
      this.config.history === true ? 'shallow' : this.config.history || false;

    this.entry = toArray(this.config.entry).map((action) =>
      toActionObject(action)
    );

    this.exit = toArray(this.config.exit).map((action) =>
      toActionObject(action)
    );
    this.meta = this.config.meta;
    this.doneData =
      this.type === 'final'
        ? (this.config as FinalStateNodeConfig<TContext, TEvent>).data
        : undefined;
    this.tags = toArray(config.tags);
  }

  /**
   * The well-structured state node definition.
   */
  public get definition(): StateNodeDefinition<TContext, TEvent> {
    return {
      id: this.id,
      key: this.key,
      version: this.machine.version,
      context: this.machine.context,
      type: this.type,
      initial: this.initial
        ? {
            target: this.initial.target,
            source: this,
            actions: this.initial.actions,
            eventType: null as any,
            toJSON: () => ({
              target: this.initial!.target!.map((t) => `#${t.id}`),
              source: `#${this.id}`,
              actions: this.initial!.actions,
              eventType: null as any
            })
          }
        : undefined,
      history: this.history,
      states: mapValues(this.states, (state: StateNode<TContext, TEvent>) => {
        return state.definition;
      }) as StatesDefinition<TContext, TEvent>,
      on: this.on,
      transitions: this.transitions,
      entry: this.entry,
      exit: this.exit,
      meta: this.meta,
      order: this.order || -1,
      data: this.doneData,
      invoke: this.invoke
    };
  }

  public toJSON() {
    return this.definition;
  }

  /**
   * The behaviors invoked as actors by this state node.
   */
  public get invoke(): Array<InvokeDefinition<TContext, TEvent>> {
    return (
      this.__cache.invoke ||
      (this.__cache.invoke = toArray(this.config.invoke).map((invocable, i) => {
        const id = `${this.id}:invocation[${i}]`;

        const invokeConfig = toInvokeConfig(invocable, id);
        const resolvedId = invokeConfig.id || id;

        const resolvedSrc = toInvokeSource(
          isString(invokeConfig.src)
            ? invokeConfig.src
            : typeof invokeConfig.src === 'object' && invokeConfig.src !== null
            ? invokeConfig.src
            : resolvedId
        );

        if (
          !this.machine.options.actors[resolvedSrc.type] &&
          isFunction(invokeConfig.src)
        ) {
          this.machine.options.actors = {
            ...this.machine.options.actors,
            [resolvedSrc.type]: invokeConfig.src
          };
        }

        return {
          type: actionTypes.invoke,
          ...invokeConfig,
          src: resolvedSrc,
          id: resolvedId,
          toJSON() {
            const { onDone, onError, ...invokeDefValues } = invokeConfig;
            return {
              ...invokeDefValues,
              type: actionTypes.invoke,
              src: resolvedSrc,
              id: resolvedId
            };
          }
        } as InvokeDefinition<TContext, TEvent>;
      }))
    );
  }

  /**
   * The mapping of events to transitions.
   */
  public get on(): TransitionDefinitionMap<TContext, TEvent> {
    if (this.__cache.on) {
      return this.__cache.on;
    }

    const transitions = this.transitions;

    return (this.__cache.on = transitions.reduce((map, transition) => {
      map[transition.eventType] = map[transition.eventType] || [];
      map[transition.eventType].push(transition as any);
      return map;
    }, {} as TransitionDefinitionMap<TContext, TEvent>));
  }

  public get after(): Array<DelayedTransitionDefinition<TContext, TEvent>> {
    return (
      this.__cache.delayedTransitions ||
      ((this.__cache.delayedTransitions = getDelayedTransitions(this)),
      this.__cache.delayedTransitions)
    );
  }

  /**
   * All the transitions that can be taken from this state node.
   */
  public get transitions(): Array<TransitionDefinition<TContext, TEvent>> {
    return (
      this.__cache.transitions ||
      ((this.__cache.transitions = formatTransitions(this)),
      this.__cache.transitions)
    );
  }

  public get initial(): InitialTransitionDefinition<TContext, TEvent> {
    return (
      this.__initial ||
      ((this.__initial = formatInitialTransition(
        this,
        this.config.initial || []
      )),
      this.__initial)
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

  public next(
    state: State<TContext, TEvent>,
    _event: SCXML.Event<TEvent>
  ): Transitions<TContext, TEvent> | undefined {
    const eventName = _event.name;
    const actions: Array<ActionObject<TContext, TEvent>> = [];

    let selectedTransition: TransitionDefinition<TContext, TEvent> | undefined;

    const candidates: Array<TransitionDefinition<TContext, TEvent>> =
      this.__cache.candidates[eventName] ||
      (this.__cache.candidates[eventName] = getCandidates(
        this,
        eventName,
        this.machine.config.scxml // Whether token matching should be used
      ));

    for (const candidate of candidates) {
      const { guard } = candidate;
      const resolvedContext = state.context;

      let guardPassed = false;

      try {
        guardPassed =
          !guard ||
          evaluateGuard<TContext, TEvent>(
            guard,
            resolvedContext,
            _event,
            state
          );
      } catch (err) {
        throw new Error(
          `Unable to evaluate guard '${
            guard!.type
          }' in transition for event '${eventName}' in state node '${
            this.id
          }':\n${err.message}`
        );
      }

      if (guardPassed) {
        actions.push(...candidate.actions);
        selectedTransition = candidate;
        break;
      }
    }

    return selectedTransition ? [selectedTransition] : undefined;
  }

  /**
   * The target state value of the history state node, if it exists. This represents the
   * default state value to transition to if no history value exists yet.
   */
  public get target(): string | undefined {
    if (this.type === 'history') {
      const historyConfig = this.config as HistoryStateNodeConfig<
        TContext,
        TEvent
      >;
      return historyConfig.target;
    }

    return undefined;
  }

  /**
   * All the state node IDs of this state node and its descendant state nodes.
   */
  public get stateIds(): string[] {
    const childStateIds = flatten(
      keys(this.states).map((stateKey) => {
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
        .filter((transition) => {
          return !(
            !transition.target &&
            !transition.actions.length &&
            transition.internal
          );
        })
        .map((transition) => transition.eventType)
    );

    return Array.from(events);
  }
}
