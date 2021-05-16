import { EventObject, StateNode, StateValue } from '.';
import {
  keys,
  flatten,
  toStatePath,
  toArray,
  isArray,
  isFunction,
  isString,
  toTransitionConfigArray,
  normalizeTarget,
  toStateValue,
  mapContext,
  toSCXMLEvent,
  warn
} from './utils';
import {
  TransitionConfig,
  TransitionDefinition,
  DelayedTransitionDefinition,
  NullEvent,
  SingleOrArray,
  Typestate,
  DelayExpr,
  SCXML,
  Transitions,
  ActionObject,
  StateValueMap,
  HistoryValue,
  InitialTransitionConfig,
  InitialTransitionDefinition,
  Event,
  StopActionObject
} from './types';
import { State } from './State';
import {
  send,
  cancel,
  after,
  done,
  doneInvoke,
  error,
  toActionObjects,
  stop,
  initEvent,
  actionTypes,
  invoke
} from './actions';
import { STATE_IDENTIFIER, NULL_EVENT, WILDCARD } from './constants';
import { isSpawnedActorRef } from './Actor';
import { MachineNode } from './MachineNode';
import { evaluateGuard, toGuardDefinition } from './guards';
import { resolveActionsAndContext } from './actions/resolveActionsAndContext';
import { IS_PRODUCTION } from './environment';

type Configuration<TC, TE extends EventObject> = Iterable<StateNode<TC, TE>>;

type AdjList<TC, TE extends EventObject> = Map<
  StateNode<TC, TE>,
  Array<StateNode<TC, TE>>
>;

export const isAtomicStateNode = (stateNode: StateNode<any, any>) =>
  stateNode.type === 'atomic' || stateNode.type === 'final';

export function getChildren<TC, TE extends EventObject>(
  stateNode: StateNode<TC, TE>
): Array<StateNode<TC, TE>> {
  return keys(stateNode.states).map((key) => stateNode.states[key]);
}

export function getProperAncestors<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  toStateNode: StateNode<TContext, TEvent> | null
): Array<typeof stateNode> {
  const ancestors: Array<typeof stateNode> = [];

  // add all ancestors
  let m = stateNode.parent;
  while (m && m !== toStateNode) {
    ancestors.push(m);
    m = m.parent;
  }

  return ancestors;
}

export function getAllStateNodes<TC, TE extends EventObject>(
  stateNode: StateNode<TC, TE>
): Array<StateNode<TC, TE>> {
  const stateNodes = [stateNode];

  if (isAtomicStateNode(stateNode)) {
    return stateNodes;
  }

  return stateNodes.concat(
    flatten(getChildren(stateNode).map(getAllStateNodes))
  );
}

export function getConfiguration<TC, TE extends EventObject>(
  stateNodes: Iterable<StateNode<TC, TE>>
): Iterable<StateNode<TC, TE>> {
  const configuration = new Set(stateNodes);
  const mutConfiguration = new Set(stateNodes);

  const adjList = getAdjList(mutConfiguration);

  // add descendants
  for (const s of configuration) {
    // if previously active, add existing child nodes
    if (s.type === 'compound' && (!adjList.get(s) || !adjList.get(s)!.length)) {
      getInitialStateNodes(s).forEach((sn) => mutConfiguration.add(sn));
    } else {
      if (s.type === 'parallel') {
        for (const child of getChildren(s)) {
          if (child.type === 'history') {
            continue;
          }

          if (!mutConfiguration.has(child)) {
            getInitialStateNodes(child).forEach((sn) =>
              mutConfiguration.add(sn)
            );
          }
        }
      }
    }
  }

  // add all ancestors
  for (const s of mutConfiguration) {
    let m = s.parent;

    while (m) {
      mutConfiguration.add(m);
      m = m.parent;
    }
  }

  return mutConfiguration;
}

function getValueFromAdj<TC, TE extends EventObject>(
  baseNode: StateNode<TC, TE>,
  adjList: AdjList<TC, TE>
): StateValue {
  const childStateNodes = adjList.get(baseNode);

  if (!childStateNodes) {
    return {}; // todo: fix?
  }

  if (baseNode.type === 'compound') {
    const childStateNode = childStateNodes[0];
    if (childStateNode) {
      if (isAtomicStateNode(childStateNode)) {
        return childStateNode.key;
      }
    } else {
      return {};
    }
  }

  const stateValue = {};
  childStateNodes.forEach((csn) => {
    stateValue[csn.key] = getValueFromAdj(csn, adjList);
  });

  return stateValue;
}

export function getAdjList<TC, TE extends EventObject>(
  configuration: Configuration<TC, TE>
): AdjList<TC, TE> {
  const adjList: AdjList<TC, TE> = new Map();

  for (const s of configuration) {
    if (!adjList.has(s)) {
      adjList.set(s, []);
    }

    if (s.parent) {
      if (!adjList.has(s.parent)) {
        adjList.set(s.parent, []);
      }

      adjList.get(s.parent)!.push(s);
    }
  }

  return adjList;
}

export function getStateValue<TC, TE extends EventObject>(
  rootNode: StateNode<TC, TE>,
  configuration: Configuration<TC, TE>
): StateValue {
  const config = getConfiguration(configuration);
  return getValueFromAdj(rootNode, getAdjList(config));
}

export function has<T>(iterable: Iterable<T>, item: T): boolean {
  if (Array.isArray(iterable)) {
    return iterable.some((member) => member === item);
  }

  if (iterable instanceof Set) {
    return iterable.has(item);
  }

  return false; // TODO: fix
}

