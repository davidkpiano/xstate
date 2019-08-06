import {
  Event,
  StateValue,
  ActionType,
  Action,
  EventObject,
  PropertyMapper,
  Mapper,
  EventType,
  ActionTypes,
  HistoryValue,
  AssignAction,
  Condition,
  Guard,
  Subscribable,
  StateMachine,
  ConditionPredicate,
  SCXML,
  StateLike,
  DefaultContext
} from './types';
import { STATE_DELIMITER, DEFAULT_GUARD_TYPE } from './constants';
import { IS_PRODUCTION } from './environment';
import { State } from '.';

export function keys<T extends object>(value: T): Array<keyof T & string> {
  return Object.keys(value) as Array<keyof T & string>;
}

export function matchesState(
  parentStateId: StateValue,
  childStateId: StateValue,
  delimiter: string = STATE_DELIMITER
): boolean {
  const parentStateValue = toStateValue(parentStateId, delimiter);
  const childStateValue = toStateValue(childStateId, delimiter);

  if (isString(childStateValue)) {
    if (isString(parentStateValue)) {
      return childStateValue === parentStateValue;
    }

    // Parent more specific than child
    return false;
  }

  if (isString(parentStateValue)) {
    return parentStateValue in childStateValue;
  }

  return keys(parentStateValue).every(key => {
    if (!(key in childStateValue)) {
      return false;
    }

    return matchesState(parentStateValue[key], childStateValue[key]);
  });
}

export function getEventType<TEvent extends EventObject = EventObject>(
  event: Event<TEvent>
): TEvent['type'] {
  try {
    return isString(event) || typeof event === 'number'
      ? `${event}`
      : (event as TEvent).type;
  } catch (e) {
    throw new Error(
      'Events must be strings or objects with a string event.type property.'
    );
  }
}
export function getActionType(action: Action<any, any>): ActionType {
  try {
    return isString(action) || typeof action === 'number'
      ? `${action}`
      : isFunction(action)
      ? action.name
      : action.type;
  } catch (e) {
    throw new Error(
      'Actions must be strings or objects with a string action.type property.'
    );
  }
}

export function toStatePath(
  stateId: string | string[],
  delimiter: string
): string[] {
  try {
    if (isArray(stateId)) {
      return stateId;
    }

    return stateId.toString().split(delimiter);
  } catch (e) {
    throw new Error(`'${stateId}' is not a valid state path.`);
  }
}

export function isStateLike(state: any): state is StateLike<any> {
  return (
    typeof state === 'object' &&
    ('value' in state &&
      'context' in state &&
      'event' in state &&
      '_event' in state)
  );
}

export function toStateValue(
  stateValue: StateLike<any> | StateValue | string[],
  delimiter: string
): StateValue {
  if (isStateLike(stateValue)) {
    return stateValue.value;
  }

  if (isArray(stateValue)) {
    return pathToStateValue(stateValue);
  }

  if (typeof stateValue !== 'string') {
    return stateValue as StateValue;
  }

  const statePath = toStatePath(stateValue as string, delimiter);

  return pathToStateValue(statePath);
}

export function pathToStateValue(statePath: string[]): StateValue {
  if (statePath.length === 1) {
    return statePath[0];
  }

  const value = {};
  let marker = value;

  for (let i = 0; i < statePath.length - 1; i++) {
    if (i === statePath.length - 2) {
      marker[statePath[i]] = statePath[i + 1];
    } else {
      marker[statePath[i]] = {};
      marker = marker[statePath[i]];
    }
  }

  return value;
}

export function mapValues<T, P>(
  collection: { [key: string]: T },
  iteratee: (
    item: T,
    key: string,
    collection: { [key: string]: T },
    i: number
  ) => P
): { [key: string]: P } {
  const result: { [key: string]: P } = {};

  const collectionKeys = keys(collection);
  for (let i = 0; i < collectionKeys.length; i++) {
    const key = collectionKeys[i];
    result[key] = iteratee(collection[key], key, collection, i);
  }

  return result;
}

export function mapFilterValues<T, P>(
  collection: { [key: string]: T },
  iteratee: (item: T, key: string, collection: { [key: string]: T }) => P,
  predicate: (item: T) => boolean
): { [key: string]: P } {
  const result: { [key: string]: P } = {};

  for (const key of keys(collection)) {
    const item = collection[key];

    if (!predicate(item)) {
      continue;
    }

    result[key] = iteratee(item, key, collection);
  }

  return result;
}

