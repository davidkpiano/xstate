import { DefaultContext, EventObject, StateMachine } from 'xstate';
import { isMachine, keys } from 'xstate/lib/utils';
import {
  StatePathsMap,
  ValueAdjMapOptions,
  StatePathsMapFST,
  SegmentsFST,
  ValueAdjMapOptionsFST
} from './types';
import { getAdjacencyMapFST, nextEventsGetter } from './adjacency';
import {
  defaultValueAdjMapOptions,
  EMPTY_MAP,
  deserializeEventString
} from './graph';
import { FST, fromMachine } from 'xstate/lib/fst';

export function getSimplePaths<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, any, TEvent>,
  options?: Partial<ValueAdjMapOptions<TContext, TEvent>>
): StatePathsMap<TContext, TEvent> {
  const optionsWithDefaults = {
    ...defaultValueAdjMapOptions,
    ...options
  };

  if (isMachine(machine) && !machine.states) {
    return EMPTY_MAP;
  }

  const fst = fromMachine(
    machine,
    nextEventsGetter(machine, optionsWithDefaults.events as any)
  );

  const paths = getSimplePathsFST(fst, optionsWithDefaults as any);

  return paths as StatePathsMap<TContext, TEvent>;
}

export function getSimplePathsFST<TState, Tinput>(
  fst: FST<TState, Tinput>,
  options?: Partial<ValueAdjMapOptionsFST<TState, Tinput>>
): StatePathsMapFST<TState, Tinput> {
  const optionsWithDefaults = {
    ...defaultValueAdjMapOptions,
    ...options
  };

  const { stateSerializer } = optionsWithDefaults;
  // @ts-ignore - excessively deep
  const adjacency = getAdjacencyMapFST(fst, optionsWithDefaults);
  const stateMap = new Map<string, TState>();
  const visited = new Set();
  const path: SegmentsFST<TState, Tinput> = [];
  const paths: StatePathsMapFST<TState, Tinput> = {};

  function util(fromState: TState, toStateSerial: string) {
    const fromStateSerial = stateSerializer(fromState as any);
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

        const nextStateSerial = stateSerializer(nextSegment.state as any);
        stateMap.set(nextStateSerial, nextSegment.state);

        if (!visited.has(nextStateSerial)) {
          path.push({
            state: stateMap.get(fromStateSerial)!,
            event: deserializeEventString(subEvent) as any
          });
          util(nextSegment.state, toStateSerial);
        }
      }
    }

    path.pop();
    visited.delete(fromStateSerial);
  }

  const initialStateSerial = stateSerializer(fst.initialState as any);
  stateMap.set(initialStateSerial, fst.initialState);

  for (const nextStateSerial of keys(adjacency)) {
    util(fst.initialState, nextStateSerial);
  }

  return paths;
}