export function nextEvents<TC, TE extends EventObject>(
  configuration: Array<StateNode<TC, TE>>
): Array<TE['type']> {
  return [...new Set(flatten([...configuration.map((sn) => sn.ownEvents)]))];
}

export function isInFinalState<TC, TE extends EventObject>(
  configuration: Array<StateNode<TC, TE>>,
  stateNode: StateNode<TC, TE> = configuration[0].machine
): boolean {
  if (stateNode.type === 'compound') {
    return getChildren(stateNode).some(
      (s) => s.type === 'final' && has(configuration, s)
    );
  }
  if (stateNode.type === 'parallel') {
    return getChildren(stateNode).every((sn) =>
      isInFinalState(configuration, sn)
    );
  }

  return false;
}

export const isStateId = (str: string) => str[0] === STATE_IDENTIFIER;

export function getCandidates<TEvent extends EventObject>(
  stateNode: StateNode<any, TEvent>,
  receivedEventType: TEvent['type'] | NullEvent['type'],
  /**
   * If `true`, will use SCXML event partial token matching semantics
   * without the need for the ".*" suffix
   */
  partialMatch: boolean = false
): Array<TransitionDefinition<any, TEvent>> {
  const transient = receivedEventType === NULL_EVENT;
  const candidates = stateNode.transitions.filter((transition) => {
    const { eventType } = transition;
    // First, check the trivial case: event names are exactly equal
    if (eventType === receivedEventType) {
      return true;
    }

    // Transient transitions can't match non-transient events
    if (transient) {
      return false;
    }

    // Then, check if transition is a wildcard transition,
    // which matches any non-transient events
    if (eventType === WILDCARD) {
      return true;
    }

    if (!partialMatch && !eventType.endsWith('.*')) {
      return false;
    }

    if (!IS_PRODUCTION) {
      warn(
        !/.*\*.+/.test(eventType),
        `Wildcards can only be the last token of an event descriptor (e.g., "event.*") or the entire event descriptor ("*"). Check the "${eventType}" event.`
      );
    }

    const partialEventTokens = eventType.split('.');
    const eventTokens = receivedEventType.split('.');

    for (
      let tokenIndex = 0;
      tokenIndex < partialEventTokens.length;
      tokenIndex++
    ) {
      const partialEventToken = partialEventTokens[tokenIndex];
      const eventToken = eventTokens[tokenIndex];

      if (partialEventToken === '*') {
        const isLastToken = tokenIndex === partialEventTokens.length - 1;

        if (!IS_PRODUCTION) {
          warn(
            isLastToken,
            `Infix wildcards in transition events are not allowed. Check the "${eventType}" event.`
          );
        }

        return isLastToken;
      }

      if (partialEventToken !== eventToken) {
        return false;
      }
    }

    return true;
  });

  return candidates;
}
/**
 * All delayed transitions from the config.
 */
export function getDelayedTransitions<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>
): Array<DelayedTransitionDefinition<TContext, TEvent>> {
  const afterConfig = stateNode.config.after;
  if (!afterConfig) {
    return [];
  }
  const mutateEntryExit = (
    delay: string | number | DelayExpr<TContext, TEvent>,
    i: number
  ) => {
    const delayRef = isFunction(delay) ? `${stateNode.id}:delay[${i}]` : delay;
    const eventType = after(delayRef, stateNode.id);
    stateNode.entry.push(send(eventType, { delay }));
    stateNode.exit.push(cancel(eventType));
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
          return toArray(resolvedTransition).map((transition) => ({
            ...transition,
            event: eventType,
            delay: resolvedDelay
          }));
        })
      );
  return delayedTransitions.map((delayedTransition) => {
    const { delay } = delayedTransition;
    return {
      ...formatTransition(stateNode, delayedTransition),
      delay
    };
  });
}

