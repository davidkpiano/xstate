import {
  StateNode,
  State,
  DefaultContext,
  Event,
  EventObject,
  StateMachine
} from 'xstate';
import { flatten, keys } from 'xstate/lib/utils';
import {
  StatePaths,
  ValueAdjMapOptions,
  DirectedGraphEdge,
  DirectedGraphNode
} from './types';
import { getSimplePaths } from './simplePaths';

export function toEventObject<TEvent extends EventObject>(
  event: Event<TEvent>
): TEvent {
  if (typeof event === 'string' || typeof event === 'number') {
    return ({ type: event } as unknown) as TEvent;
  }

  return event;
}

export const EMPTY_MAP = {};

/**
 * Returns all state nodes of the given `node`.
 * @param stateNode State node to recursively get child state nodes from
 */
export function getStateNodes(
  stateNode: StateNode | StateMachine<any, any, any>
): StateNode[] {
  const { states } = stateNode;
  const nodes = keys(states).reduce((accNodes: StateNode[], stateKey) => {
    const childStateNode = states[stateKey];
    const childStateNodes = getStateNodes(childStateNode);

    accNodes.push(childStateNode, ...childStateNodes);
    return accNodes;
  }, []);

  return nodes;
}

export function getChildren(stateNode: StateNode): StateNode[] {
  if (!stateNode.states) {
    return [];
  }

  const children = Object.keys(stateNode.states).map((key) => {
    return stateNode.states[key];
  });

  return children;
}

export function serializeState<TContext>(state: State<TContext, any>): string {
  const { value, context } = state;
  return context === undefined
    ? JSON.stringify(value)
    : JSON.stringify(value) + ' | ' + JSON.stringify(context);
}

export function serializeEvent<TEvent extends EventObject>(
  event: TEvent
): string {
  return JSON.stringify(event);
}

export function deserializeEventString<TEvent extends EventObject>(
  eventString: string
): TEvent {
  return JSON.parse(eventString) as TEvent;
}

export const defaultValueAdjMapOptions: Required<ValueAdjMapOptions<
  any,
  any
>> = {
  events: {},
  filter: () => true,
  stateSerializer: serializeState,
  eventSerializer: serializeEvent
};

export function getSimplePathsAsArray<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  options?: ValueAdjMapOptions<TContext, TEvent>
): Array<StatePaths<TContext, TEvent>> {
  const result = getSimplePaths(machine, options);
  return keys(result).map((key) => result[key]);
}

export function toDirectedGraph(stateNode: StateNode): DirectedGraphNode {
  const edges: DirectedGraphEdge[] = flatten(
    stateNode.transitions.map((t, transitionIndex) => {
      const targets = t.target ? t.target : [stateNode];

      return targets.map((target, targetIndex) => {
        const edge: DirectedGraphEdge = {
          id: `${stateNode.id}:${transitionIndex}:${targetIndex}`,
          source: stateNode,
          target,
          transition: t,
          label: {
            text: t.eventType,
            toJSON: () => ({ text: t.eventType })
          },
          toJSON: () => {
            const { label } = edge;

            return { source: stateNode.id, target: target.id, label };
          }
        };

        return edge;
      });
    })
  );

  const graph = {
    id: stateNode.id,
    stateNode,
    children: getChildren(stateNode).map((sn) => toDirectedGraph(sn)),
    edges,
    toJSON: () => {
      const { id, children, edges: graphEdges } = graph;
      return { id, children, edges: graphEdges };
    }
  };

  return graph;
}
