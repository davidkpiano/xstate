import {
  StateNode,
  State,
  DefaultContext,
  Event,
  EventObject,
  StateMachine,
  StateValue
} from 'xstate';
import { flatten, keys } from 'xstate/lib/utils';
import {
  StatePathsMap,
  StatePaths,
  AdjacencyMap,
  Segments,
  Segment
} from './types';

export function toEventObject<TEvent extends EventObject>(
  event: Event<TEvent>
): TEvent {
  if (typeof event === 'string' || typeof event === 'number') {
    return { type: event } as TEvent;
  }

  return event;
}

const EMPTY_MAP = {};

/**
 * Returns all state nodes of the given `node`.
 * @param stateNode State node to recursively get child state nodes from
 */
export function getStateNodes(stateNode: StateNode): StateNode[] {
  const { states } = stateNode;
  const nodes = keys(states).reduce((accNodes: StateNode[], stateKey) => {
    const childStateNode = states[stateKey];
    const childStateNodes = getStateNodes(childStateNode);

    accNodes.push(childStateNode, ...childStateNodes);
    return accNodes;
  }, []);

  return nodes;
}

export function serializeState<TContext>(state: State<TContext>): string {
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

export interface ValueAdjMapOptions<TContext, TEvent extends EventObject> {
  events: { [K in TEvent['type']]?: Array<TEvent & { type: K }> };
  filter: (state: State<TContext, TEvent>) => boolean;
  stateSerializer: (state: State<TContext, TEvent>) => string;
  eventSerializer: (event: TEvent) => string;
}

const defaultValueAdjMapOptions: ValueAdjMapOptions<any, any> = {
  events: {},
  filter: () => true,
  stateSerializer: serializeState,
  eventSerializer: serializeEvent
};

// tslint:disable-next-line:max-line-length
export interface ValueAlternatePathOptions<
  TContext,
  TEvent extends EventObject
> extends ValueAdjMapOptions<TContext, TEvent> {
  maxRevisits: number;
}

const defaultValueAlternatePathOptions: ValueAlternatePathOptions<any, any> = {
  ...defaultValueAdjMapOptions,
  maxRevisits: 0
};

export function getAdjacencyMap<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  node: StateNode<TContext, any, TEvent>,
  options?: Partial<ValueAdjMapOptions<TContext, TEvent>>
): AdjacencyMap<TContext, TEvent> {
  const optionsWithDefaults = ({
    ...defaultValueAdjMapOptions,
    ...options
  } as unknown) as ValueAdjMapOptions<TContext, TEvent>;
  const { filter, stateSerializer, eventSerializer } = optionsWithDefaults;
  const events = {} as Record<TEvent['type'], Array<Event<TEvent>>>;
  for (const event of node.events) {
    events[event] = [event];
  }
  Object.assign(events, optionsWithDefaults.events);

  const adjacency: AdjacencyMap<TContext, TEvent> = {};

  function findAdjacencies(state: State<TContext, TEvent>) {
    const { nextEvents } = state;
    const stateHash = stateSerializer(state);

    if (adjacency[stateHash]) {
      return;
    }

    adjacency[stateHash] = {};

    const potentialEvents = flatten<TEvent>(
      nextEvents.map(nextEvent => events[nextEvent] || [])
    ).map(event => toEventObject(event));

    for (const event of potentialEvents) {
      let nextState: State<TContext, TEvent>;
      try {
        nextState = node.transition(state, event);
      } catch (e) {
        throw new Error(
          `Unable to transition from state ${stateSerializer(
            state
          )} on event ${eventSerializer(event)}: ${e.message}`
        );
      }

      if (
        (!filter || filter(nextState)) &&
        stateHash !== stateSerializer(nextState)
      ) {
        adjacency[stateHash][eventSerializer(event)] = {
          state: nextState,
          event
        };

        findAdjacencies(nextState);
      }
    }
  }

  findAdjacencies(node.initialState);

  return adjacency;
}