export function formatTransition<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
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
          (_target) =>
            isString(_target) && _target[0] === stateNode.machine.delimiter
        )
      : true;
  const { guards } = stateNode.machine.options;
  const target = resolveTarget(stateNode, normalizedTarget);
  if (!IS_PRODUCTION && (transitionConfig as any).cond) {
    throw new Error(
      `State "${stateNode.id}" has declared \`cond\` for one of its transitions. This property has been renamed to \`guard\`. Please update your code.`
    );
  }
  const transition = {
    ...transitionConfig,
    actions: toActionObjects(toArray(transitionConfig.actions)),
    guard: transitionConfig.guard
      ? toGuardDefinition(
          transitionConfig.guard,
          (guardType) => guards[guardType]
        )
      : undefined,
    target,
    source: stateNode,
    internal,
    eventType: transitionConfig.event,
    toJSON: () => ({
      ...transition,
      source: `#${stateNode.id}`,
      target: target ? target.map((t) => `#${t.id}`) : undefined
    })
  };

  Object.defineProperty(transition, 'toJSON', {
    value: () => ({
      ...transition,
      target: transition.target
        ? transition.target.map((t) => `#${t.id}`)
        : undefined,
      source: `#${stateNode.id}`
    })
  });

  return transition;
}
export function formatTransitions<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>
): Array<TransitionDefinition<TContext, TEvent>> {
  let onConfig: Array<
    TransitionConfig<TContext, EventObject> & {
      event: string;
    }
  >;
  if (!stateNode.config.on) {
    onConfig = [];
  } else if (Array.isArray(stateNode.config.on)) {
    onConfig = stateNode.config.on;
  } else {
    const {
      [WILDCARD]: wildcardConfigs = [],
      ...strictOnConfigs
    } = stateNode.config.on;
    onConfig = flatten(
      keys(strictOnConfigs)
        .map((key) => {
          const arrayified = toTransitionConfigArray<TContext, EventObject>(
            key,
            strictOnConfigs![key as string]
          );
          // TODO: add dev-mode validation for unreachable transitions
          return arrayified;
        })
        .concat(
          toTransitionConfigArray(
            WILDCARD,
            wildcardConfigs as SingleOrArray<
              TransitionConfig<TContext, EventObject> & {
                event: '*';
              }
            >
          )
        )
    );
  }
  const doneConfig = stateNode.config.onDone
    ? toTransitionConfigArray(
        String(done(stateNode.id)),
        stateNode.config.onDone
      )
    : [];
  const eventlessConfig = stateNode.config.always
    ? toTransitionConfigArray('', stateNode.config.always)
    : [];
  const invokeConfig = flatten(
    stateNode.invoke.map((invokeDef) => {
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
  const delayedTransitions = stateNode.after;
  const formattedTransitions = flatten(
    [...doneConfig, ...invokeConfig, ...onConfig, ...eventlessConfig].map(
      (
        transitionConfig: TransitionConfig<TContext, TEvent> & {
          event: TEvent['type'] | NullEvent['type'] | '*';
        }
      ) =>
        toArray(transitionConfig).map((transition) =>
          formatTransition(stateNode, transition)
        )
    )
  );
  for (const delayedTransition of delayedTransitions) {
    formattedTransitions.push(delayedTransition as any);
  }
  return formattedTransitions;
}

export function formatInitialTransition<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  _target: SingleOrArray<string> | InitialTransitionConfig<TContext, TEvent>
): InitialTransitionDefinition<TContext, TEvent> {
  if (isString(_target) || isArray(_target)) {
    const targets = toArray(_target).map((t) => {
      // Resolve state string keys (which represent children)
      // to their state node
      const descStateNode = isString(t)
        ? isStateId(t)
          ? stateNode.machine.getStateNodeById(t)
          : stateNode.states[t]
        : t;

      if (!descStateNode) {
        throw new Error(
          `Initial state node "${t}" not found on parent state node #${stateNode.id}`
        );
      }

      if (!isDescendant(descStateNode, stateNode)) {
        throw new Error(
          `Invalid initial target: state node #${descStateNode.id} is not a descendant of #${stateNode.id}`
        );
      }

      return descStateNode;
    });
    const resolvedTarget = resolveTarget(stateNode, targets);

    const transition = {
      source: stateNode,
      actions: [],
      eventType: null as any,
      target: resolvedTarget!,
      toJSON: () => ({
        ...transition,
        source: `#${stateNode.id}`,
        target: resolvedTarget
          ? resolvedTarget.map((t) => `#${t.id}`)
          : undefined
      })
    };

    return transition;
  }

  return formatTransition(stateNode, {
    target: toArray(_target.target).map((t) => {
      if (isString(t)) {
        return isStateId(t) ? t : `${stateNode.machine.delimiter}${t}`;
      }

      return t;
    }),
    actions: _target.actions,
    event: null as any
  }) as InitialTransitionDefinition<TContext, TEvent>;
}

export function resolveTarget<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  _target: Array<string | StateNode<TContext, TEvent>> | undefined
): Array<StateNode<TContext, TEvent>> | undefined {
  if (_target === undefined) {
    // an undefined target signals that the state node should not transition from that state when receiving that event
    return undefined;
  }
  return _target.map((target) => {
    if (!isString(target)) {
      return target;
    }
    const isInternalTarget = target[0] === stateNode.machine.delimiter;
    // If internal target is defined on machine,
    // do not include machine key on target
    if (isInternalTarget && !stateNode.parent) {
      return getStateNodeByPath(stateNode, target.slice(1));
    }
    const resolvedTarget = isInternalTarget ? stateNode.key + target : target;
    if (stateNode.parent) {
      try {
        const targetStateNode = getStateNodeByPath(
          stateNode.parent,
          resolvedTarget
        );
        return targetStateNode;
      } catch (err) {
        throw new Error(
          `Invalid transition definition for state node '${stateNode.id}':\n${err.message}`
        );
      }
    } else {
      return getStateNodeByPath(stateNode, resolvedTarget);
    }
  });
}

function resolveHistoryTarget<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent> & { type: 'history' }
): Array<StateNode<TContext, TEvent>> {
  const normalizedTarget = normalizeTarget<TContext, TEvent>(stateNode.target);
  if (!normalizedTarget) {
    return stateNode.parent!.initial.target;
  }
  return normalizedTarget.map((t) =>
    typeof t === 'string' ? getStateNodeByPath(stateNode, t) : t
  );
}

function isHistoryNode<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>
): stateNode is StateNode<TContext, TEvent> & { type: 'history' } {
  return stateNode.type === 'history';
}

export function getInitialStateNodes<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>
): Array<StateNode<TContext, TEvent>> {
  const transitions = [
    {
      target: [stateNode],
      source: stateNode,
      actions: [],
      eventType: 'init',
      toJSON: null as any // TODO: fix
    }
  ];
  const mutStatesToEnter = new Set<StateNode<TContext, TEvent>>();
  const mutStatesForDefaultEntry = new Set<StateNode<TContext, TEvent>>();

  computeEntrySet(
    transitions,
    State.from({}),
    mutStatesToEnter,
    mutStatesForDefaultEntry
  );

  return [...mutStatesToEnter];
}
/**
 * Returns the child state node from its relative `stateKey`, or throws.
 */