/**
 * Retrieves a value at the given path.
 * @param props The deep path to the prop of the desired value
 */
export const path = <T extends Record<string, any>>(props: string[]): any => (
  object: T
): any => {
  let result: T = object;

  for (const prop of props) {
    result = result[prop as keyof typeof result];
  }

  return result;
};

/**
 * Retrieves a value at the given path via the nested accessor prop.
 * @param props The deep path to the prop of the desired value
 */
export function nestedPath<T extends Record<string, any>>(
  props: string[],
  accessorProp: keyof T
): (object: T) => T {
  return object => {
    let result: T = object;

    for (const prop of props) {
      result = result[accessorProp][prop];
    }

    return result;
  };
}

export function toStatePaths(stateValue: StateValue | undefined): string[][] {
  if (!stateValue) {
    return [[]];
  }

  if (isString(stateValue)) {
    return [[stateValue]];
  }

  const result = flatten(
    keys(stateValue).map(key => {
      const subStateValue = stateValue[key];

      if (
        typeof subStateValue !== 'string' &&
        (!subStateValue || !Object.keys(subStateValue).length)
      ) {
        return [[key]];
      }

      return toStatePaths(stateValue[key]).map(subPath => {
        return [key].concat(subPath);
      });
    })
  );

  return result;
}

export const pathsToStateValue = (paths: string[][]): StateValue => {
  const result: StateValue = {};

  if (paths && paths.length === 1 && paths[0].length === 1) {
    return paths[0][0];
  }

  for (const currentPath of paths) {
    let marker = result;
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < currentPath.length; i++) {
      const subPath = currentPath[i];

      if (i === currentPath.length - 2) {
        marker[subPath] = currentPath[i + 1];
        break;
      }
      marker[subPath] = marker[subPath] || {};
      marker = marker[subPath] as {};
    }
  }

  return result;
};

export function flatten<T>(array: Array<T | T[]>): T[] {
  return ([] as T[]).concat(...array);
}

export function toArray<T>(value: T[] | T | undefined): T[] {
  if (isArray(value)) {
    return value;
  }
  if (value === undefined) {
    return [];
  }
  return [value];
}

export function mapContext<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  mapper: Mapper<TContext, TEvent> | PropertyMapper<TContext, TEvent>,
  context: TContext,
  event: TEvent
): any {
  if (isFunction(mapper)) {
    return (mapper as Mapper<TContext, TEvent>)(context, event);
  }

  const result = {} as any;

  for (const key of keys(mapper)) {
    const subMapper = mapper[key];

    if (isFunction(subMapper)) {
      result[key] = subMapper(context, event);
    } else {
      result[key] = subMapper;
    }
  }

  return result;
}

export function isBuiltInEvent(eventType: EventType): boolean {
  // check if event is a "done" event
  if (
    eventType.indexOf(ActionTypes.DoneState) === 0 ||
    eventType.indexOf(ActionTypes.DoneInvoke) === 0
  ) {
    return true;
  }

  // check if event is an "error" event
  if (
    eventType === ActionTypes.ErrorCommunication ||
    eventType === ActionTypes.ErrorExecution ||
    eventType.indexOf(ActionTypes.ErrorPlatform) === 0
  ) {
    return true;
  }

  return false;
}

export function isPromiseLike(value: any): value is PromiseLike<any> {
  if (value instanceof Promise) {
    return true;
  }
  // Check if shape matches the Promise/A+ specification for a "thenable".
  if (
    value !== null &&
    (isFunction(value) || typeof value === 'object') &&
    isFunction(value.then)
  ) {
    return true;
  }
  return false;
}

export function partition<T, A extends T, B extends T>(
  items: T[],
  predicate: (item: T) => item is A
): [A[], B[]] {
  const [truthy, falsy] = [[], []] as [A[], B[]];

  for (const item of items) {
    if (predicate(item)) {
      truthy.push(item);
    } else {
      falsy.push(item as B);
    }
  }

  return [truthy, falsy];
}

export function updateHistoryStates(
  hist: HistoryValue,
  stateValue: StateValue
): Record<string, HistoryValue | undefined> {
  return mapValues(hist.states, (subHist, key) => {
    if (!subHist) {
      return undefined;
    }
    const subStateValue =
      (isString(stateValue) ? undefined : stateValue[key]) ||
      (subHist ? subHist.current : undefined);

    if (!subStateValue) {
      return undefined;
    }

    return {
      current: subStateValue,
      states: updateHistoryStates(subHist, subStateValue)
    };
  });
}