export function getShortestPaths<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  options?: Partial<ValueAdjMapOptions<TContext, TEvent>>
): StatePathsMap<TContext, TEvent> {
  if (!machine.states) {
    // return EMPTY_MAP;
    return EMPTY_MAP;
  }
  const optionsWithDefaults = ({
    events: {},
    stateSerializer: serializeState,
    eventSerializer: serializeEvent,
    ...options
  } as unknown) as ValueAdjMapOptions<TContext, TEvent>;

  const adjacency = getAdjacencyMap<TContext, TEvent>(
    machine,
    optionsWithDefaults
  );

  // weight, state, event
  const weightMap = new Map<
    string,
    [number, string | undefined, string | undefined]
  >();
  const stateMap = new Map<string, State<TContext, TEvent>>();
  const initialVertex = optionsWithDefaults.stateSerializer(
    machine.initialState
  );
  stateMap.set(initialVertex, machine.initialState);

  weightMap.set(initialVertex, [0, undefined, undefined]);
  const unvisited = new Set<string>();
  const visited = new Set<string>();

  unvisited.add(initialVertex);
  while (unvisited.size > 0) {
    for (const vertex of unvisited) {
      const [weight] = weightMap.get(vertex)!;
      for (const event of keys(adjacency[vertex])) {
        const nextSegment = adjacency[vertex][event];
        const nextVertex = optionsWithDefaults.stateSerializer(
          nextSegment.state
        );
        stateMap.set(nextVertex, nextSegment.state);
        if (!weightMap.has(nextVertex)) {
          weightMap.set(nextVertex, [weight + 1, vertex, event]);
        } else {
          const [nextWeight] = weightMap.get(nextVertex)!;
          if (nextWeight > weight + 1) {
            weightMap.set(nextVertex, [weight + 1, vertex, event]);
          }
        }
        if (!visited.has(nextVertex)) {
          unvisited.add(nextVertex);
        }
      }
      visited.add(vertex);
      unvisited.delete(vertex);
    }
  }

  const statePathMap: StatePathsMap<TContext, TEvent> = {};

  weightMap.forEach(([weight, fromState, fromEvent], stateSerial) => {
    const state = stateMap.get(stateSerial)!;
    statePathMap[stateSerial] = {
      state,
      paths: !fromState
        ? [
            {
              state,
              segments: [],
              weight
            }
          ]
        : [
            {
              state,
              segments: statePathMap[fromState].paths[0].segments.concat({
                state: stateMap.get(fromState)!,
                event: deserializeEventString(fromEvent!) as TEvent
              }),
              weight
            }
          ]
    };
  });

  return statePathMap;
}

export function getSimplePaths<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  options?: Partial<ValueAdjMapOptions<TContext, TEvent>>
): StatePathsMap<TContext, TEvent> {
  const optionsWithDefaults = ({
    ...defaultValueAdjMapOptions,
    ...options
  } as unknown) as ValueAdjMapOptions<TContext, TEvent>;

  const { stateSerializer } = optionsWithDefaults;

  if (!machine.states) {
    return EMPTY_MAP;
  }

  const adjacency = getAdjacencyMap(machine, optionsWithDefaults);
  const stateMap = new Map<string, State<TContext, TEvent>>();
  const visited = new Set<string>();
  const path: Segments<TContext, TEvent> = [];
  const paths: StatePathsMap<TContext, TEvent> = {};

  function util(fromState: State<TContext, TEvent>, toStateSerial: string) {
    const fromStateSerial = stateSerializer(fromState);
    visited.add(fromStateSerial);

    if (fromStateSerial === toStateSerial) {
      if (!paths[toStateSerial]) {
        paths[toStateSerial] = {
          state: stateMap.get(toStateSerial)!,
          paths: []
        };
      }
      paths[toStateSerial].paths.push({
        state: fromState,
        weight: path.length,
        segments: [...path]
      });
    } else {
      for (const subEvent of keys(adjacency[fromStateSerial])) {
        const nextSegment = adjacency[fromStateSerial][subEvent];

        if (!nextSegment) {
          continue;
        }

        const nextStateSerial = stateSerializer(nextSegment.state);
        stateMap.set(nextStateSerial, nextSegment.state);

        if (!visited.has(nextStateSerial)) {
          path.push({
            state: stateMap.get(fromStateSerial)!,
            event: deserializeEventString(subEvent)
          });
          util(nextSegment.state, toStateSerial);
        }
      }
    }

    path.pop();
    visited.delete(fromStateSerial);
  }

  const initialStateSerial = stateSerializer(machine.initialState);
  stateMap.set(initialStateSerial, machine.initialState);

  for (const nextStateSerial of keys(adjacency)) {
    util(machine.initialState, nextStateSerial);
  }

  return paths;
}