export function getStateNode<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  stateKey: string
): StateNode<TContext, TEvent> {
  if (isStateId(stateKey)) {
    return getStateNodeById(stateNode.machine, stateKey);
  }
  if (!stateNode.states) {
    throw new Error(
      `Unable to retrieve child state '${stateKey}' from '${stateNode.id}'; no child states exist.`
    );
  }
  const result = stateNode.states[stateKey];
  if (!result) {
    throw new Error(
      `Child state '${stateKey}' does not exist on '${stateNode.id}'`
    );
  }
  return result;
}
/**
 * Returns the state node with the given `stateId`, or throws.
 *
 * @param stateId The state ID. The prefix "#" is removed.
 */
export function getStateNodeById<TContext, TEvent extends EventObject>(
  fromStateNode: StateNode<TContext, TEvent>,
  stateId: string
): StateNode<TContext, TEvent> {
  const resolvedStateId = isStateId(stateId)
    ? stateId.slice(STATE_IDENTIFIER.length)
    : stateId;
  if (resolvedStateId === fromStateNode.id) {
    return fromStateNode;
  }
  const stateNode = fromStateNode.machine.idMap[resolvedStateId];
  if (!stateNode) {
    throw new Error(
      `Child state node '#${resolvedStateId}' does not exist on machine '${fromStateNode.id}'`
    );
  }
  return stateNode;
}
/**
 * Returns the relative state node from the given `statePath`, or throws.
 *
 * @param statePath The string or string array relative path to the state node.
 */
function getStateNodeByPath<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  statePath: string | string[]
): StateNode<TContext, TEvent> {
  if (typeof statePath === 'string' && isStateId(statePath)) {
    try {
      return getStateNodeById(stateNode, statePath.slice(1));
    } catch (e) {
      // try individual paths
      // throw e;
    }
  }
  const arrayStatePath = toStatePath(
    statePath,
    stateNode.machine.delimiter
  ).slice();
  let currentStateNode: StateNode<TContext, TEvent> = stateNode;
  while (arrayStatePath.length) {
    const key = arrayStatePath.shift()!;
    if (!key.length) {
      break;
    }
    currentStateNode = getStateNode(currentStateNode, key);
  }
  return currentStateNode;
}

/**
 * Returns the state nodes represented by the current state value.
 *
 * @param state The state value or State instance
 */
export function getStateNodes<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  state: StateValue | State<TContext, TEvent>
): Array<StateNode<TContext, TEvent>> {
  const stateValue =
    state instanceof State
      ? state.value
      : toStateValue(state, stateNode.machine.delimiter);

  if (isString(stateValue)) {
    return [stateNode.states[stateValue]];
  }

  const childStateKeys = keys(stateValue);
  const childStateNodes: Array<
    StateNode<TContext, TEvent>
  > = childStateKeys
    .map((subStateKey) => getStateNode(stateNode, subStateKey))
    .filter(Boolean);

  return childStateNodes.concat(
    childStateKeys.reduce((allSubStateNodes, subStateKey) => {
      const subStateNode = getStateNode(stateNode, subStateKey);
      if (!subStateNode) {
        return allSubStateNodes;
      }
      const subStateNodes = getStateNodes(
        subStateNode,
        stateValue[subStateKey]
      );

      return allSubStateNodes.concat(subStateNodes);
    }, [] as Array<StateNode<TContext, TEvent>>)
  );
}

export function transitionLeafNode<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  stateValue: string,
  state: State<TContext, TEvent>,
  _event: SCXML.Event<TEvent>
): Transitions<TContext, TEvent> | undefined {
  const childStateNode = getStateNode(stateNode, stateValue);
  const next = childStateNode.next(state, _event);

  if (!next || !next.length) {
    return stateNode.next(state, _event);
  }

  return next;
}

export function transitionCompoundNode<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  stateValue: StateValueMap,
  state: State<TContext, TEvent>,
  _event: SCXML.Event<TEvent>
): Transitions<TContext, TEvent> | undefined {
  const subStateKeys = keys(stateValue);

  const childStateNode = getStateNode(stateNode, subStateKeys[0]);
  const next = transitionNode(
    childStateNode,
    stateValue[subStateKeys[0]],
    state,
    _event
  );

  if (!next || !next.length) {
    return stateNode.next(state, _event);
  }

  return next;
}
export function transitionParallelNode<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  stateValue: StateValueMap,
  state: State<TContext, TEvent>,
  _event: SCXML.Event<TEvent>
): Transitions<TContext, TEvent> | undefined {
  const transitionMap: Record<string, Transitions<TContext, TEvent>> = {};

  for (const subStateKey of keys(stateValue)) {
    const subStateValue = stateValue[subStateKey];

    if (!subStateValue) {
      continue;
    }

    const subStateNode = getStateNode(stateNode, subStateKey);
    const nextStateNode = transitionNode(
      subStateNode,
      subStateValue,
      state,
      _event
    );
    if (nextStateNode) {
      transitionMap[subStateKey] = nextStateNode;
    }
  }

  const transitions = keys(transitionMap).map((key) => transitionMap[key]);
  const enabledTransitions = flatten(transitions);

  const willTransition = transitions.some((st) => st.length > 0);

  if (!willTransition) {
    return stateNode.next(state, _event);
  }

  return enabledTransitions;
}

export function transitionNode<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  stateValue: StateValue,
  state: State<TContext, TEvent>,
  _event: SCXML.Event<TEvent>
): Transitions<TContext, TEvent> | undefined {
  // leaf node
  if (isString(stateValue)) {
    return transitionLeafNode(stateNode, stateValue, state, _event);
  }

  // hierarchical node
  if (keys(stateValue).length === 1) {
    return transitionCompoundNode(stateNode, stateValue, state, _event);
  }

  // orthogonal node
  return transitionParallelNode(stateNode, stateValue, state, _event);
}

