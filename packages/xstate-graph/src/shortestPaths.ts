import { DefaultContext, EventObject, StateMachine } from 'xstate';
import { isMachine, keys } from 'xstate/lib/utils';
import {
  StatePathsMap,
  StatePathsMapFST,
  ValueAdjMapOptions,
  ValueAdjMapOptionsFST
} from './types';
import { getAdjacencyMapFST, nextEventsGetter } from './adjacency';
import {
  EMPTY_MAP,
  serializeState,
  serializeEvent,
  deserializeEventString
} from './graph';
import { FST, fromMachine } from 'xstate/lib/fst';

export function getShortestPaths<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  options?: Partial<ValueAdjMapOptions<TContext, TEvent>>
): StatePathsMap<TContext, TEvent> {
  if (isMachine(machine) && !machine.states) {
    return EMPTY_MAP;
  }
  const optionsWithDefaults = {
    events: {},
    stateSerializer: serializeState,
    eventSerializer: serializeEvent,
    ...options
  } as ValueAdjMapOptions<TContext, TEvent>;

  const fst = fromMachine(
    machine,
    nextEventsGetter(machine, optionsWithDefaults.events as any)
  );

  const statePathMap = getShortestPathsFST(fst, optionsWithDefaults as any);

  return statePathMap as StatePathsMap<TContext, TEvent>;
}

export function getShortestPathsFST<TState, TInput>(
  fst: FST<TState, TInput>,
  options?: Partial<ValueAdjMapOptionsFST<TState, TInput>>
): StatePathsMapFST<TState, TInput> {
  const optionsWithDefaults = {
    events: {},
    stateSerializer: serializeState,
    eventSerializer: serializeEvent,
    ...options
  } as any;

  const adjacency = getAdjacencyMapFST<TState, TInput>(
    fst,
    optionsWithDefaults
  );

  // weight, state, event
  const weightMap = new Map<
    string,
    [number, string | undefined, string | undefined]
  >();
  const stateMap = new Map<string, TState>();
  const initialVertex = optionsWithDefaults.stateSerializer(
    fst.initialState as any
  );
  stateMap.set(initialVertex, fst.initialState);

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
          nextSegment.state as any
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

  const statePathMap: StatePathsMapFST<TState, TInput> = {};

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
                event: (deserializeEventString(fromEvent!) as unknown) as TInput
              }),
              weight
            }
          ]
    };
  });

  return statePathMap;
}
