import { EventObject, StateNode, StateValue } from '.';
import { TransitionDefinition } from './types';
import { keys, flatten, intersects, uniq } from './utils';

type Configuration<TC, TE extends EventObject> = Iterable<
  StateNode<TC, any, TE>
>;

type AdjList<TC, TE extends EventObject> = Map<
  StateNode<TC, any, TE>,
  Array<StateNode<TC, any, TE>>
>;

export const isLeafNode = (stateNode: StateNode<any, any, any>) =>
  stateNode.type === 'atomic' || stateNode.type === 'final';

export function getChildren<TContext, TEvent extends EventObject>(
  stateNode: StateNode<TContext, any, TEvent>
): Array<StateNode<TContext, any, TEvent>> {
  return keys(stateNode.states).map(key => stateNode.states[key]);
}

export function getAllStateNodes<TC, TE extends EventObject>(
  stateNode: StateNode<TC, any, TE>
): Array<StateNode<TC, any, TE>> {
  const stateNodes = [stateNode];

  if (isLeafNode(stateNode)) {
    return stateNodes;
  }

  return stateNodes.concat(
    flatten(getChildren(stateNode).map(getAllStateNodes))
  );
}

export function getConfiguration<TC, TE extends EventObject>(
  prevStateNodes: Iterable<StateNode<TC, any, TE>>,
  stateNodes: Iterable<StateNode<TC, any, TE>>
): Iterable<StateNode<TC, any, TE>> {
  const prevConfiguration = new Set(prevStateNodes);
  const prevAdjList = getAdjList(prevConfiguration);

  const configuration = new Set(stateNodes);

  // add all ancestors
  for (const stateNode of configuration) {
    let m = stateNode.parent;

    while (m && !configuration.has(m)) {
      configuration.add(m);
      m = m.parent;
    }
  }

  const adjList = getAdjList(configuration);

  // add descendants
  for (const s of configuration) {
    // if previously active, add existing child nodes
    if (s.type === 'compound' && (!adjList.get(s) || !adjList.get(s)!.length)) {
      if (prevAdjList.get(s)) {
        prevAdjList.get(s)!.forEach(sn => configuration.add(sn));
      } else {
        s.initialStateNodes.forEach(sn => configuration.add(sn));
      }
    } else {
      if (s.type === 'parallel') {
        for (const child of getChildren(s)) {
          if (child.type === 'history') {
            continue;
          }

          if (!configuration.has(child)) {
            configuration.add(child);

            if (prevAdjList.get(child)) {
              prevAdjList.get(child)!.forEach(sn => configuration.add(sn));
            } else {
              child.initialStateNodes.forEach(sn => configuration.add(sn));
            }
          }
        }
      }
    }
  }

  // add all ancestors
  for (const s of configuration) {
    let m = s.parent;

    while (m && !configuration.has(m)) {
      configuration.add(m);
      m = m.parent;
    }
  }

  return configuration;
}