interface AlternatePath<TContext, TEvent extends EventObject> {
  visited: Set<string>;
  lastState: string;
  path: Segments<TContext, TEvent>;
  revisits: number;
}

export function getAlternatePaths<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  finalState: StateValue,
  options?: Partial<ValueAlternatePathOptions<TContext, TEvent>>
): StatePathsMap<TContext, TEvent> {
  const optionsWithDefaults = ({
    ...defaultValueAlternatePathOptions,
    ...options
  } as unknown) as ValueAlternatePathOptions<TContext, TEvent>;

  const { stateSerializer, maxRevisits } = optionsWithDefaults;

  if (!machine.states) {
    return EMPTY_MAP;
  }

  const adjacency = getAdjacencyMap(machine, optionsWithDefaults);
  const stateMap = new Map<string, State<TContext, TEvent>>();
  const paths: Array<AlternatePath<TContext, TEvent>> = [];

  function state2state(
    fromState: State<TContext, TEvent>,
    toStateSerial: StateValue,
    alternatePath: AlternatePath<TContext, TEvent>
  ) {
    const fromStateSerial = stateSerializer(fromState);
    alternatePath.visited.add(fromStateSerial);

    if (!fromState.matches(toStateSerial)) {
      const max = keys(adjacency[fromStateSerial]).length;
      let i = max;
      for (const subEvent of keys(adjacency[fromStateSerial])) {
        const nextSegment = adjacency[fromStateSerial][subEvent];
        i--;

        if (!nextSegment) {
          continue;
        }
        const nextStateSerial = stateSerializer(nextSegment.state);
        if (!stateMap.has(nextStateSerial)) {
          stateMap.set(nextStateSerial, nextSegment.state);
        }

        if (alternatePath.visited.has(nextStateSerial)) {
          if (alternatePath.revisits >= maxRevisits) {
            // stackElement.revisits += 1; // marks stack as nonsuccessful
            continue;
          }
          alternatePath.revisits += 1;
        }

        const step: Segment<TContext, TEvent> = {
          state: stateMap.get(fromStateSerial)!,
          event: deserializeEventString(subEvent)
        };
        if (i !== max) {
          const path = [...alternatePath.path];
          path.push(step);
          const newAlternatePath = {
            revisits: alternatePath.revisits,
            lastState: nextStateSerial,
            path,
            visited: new Set<string>(alternatePath.visited)
          };
          newAlternatePath.visited.add(nextStateSerial);
          paths.push(newAlternatePath);
          state2state(nextSegment.state, toStateSerial, newAlternatePath);
        } else {
          // last one
          alternatePath.visited.add(nextStateSerial);
          alternatePath.lastState = nextStateSerial;
          alternatePath.path.push(step);
          state2state(nextSegment.state, toStateSerial, alternatePath);
        }
      }
    }
  }

  const initialStateSerial = stateSerializer(machine.initialState);
  stateMap.set(initialStateSerial, machine.initialState);

  paths.push({
    revisits: 0,
    lastState: initialStateSerial,
    path: [],
    visited: new Set<string>()
  });

  state2state(stateMap.get(paths[0].lastState)!, finalState, paths[0]);

  const result: StatePathsMap<TContext, TEvent> = {};

  paths
    .filter(p => p.revisits <= maxRevisits)
    .forEach(path => {
      const pathState = stateMap.get(path.lastState)!;
      if (!pathState.matches(finalState)) {
        return;
      }
      if (pathState === undefined) {
        throw Error('empty pathState' + JSON.stringify(path));
      }
      if (!result[path.lastState]) {
        result[path.lastState] = { paths: [], state: pathState };
      }
      result[path.lastState].paths.push({
        state: pathState,
        segments: path.path,
        weight: path.path.length
      });
    });

  return result;
}

export function getSimplePathsAsArray<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateNode<TContext, any, TEvent>,
  options?: ValueAdjMapOptions<TContext, TEvent>
): Array<StatePaths<TContext, TEvent>> {
  const result = getSimplePaths(machine, options);
  return keys(result).map(key => result[key]);
}
