import { EventObject, StateNode, StateValue } from '.';
import { keys, flatten } from './utils';

type Configuration<TC, TE extends EventObject> = Iterable<
  StateNode<TC, any, TE>
>;

type AdjList<TC, TE extends EventObject> = Map<
  StateNode<TC, any, TE>,
  Array<StateNode<TC, any, TE>>
>;

export const isLeafNode = (stateNode: StateNode<any, any, any, any>) =>
  stateNode.type === 'atomic' || stateNode.type === 'final';

export function getChildren<TC, TE extends EventObject>(
  stateNode: StateNode<TC, any, TE>
): Array<StateNode<TC, any, TE>> {
  return keys(stateNode.states).map((key) => stateNode.states[key]);
}

export function getAllStateNodes<TC, TE extends EventObject>(
  stateNode: StateNode<TC, any, TE, any>
): Array<StateNode<TC, any, TE, any>> {
  const stateNodes = [stateNode];

  if (isLeafNode(stateNode)) {
    return stateNodes;
  }

  return stateNodes.concat(
    flatten(getChildren(stateNode).map(getAllStateNodes))
  );
}

export function getConfiguration<TC, TE extends EventObject>(
  prevStateNodes: Iterable<StateNode<TC, any, TE, any>>,
  stateNodes: Iterable<StateNode<TC, any, TE, any>>
): Iterable<StateNode<TC, any, TE, any>> {
  const prevConfiguration = new Set(prevStateNodes);
  const prevAdjList = getAdjList(prevConfiguration);

  const configuration = new Set(stateNodes);

  // add all ancestors
  for (const s of configuration) {
    let m = s.parent;

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
        prevAdjList.get(s)!.forEach((sn) => configuration.add(sn));
      } else {
        s.initialStateNodes.forEach((sn) => configuration.add(sn));
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
              prevAdjList.get(child)!.forEach((sn) => configuration.add(sn));
            } else {
              child.initialStateNodes.forEach((sn) => configuration.add(sn));
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

export function getValue<TC, TE extends EventObject>(
  rootNode: StateNode<TC, any, TE, any>,
  configuration: Configuration<TC, TE>
): StateValue {
  const config = getConfiguration([rootNode], configuration);

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

/**
 * Docs: {@link https://xstate.js.org/docs/guides/states.html#state-nextevents nextEvents}
 * It specifies the next events that will cause a transition from the current state:
 */
export function nextEvents<TC, TE extends EventObject>(
  configuration: Array<StateNode<TC, any, TE>>
): Array<TE['type']> {
  return [...new Set(flatten([...configuration.map((sn) => sn.ownEvents)]))];
}

export function isInFinalState<TC, TE extends EventObject>(
  configuration: Array<StateNode<TC, any, TE, any>>,
  stateNode: StateNode<TC, any, TE, any>
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

export function getMeta(configuration: StateNode[] = []): Record<string, any> {
  return configuration.reduce((acc, stateNode) => {
    if (stateNode.meta !== undefined) {
      acc[stateNode.id] = stateNode.meta;
    }
    return acc;
  }, {} as Record<string, any>);
}