function getHistoryNodes<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>
): Array<StateNode<TContext, TEvent>> {
  return getChildren(stateNode).filter((sn) => {
    return sn.type === 'history';
  });
}

function isDescendant<TC, TE extends EventObject>(
  childStateNode: StateNode<TC, TE>,
  parentStateNode: StateNode<TC, TE>
): boolean {
  let marker = childStateNode;
  while (marker.parent && marker.parent !== parentStateNode) {
    marker = marker.parent;
  }

  return marker.parent === parentStateNode;
}

function getPathFromRootToNode<TC, TE extends EventObject>(
  stateNode: StateNode<TC, TE>
): Array<StateNode<TC, TE>> {
  const path: Array<StateNode<TC, TE>> = [];
  let marker = stateNode.parent;

  while (marker) {
    path.unshift(marker);
    marker = marker.parent;
  }

  return path;
}

function hasIntersection<T>(s1: Iterable<T>, s2: Iterable<T>): boolean {
  const set1 = new Set(s1);
  const set2 = new Set(s2);

  for (const item of set1) {
    if (set2.has(item)) {
      return true;
    }
  }
  for (const item of set2) {
    if (set1.has(item)) {
      return true;
    }
  }
  return false;
}

export function removeConflictingTransitions<
  TContext,
  TEvent extends EventObject
>(
  enabledTransitions: Array<TransitionDefinition<TContext, TEvent>>,
  configuration: Set<StateNode<TContext, TEvent>>,
  state: State<TContext, TEvent>
): Array<TransitionDefinition<TContext, TEvent>> {
  const filteredTransitions = new Set<TransitionDefinition<TContext, TEvent>>();

  for (const t1 of enabledTransitions) {
    let t1Preempted = false;
    const transitionsToRemove = new Set<
      TransitionDefinition<TContext, TEvent>
    >();
    for (const t2 of filteredTransitions) {
      if (
        hasIntersection(
          computeExitSet([t1], configuration, state),
          computeExitSet([t2], configuration, state)
        )
      ) {
        if (isDescendant(t1.source, t2.source)) {
          transitionsToRemove.add(t2);
        } else {
          t1Preempted = true;
          break;
        }
      }
    }
    if (!t1Preempted) {
      for (const t3 of transitionsToRemove) {
        filteredTransitions.delete(t3);
      }
      filteredTransitions.add(t1);
    }
  }

  return Array.from(filteredTransitions);
}

function findLCCA<TContext, TEvent extends EventObject>(
  stateNodes: Array<StateNode<TContext, TEvent>>
): StateNode<TContext, TEvent> {
  const [head] = stateNodes;

  let current = getPathFromRootToNode(head);
  let candidates: Array<StateNode<TContext, TEvent>> = [];

  stateNodes.forEach((stateNode) => {
    const path = getPathFromRootToNode(stateNode);

    candidates = current.filter((sn) => path.includes(sn));
    current = candidates;
    candidates = [];
  });

  return current[current.length - 1];
}

function getEffectiveTargetStates<TC, TE extends EventObject>(
  transition: TransitionDefinition<TC, TE>,
  state: State<TC, TE>
): Array<StateNode<TC, TE>> {
  if (!transition.target) {
    return [];
  }

  const targets = new Set<StateNode<TC, TE>>();

  for (const s of transition.target) {
    if (isHistoryNode(s)) {
      if (state.historyValue[s.id]) {
        state.historyValue[s.id].forEach((node) => {
          targets.add(node);
        });
      } else {
        getEffectiveTargetStates(
          { target: resolveHistoryTarget(s) } as TransitionDefinition<TC, TE>,
          state
        ).forEach((node) => {
          targets.add(node);
        });
      }
    } else {
      targets.add(s);
    }
  }

  return [...targets];
}

function getTransitionDomain<TContext, TEvent extends EventObject>(
  transition: TransitionDefinition<TContext, TEvent>,
  state: State<TContext, TEvent>
): StateNode<TContext, TEvent> | null {
  const targetStates = getEffectiveTargetStates(transition, state);

  if (!targetStates) {
    return null;
  }

  if (
    transition.internal &&
    transition.source.type === 'compound' &&
    targetStates.every((targetStateNode) =>
      isDescendant(targetStateNode, transition.source)
    )
  ) {
    return transition.source;
  }

  const lcca = findLCCA(targetStates.concat(transition.source));

  return lcca;
}

function exitStates<TContext, TEvent extends EventObject>(
  transitions: Array<TransitionDefinition<TContext, TEvent>>,
  mutConfiguration: Set<StateNode<TContext, TEvent>>,
  state: State<TContext, TEvent>
) {
  const statesToExit = computeExitSet(transitions, mutConfiguration, state);
  const actions: Array<ActionObject<TContext, TEvent>> = [];

  statesToExit.forEach((stateNode) => {
    actions.push(...stateNode.invoke.map((def) => stop(def.id)));
  });

  statesToExit.sort((a, b) => b.order - a.order);

  const historyValue = resolveHistoryValue(state, statesToExit);

  for (const s of statesToExit) {
    actions.push(...flatten(s.exit));
    mutConfiguration.delete(s);
  }

  return {
    exitSet: statesToExit,
    historyValue,
    actions,
    configuration: mutConfiguration
  };
}