function getValueFromAdj<TC, TE extends EventObject>(
  baseNode: StateNode<TC, any, TE>,
  adjList: AdjList<TC, TE>
): StateValue {
  const childStateNodes = adjList.get(baseNode);

  if (!childStateNodes) {
    return {}; // todo: fix?
  }

  if (baseNode.type === 'compound') {
    const childStateNode = childStateNodes[0];
    if (childStateNode) {
      if (isLeafNode(childStateNode)) {
        return childStateNode.key;
      }
    } else {
      return {};
    }
  }

  const stateValue = {};
  childStateNodes.forEach(csn => {
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

export function getValue<TC, TE extends EventObject>(
  rootNode: StateNode<TC, any, TE>,
  configuration: Configuration<TC, TE>
): StateValue {
  const config = getConfiguration([rootNode], configuration);

  return getValueFromAdj(rootNode, getAdjList(config));
}

export function has<T>(iterable: Iterable<T>, item: T): boolean {
  if (Array.isArray(iterable)) {
    return iterable.some(member => member === item);
  }

  if (iterable instanceof Set) {
    return iterable.has(item);
  }

  return false; // TODO: fix
}

export function nextEvents<TC, TE extends EventObject>(
  configuration: Array<StateNode<TC, any, TE>>
): Array<TE['type']> {
  return flatten([...new Set(configuration.map(sn => sn.ownEvents))]);
}

export function isInFinalState<TContext, TEvent extends EventObject>(
  configuration: Array<StateNode<TContext, any, TEvent>>,
  stateNode: StateNode<TContext, any, TEvent>
): boolean {
  switch (stateNode.type) {
    case 'compound':
      return getChildStates(stateNode).some(
        s => s.type === 'final' && has(configuration, s)
      );
    case 'parallel':
      return getChildStates(stateNode).every(sn =>
        isInFinalState(configuration, sn)
      );
    default:
      return false;
  }
}

export function isDescendant<TContext, TEvent extends EventObject>(
  possibleDescendantState: StateNode<TContext, any, TEvent, any>,
  possibleAncestorState: StateNode<TContext, any, TEvent, any>
): boolean {
  let parent: StateNode<
    TContext,
    any,
    TEvent,
    any
  > | void = possibleDescendantState;

  while ((parent = parent.parent)) {
    if (parent === possibleAncestorState) {
      return true;
    }
  }
  return false;
}

function getProperAncestors(
  descendantState: StateNode<any, any, any, any>,
  upToState: StateNode<any, any, any, any> | null
) {
  const ancestors: Array<StateNode<any, any, any, any>> = [];

  let parent: StateNode<any, any, any, any> | void = descendantState;

  while ((parent = parent.parent)) {
    if (descendantState === upToState) {
      return ancestors;
    }
    ancestors.push(parent);
  }
  return ancestors;
}

function findLeastCommonCompoundAncestor<TContext, TEvent extends EventObject>(
  states: Array<StateNode<TContext, any, TEvent, any>>
) {
  const [head, ...tail] = states;
  const headAncestors = getProperAncestors(head, null).filter(
    state => state.type === 'compound' || !state.parent
  );
  return headAncestors.find(ancestor =>
    tail.every(state => isDescendant(state, ancestor))
  ) as StateNode<TContext, any, TEvent>;
}

function getEffectiveTargetStates<TContext, TEvent extends EventObject>(
  transition: TransitionDefinition<TContext, TEvent>
) {
  const targets: Array<StateNode<TContext, any, TEvent>> = [];

  for (const target of transition.target!) {
    // TODO: implemenet history handling
    targets.push(target);
  }

  return targets;
}

export function getTransitionDomain<TContext, TEvent extends EventObject>(
  transition: TransitionDefinition<TContext, TEvent>
) {
  const targetStates = getEffectiveTargetStates(transition);

  if (
    transition.internal &&
    transition.source.type === 'compound' &&
    targetStates.every(state => isDescendant(state, transition.source))
  ) {
    return transition.source;
  }

  return findLeastCommonCompoundAncestor(
    targetStates.concat(transition.source)
  );
}

export function computeExitSet<TContext, TEvent extends EventObject>(
  configuration: Array<StateNode<TContext, any, TEvent>>,
  transitions: Array<TransitionDefinition<TContext, TEvent>>
): Array<StateNode<TContext, any, TEvent>> {
  return flatten(
    transitions
      .filter(transition => transition.target)
      .map(transition => {
        const domain = getTransitionDomain(transition);
        return configuration.filter(state => isDescendant(state, domain));
      })
  ).sort((a, b) => b.order - a.order);
}

export function removeConflictingTransitions<
  TContext,
  TEvent extends EventObject
>(
  configuration: Array<StateNode<TContext, any, TEvent>>,
  transitions: Array<TransitionDefinition<TContext, TEvent>>
): Array<TransitionDefinition<TContext, TEvent>> {
  const filtered = [transitions[0]];

  for (let i = 1; i < transitions.length; i++) {
    let enabledTransition = transitions[i];
    let enabledTransitionPreempted = false;
    const transitionsToRemove: Array<
      TransitionDefinition<TContext, TEvent>
    > = [];
    for (const filteredTransition of filtered) {
      if (
        intersects(
          computeExitSet(configuration, [enabledTransition]),
          computeExitSet(configuration, [filteredTransition])
        )
      ) {
        if (isDescendant(enabledTransition.source, filteredTransition.source)) {
          transitionsToRemove.push(filteredTransition);
        } else {
          enabledTransitionPreempted = true;
          break;
        }
      }
    }
    if (!enabledTransitionPreempted) {
      for (const transitionToRemove of transitionsToRemove) {
        filtered.splice(filtered.indexOf(transitionToRemove), 1);
      }
      filtered.push(enabledTransition);
    }
  }

  return filtered;
}

function getChildStates<TContext, TEvent extends EventObject>(
  state: StateNode<TContext, any, TEvent>
) {
  return keys(state.states)
    .map(key => state.states[key])
    .filter(state => state.type !== 'history');
}

function getDescendantStatesToEnter<TContext, TEvent extends EventObject>(
  state: StateNode<TContext, any, TEvent>
): Array<StateNode<TContext, any, TEvent>> {
  // TODO: handle history
  switch (state.type) {
    case 'compound':
      // this should always be defined (or first in order should be picked as default)
      // but that would be a breaking change right now
      if (state.initial) {
        // TODO: handle nested initial states
        return [state, state.states[state.initial as string]];
      }
      return [state];
    case 'parallel':
      return flatten(getChildStates(state).map(getDescendantStatesToEnter));
    default:
      return [state];
  }
}

function getAncestorStatesToEnter<TContext, TEvent extends EventObject>(
  state: StateNode<TContext, any, TEvent>,
  upToState: StateNode<TContext, any, TEvent>
): Array<StateNode<TContext, any, TEvent>> {
  return flatten(
    getProperAncestors(state, upToState).map(ancestor => {
      return ancestor.type === 'parallel'
        ? [
            ancestor,
            ...flatten(getChildStates(state).map(getDescendantStatesToEnter))
          ]
        : [ancestor];
    })
  );
}

export function computeEntrySet<TContext, TEvent extends EventObject>(
  transitions: Array<TransitionDefinition<TContext, TEvent>>
): Array<StateNode<TContext, any, TEvent>> {
  return uniq(
    flatten(
      transitions.map(transition => {
        if (!transition.target) {
          return [];
        }
        const descendantStates = flatten(
          transition.target.map(getDescendantStatesToEnter)
        );
        const domainAncestor = getTransitionDomain(transition);
        const ancestorStates = flatten(
          getEffectiveTargetStates(transition).map(targetState =>
            getAncestorStatesToEnter(targetState, domainAncestor)
          )
        );
        return [...descendantStates, ...ancestorStates];
      })
    )
  ).sort((a, b) => a.order - b.order);
}