export function updateHistoryValue(
  hist: HistoryValue,
  stateValue: StateValue
): HistoryValue {
  return {
    current: stateValue,
    states: updateHistoryStates(hist, stateValue)
  };
}

export function updateContext<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  context: TContext,
  event: TEvent,
  assignActions: Array<AssignAction<TContext, TEvent>>,
  state?: State<TContext, TEvent>
): TContext {
  const updatedContext = context
    ? assignActions.reduce((acc, assignAction) => {
        const { assignment } = assignAction as AssignAction<TContext, TEvent>;
        const meta = {
          state,
          action: assignAction
        };

        let partialUpdate: Partial<TContext> = {};

        if (isFunction(assignment)) {
          partialUpdate = assignment(
            acc,
            event || { type: ActionTypes.Init },
            meta
          );
        } else {
          for (const key of keys(assignment)) {
            const propAssignment = assignment[key];

            partialUpdate[key] = isFunction(propAssignment)
              ? propAssignment(acc, event, meta)
              : propAssignment;
          }
        }

        return Object.assign({}, acc, partialUpdate);
      }, context)
    : context;
  return updatedContext;
}

// tslint:disable-next-line:no-empty
let warn: (condition: boolean | Error, message: string) => void = () => {};

if (!IS_PRODUCTION) {
  warn = (condition: boolean | Error, message: string) => {
    const error = condition instanceof Error ? condition : undefined;
    if (!error && condition) {
      return;
    }

    if (console !== undefined) {
      const args: [string, ...any[]] = [`Warning: ${message}`];
      if (error) {
        args.push(error);
      }
      // tslint:disable-next-line:no-console
      console.warn.apply(console, args);
    }
  };
}

export { warn };

export function isArray(value: any): value is any[] {
  return Array.isArray(value);
}

// tslint:disable-next-line:ban-types
export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

// export function memoizedGetter<T, TP extends { prototype: object }>(
//   o: TP,
//   property: string,
//   getter: () => T
// ): void {
//   Object.defineProperty(o.prototype, property, {
//     get: getter,
//     enumerable: false,
//     configurable: false
//   });
// }

export function toGuard<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  condition?: Condition<TContext, TEvent>,
  guardMap?: Record<string, ConditionPredicate<TContext, TEvent>>
): Guard<TContext, TEvent> | undefined {
  if (!condition) {
    return undefined;
  }

  if (isString(condition)) {
    return {
      type: DEFAULT_GUARD_TYPE,
      name: condition,
      predicate: guardMap ? guardMap[condition] : undefined
    };
  }

  if (isFunction(condition)) {
    return {
      type: DEFAULT_GUARD_TYPE,
      name: condition.name,
      predicate: condition
    };
  }

  return condition;
}

export function isObservable<T>(
  value: Subscribable<T> | any
): value is Subscribable<T> {
  try {
    return 'subscribe' in value && isFunction(value.subscribe);
  } catch (e) {
    return false;
  }
}

export function isMachine(value: any): value is StateMachine<any, any, any> {
  try {
    return '__xstatenode' in value;
  } catch (e) {
    return false;
  }
}

export const uniqueId = (() => {
  let currentId = 0;

  return () => {
    currentId++;
    return currentId.toString(16);
  };
})();

export function toEventObject<TEvent extends EventObject>(
  event: Event<TEvent> | SCXML.Event<TEvent>,
  payload?: Record<string, any> & { type?: never }
  // id?: TEvent['type']
): TEvent {
  if (isString(event) || typeof event === 'number') {
    const eventObject = { type: event };

    if (payload) {
      Object.assign(eventObject, payload);
    }

    return eventObject as TEvent;
  }

  return event as TEvent;
}

export function toSCXMLEvent<TEvent extends EventObject>(
  event: Event<TEvent> | SCXML.Event<TEvent>,
  scxmlEvent: Partial<SCXML.Event<TEvent>> = {}
): SCXML.Event<TEvent> {
  if (!isString(event)) {
    if (event.$$type === 'scxml') {
      return event as SCXML.Event<TEvent>;
    }

    if ('__scxml' in event) {
      return event.__scxml as SCXML.Event<TEvent>;
    }
  }

  const eventObject = toEventObject(event);

  if (eventObject.__scxml) {
    return eventObject.__scxml as SCXML.Event<TEvent>;
  }

  return {
    name: eventObject.type,
    data: eventObject,
    $$type: 'scxml',
    type: 'external',
    ...scxmlEvent
  };
}