export function enterStates<TContext, TEvent extends EventObject>(
  transitions: Array<TransitionDefinition<TContext, TEvent>>,
  mutConfiguration: Set<StateNode<TContext, TEvent>>,
  state: State<TContext, TEvent>
) {
  const statesToInvoke: typeof mutConfiguration = new Set();
  const internalQueue: Array<SCXML.Event<TEvent>> = [];

  const actions: Array<ActionObject<TContext, TEvent>> = [];
  const mutStatesToEnter = new Set<StateNode<TContext, TEvent>>();
  const mutStatesForDefaultEntry = new Set<StateNode<TContext, TEvent>>();

  computeEntrySet(
    transitions,
    state,
    mutStatesToEnter,
    mutStatesForDefaultEntry
  );

  for (const stateNodeToEnter of [...mutStatesToEnter].sort(
    (a, b) => a.order - b.order
  )) {
    mutConfiguration.add(stateNodeToEnter);
    statesToInvoke.add(stateNodeToEnter);

    // Add entry actions
    actions.push(...stateNodeToEnter.entry);

    if (mutStatesForDefaultEntry.has(stateNodeToEnter)) {
      mutStatesForDefaultEntry.forEach((stateNode) => {
        actions.push(...stateNode.initial!.actions);
      });
    }
    // if (defaultHistoryContent[s.id]) {
    //   actions.push(...defaultHistoryContent[s.id])
    // }
    if (stateNodeToEnter.type === 'final') {
      const parent = stateNodeToEnter.parent!;

      if (!parent.parent) {
        continue;
      }

      internalQueue.push(
        toSCXMLEvent(
          done(
            parent!.id,
            stateNodeToEnter.doneData
              ? mapContext(
                  stateNodeToEnter.doneData,
                  state.context,
                  state._event
                )
              : undefined
          )
        )
      );

      if (parent.parent) {
        const grandparent = parent.parent;

        if (grandparent.type === 'parallel') {
          if (
            getChildren(grandparent).every((parentNode) =>
              isInFinalState([...mutConfiguration], parentNode)
            )
          ) {
            internalQueue.push(toSCXMLEvent(done(grandparent.id)));
          }
        }
      }
    }
  }

  return {
    statesToInvoke,
    internalQueue,
    actions
  };
}

function computeExitSet<TContext, TEvent extends EventObject>(
  transitions: Array<TransitionDefinition<TContext, TEvent>>,
  configuration: Set<StateNode<TContext, TEvent>>,
  state: State<TContext, TEvent>
): Array<StateNode<TContext, TEvent>> {
  const statesToExit = new Set<StateNode<TContext, TEvent>>();

  for (const t of transitions) {
    if (t.target && t.target.length) {
      const domain = getTransitionDomain(t, state);

      for (const s of configuration) {
        if (isDescendant(s, domain!)) {
          statesToExit.add(s);
        }
      }
    }
  }

  return [...statesToExit];
}

function computeEntrySet<TContext, TEvent extends EventObject>(
  transitions: Array<TransitionDefinition<TContext, TEvent>>,
  state: State<TContext, TEvent>,
  mutStatesToEnter: Set<StateNode<TContext, TEvent>>,
  mutStatesForDefaultEntry: Set<StateNode<TContext, TEvent>>
) {
  for (const t of transitions) {
    for (const s of t.target || []) {
      addDescendantStatesToEnter(
        s,
        state,
        mutStatesToEnter,
        mutStatesForDefaultEntry
      );
    }
    const ancestor = getTransitionDomain(t, state);
    const targetStates = getEffectiveTargetStates(t, state);
    for (const s of targetStates) {
      addAncestorStatesToEnter(
        s,
        ancestor,
        state,
        mutStatesToEnter,
        mutStatesForDefaultEntry
      );
    }
  }
}

function addDescendantStatesToEnter<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  state: State<TContext, TEvent>,
  mutStatesToEnter: Set<typeof stateNode>,
  mutStatesForDefaultEntry: Set<typeof stateNode>
) {
  if (isHistoryNode(stateNode)) {
    if (state.historyValue[stateNode.id]) {
      const historyStateNodes = state.historyValue[stateNode.id];
      for (const s of historyStateNodes) {
        addDescendantStatesToEnter(
          s,
          state,
          mutStatesToEnter,
          mutStatesForDefaultEntry
        );
      }
      for (const s of historyStateNodes) {
        addAncestorStatesToEnter(
          s,
          stateNode.parent!,
          state,
          mutStatesToEnter,
          mutStatesForDefaultEntry
        );
        mutStatesForDefaultEntry.forEach((stateForDefaultEntry) =>
          mutStatesForDefaultEntry.add(stateForDefaultEntry)
        );
      }
    } else {
      const targets = resolveHistoryTarget(stateNode);
      for (const s of targets) {
        addDescendantStatesToEnter(
          s,
          state,
          mutStatesToEnter,
          mutStatesForDefaultEntry
        );
      }
      for (const s of targets) {
        addAncestorStatesToEnter(
          s,
          stateNode,
          state,
          mutStatesToEnter,
          mutStatesForDefaultEntry
        );
        mutStatesForDefaultEntry.forEach((stateForDefaultEntry) =>
          mutStatesForDefaultEntry.add(stateForDefaultEntry)
        );
      }
    }
  } else {
    mutStatesToEnter.add(stateNode);
    if (stateNode.type === 'compound') {
      mutStatesForDefaultEntry.add(stateNode);
      const initialStates = stateNode.initial.target;

      for (const initialState of initialStates) {
        addDescendantStatesToEnter(
          initialState,
          state,
          mutStatesToEnter,
          mutStatesForDefaultEntry
        );
      }

      for (const initialState of initialStates) {
        addAncestorStatesToEnter(
          initialState,
          stateNode,
          state,
          mutStatesToEnter,
          mutStatesForDefaultEntry
        );
      }
    } else {
      if (stateNode.type === 'parallel') {
        for (const child of getChildren(stateNode).filter(
          (sn) => !isHistoryNode(sn)
        )) {
          if (![...mutStatesToEnter].some((s) => isDescendant(s, child))) {
            addDescendantStatesToEnter(
              child,
              state,
              mutStatesToEnter,
              mutStatesForDefaultEntry
            );
          }
        }
      }
    }
  }
}

function addAncestorStatesToEnter<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, TEvent>,
  toStateNode: StateNode<TContext, TEvent> | null,
  state: State<TContext, TEvent>,
  mutStatesToEnter: Set<typeof stateNode>,
  mutStatesForDefaultEntry: Set<typeof stateNode>
) {
  const properAncestors = getProperAncestors(stateNode, toStateNode);
  for (const anc of properAncestors) {
    mutStatesToEnter.add(anc);
    if (anc.type === 'parallel') {
      for (const child of getChildren(anc).filter((sn) => !isHistoryNode(sn))) {
        if (![...mutStatesToEnter].some((s) => isDescendant(s, child))) {
          addDescendantStatesToEnter(
            child,
            state,
            mutStatesToEnter,
            mutStatesForDefaultEntry
          );
        }
      }
    }
  }
}

/**
 * https://www.w3.org/TR/scxml/#microstepProcedure
 *
 * @private
 * @param transitions
 * @param currentState
 * @param mutConfiguration
 */
export function microstep<TContext, TEvent extends EventObject>(
  transitions: Array<TransitionDefinition<TContext, TEvent>>,
  currentState: State<TContext, TEvent> | undefined,
  mutConfiguration: Set<StateNode<TContext, TEvent>>,
  machine: MachineNode<TContext, TEvent>,
  _event: SCXML.Event<TEvent>
): {
  actions: Array<ActionObject<TContext, TEvent>>;
  configuration: typeof mutConfiguration;
  historyValue: HistoryValue<TContext, TEvent>;
  internalQueue: Array<SCXML.Event<TEvent>>;
  context: TContext;
} {
  const actions: Array<ActionObject<TContext, TEvent>> = [];

  const filteredTransitions = removeConflictingTransitions(
    transitions,
    mutConfiguration,
    currentState || State.from({})
  );

  let historyValue: HistoryValue<TContext, TEvent> = {};

  const internalQueue: Array<SCXML.Event<TEvent>> = [];

  // Exit states
  if (currentState) {
    const { historyValue: exitHistoryValue, actions: exitActions } = exitStates(
      filteredTransitions,
      mutConfiguration,
      currentState
    );

    actions.push(...exitActions);
    historyValue = exitHistoryValue;
  }

  // Transition
  const transitionActions = flatten(filteredTransitions.map((t) => t.actions));
  actions.push(...transitionActions);

  // Enter states
  const res = enterStates(
    filteredTransitions,
    mutConfiguration,
    currentState || State.from({})
  );

  // Start invocations
  actions.push(
    ...flatten(
      [...res.statesToInvoke].map((s) =>
        s.invoke.map((invokeDef) => invoke(invokeDef))
      )
    )
  );

  actions.push(...res.actions);

  const {
    actions: resolvedActions,
    raised,
    context
  } = resolveActionsAndContext(actions, machine, _event, currentState);

  internalQueue.push(...res.internalQueue);
  internalQueue.push(...raised.map((a) => a._event));

  return {
    actions: resolvedActions,
    configuration: mutConfiguration,
    historyValue,
    internalQueue,
    context
  };
}

function selectEventlessTransitions<TContext, TEvent extends EventObject>(
  state: State<TContext, TEvent, any>
): Transitions<TContext, TEvent> {
  const enabledTransitions: Set<
    TransitionDefinition<TContext, TEvent>
  > = new Set();

  const atomicStates = state.configuration.filter(isAtomicStateNode);

  for (const stateNode of atomicStates) {
    loop: for (const s of [stateNode].concat(
      getProperAncestors(stateNode, null)
    )) {
      for (const t of s.transitions) {
        if (
          t.eventType === NULL_EVENT &&
          (t.guard === undefined ||
            evaluateGuard<TContext, TEvent>(
              t.guard,
              state.context,
              toSCXMLEvent(NULL_EVENT as Event<TEvent>),
              state
            ))
        ) {
          enabledTransitions.add(t);
          break loop;
        }
      }
    }
  }

  return removeConflictingTransitions(
    Array.from(enabledTransitions),
    new Set(state.configuration),
    state
  );
}

export function resolveMicroTransition<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext>
>(
  machine: MachineNode<TContext, TEvent>,
  transitions: Transitions<TContext, TEvent>,
  currentState?: State<TContext, TEvent>,
  _event: SCXML.Event<TEvent> = initEvent as SCXML.Event<TEvent>
): State<TContext, TEvent, TTypestate> {
  // Transition will "apply" if:
  // - the state node is the initial state (there is no current state)
  // - OR there are transitions
  const willTransition = !currentState || transitions.length > 0;

  const prevConfig = getConfiguration(
    currentState ? currentState.configuration : [machine]
  );

  const resolved = microstep(
    currentState
      ? transitions
      : [
          {
            target: [...prevConfig].filter(isAtomicStateNode),
            source: machine,
            actions: [],
            eventType: null as any,
            toJSON: null as any // TODO: fix
          }
        ],
    currentState,
    new Set(prevConfig),
    machine,
    _event
  );

  if (currentState && !willTransition) {
    const inertState = State.inert(currentState, currentState.context);
    inertState.event = _event.data;
    inertState._event = _event;
    inertState.changed = _event.name === actionTypes.update;
    return inertState as any;
  }

  const children = currentState ? { ...currentState.children } : {};

  for (const action of resolved.actions) {
    if (action.type === actionTypes.stop) {
      const { actor: ref } = action as StopActionObject;
      if (isSpawnedActorRef(ref)) {
        delete children[ref.name];
      } else {
        delete children[ref as string];
      }
    }
  }

  const resolvedConfiguration = willTransition
    ? Array.from(resolved.configuration)
    : currentState
    ? currentState.configuration
    : [];

  const meta = resolvedConfiguration.reduce((acc, subStateNode) => {
    if (subStateNode.meta !== undefined) {
      acc[subStateNode.id] = subStateNode.meta;
    }
    return acc;
  }, {} as Record<string, string>);

  const currentContext = currentState ? currentState.context : machine.context;

  const { context, actions: nonRaisedActions } = resolved;

  const nextState = new State<TContext, TEvent, TTypestate>({
    value: getStateValue(machine, resolved.configuration),
    context,
    _event,
    // Persist _sessionid between states
    _sessionid: currentState ? currentState._sessionid : null,
    history: currentState,
    actions: nonRaisedActions,
    meta,
    configuration: resolvedConfiguration,
    transitions,
    children,
    historyValue: resolved.historyValue
  });

  nextState.changed = !currentState
    ? undefined
    : !stateValuesEqual(nextState.value, currentState.value) ||
      _event.name === actionTypes.update ||
      nextState.actions.length > 0 ||
      context !== currentContext;
  nextState._internalQueue = resolved.internalQueue;

  const isTransient = selectEventlessTransitions(nextState).length;

  if (isTransient) {
    nextState._internalQueue.unshift({
      type: actionTypes.nullEvent
    });
  }

  // Dispose of penultimate histories to prevent memory leaks
  const { history } = nextState;
  if (history) {
    delete history.history;
  }

  nextState.actions.forEach((action) => {
    if (action.type === actionTypes.invoke && action.ref) {
      children[action.ref.name] = action.ref;
    }
  });

  return nextState;
}

export function macrostep<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext>
>(
  state: State<TContext, TEvent, TTypestate>,
  event: Event<TEvent> | SCXML.Event<TEvent> | null,
  machine: MachineNode<TContext, TEvent, any>
): typeof state {
  // Assume the state is at rest (no raised events)
  // Determine the next state based on the next microstep
  const nextState = event === null ? state : machine.microstep(state, event);

  const { _internalQueue } = nextState;
  let maybeNextState = nextState;

  while (_internalQueue.length && !maybeNextState.done) {
    const _previousEvent = maybeNextState._event;
    const raisedEvent = _internalQueue.shift()!;
    const currentActions = maybeNextState.actions;

    maybeNextState = machine.microstep(
      maybeNextState,
      raisedEvent as SCXML.Event<TEvent>
    );

    _internalQueue.push(...maybeNextState._internalQueue);

    // Save original event to state
    if (raisedEvent.type === NULL_EVENT) {
      maybeNextState._event = _previousEvent;
      maybeNextState.event = _previousEvent.data;
    }

    // Since macrostep actions have not been executed yet,
    // prioritize them in the action queue
    maybeNextState.actions.unshift(...currentActions);
  }

  // Add tags
  maybeNextState.tags = new Set(
    flatten(maybeNextState.configuration.map((sn) => sn.tags))
  );

  return maybeNextState;
}

function resolveHistoryValue<TContext, TEvent extends EventObject>(
  currentState: State<TContext, TEvent, any> | undefined,
  exitSet: Array<StateNode<TContext, TEvent>>
): HistoryValue<TContext, TEvent> {
  const historyValue: Record<
    string,
    Array<StateNode<TContext, TEvent>>
  > = currentState ? currentState.historyValue : {};
  if (currentState && currentState.configuration) {
    // From SCXML algorithm: https://www.w3.org/TR/scxml/#exitStates
    for (const exitStateNode of exitSet) {
      for (const historyNode of getHistoryNodes(exitStateNode)) {
        let predicate: (sn: StateNode<TContext, TEvent>) => boolean;
        if (historyNode.history === 'deep') {
          predicate = (sn) =>
            isAtomicStateNode(sn) && isDescendant(sn, exitStateNode);
        } else {
          predicate = (sn) => {
            return sn.parent === exitStateNode;
          };
        }
        historyValue[historyNode.id] = currentState.configuration.filter(
          predicate
        );
      }
    }
  }
  return historyValue;
}

/**
 * Resolves a partial state value with its full representation in the state node's machine.
 *
 * @param stateValue The partial state value to resolve.
 */
export function resolveStateValue<TContext, TEvent extends EventObject>(
  rootNode: StateNode<TContext, TEvent>,
  stateValue: StateValue
): StateValue {
  const configuration = getConfiguration(
    getStateNodes(rootNode.machine, stateValue)
  );
  return getStateValue(rootNode, [...configuration]);
}

export function toState<TContext, TEvent extends EventObject>(
  state: StateValue | State<TContext, TEvent>,
  machine: MachineNode<TContext, TEvent>
): State<TContext, TEvent> {
  if (state instanceof State) {
    return state;
  } else {
    const resolvedStateValue = resolveStateValue(machine, state);
    const resolvedContext = machine.context!;

    return machine.resolveState(
      State.from<TContext, TEvent>(resolvedStateValue, resolvedContext)
    );
  }
}

export function stateValuesEqual(
  a: StateValue | undefined,
  b: StateValue | undefined
): boolean {
  if (a === b) {
    return true;
  }

  if (a === undefined || b === undefined) {
    return false;
  }

  if (isString(a) || isString(b)) {
    return a === b;
  }

  const aKeys = keys(a as StateValueMap);
  const bKeys = keys(b as StateValueMap);

  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => stateValuesEqual(a[key], b[key]))
  );
}
