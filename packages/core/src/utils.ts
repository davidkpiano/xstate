import {
  Event,
  StateValue,
  EventObject,
  PropertyMapper,
  Mapper,
  EventType,
  Subscribable,
  SCXML,
  StateLike,
  TransitionConfig,
  TransitionConfigTarget,
  NullEvent,
  SingleOrArray,
  BehaviorCreator,
  InvokeSourceDefinition,
  Observer,
  MachineContext,
  Behavior
} from './types';
import { STATE_DELIMITER, TARGETLESS_KEY } from './constants';
import { IS_PRODUCTION } from './environment';
import { StateNode } from './StateNode';
import { InvokeConfig, SCXMLErrorEvent } from '.';
import { StateMachine } from './StateMachine';
import { errorExecution, errorPlatform } from './actionTypes';

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

  return keys(parentStateValue).every((key) => {
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
    'value' in state &&
    'context' in state &&
    'event' in state &&
    '_event' in state
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

export function mapValues<T, P, O extends { [key: string]: T }>(
  collection: O,
  iteratee: (item: O[keyof O], key: keyof O, collection: O, i: number) => P
): { [key in keyof O]: P } {
  const result: Partial<{ [key in keyof O]: P }> = {};

  const collectionKeys = keys(collection);
  for (let i = 0; i < collectionKeys.length; i++) {
    const key = collectionKeys[i];
    result[key] = iteratee(collection[key], key, collection, i);
  }

  return result as { [key in keyof O]: P };
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

export function toStatePaths(stateValue: StateValue | undefined): string[][] {
  if (!stateValue) {
    return [[]];
  }

  if (isString(stateValue)) {
    return [[stateValue]];
  }

  const result = flatten(
    keys(stateValue).map((key) => {
      const subStateValue = stateValue[key];

      if (
        typeof subStateValue !== 'string' &&
        (!subStateValue || !Object.keys(subStateValue).length)
      ) {
        return [[key]];
      }

      return toStatePaths(stateValue[key]).map((subPath) => {
        return [key].concat(subPath);
      });
    })
  );

  return result;
}

export function flatten<T>(array: Array<T | T[]>): T[] {
  return ([] as T[]).concat(...array);
}

export function toArrayStrict<T>(value: T[] | T): T[] {
  if (isArray(value)) {
    return value;
  }
  return [value];
}

export function toArray<T>(value: T[] | T | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return toArrayStrict(value);
}

export function mapContext<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  mapper: Mapper<TContext, TEvent, any> | PropertyMapper<TContext, TEvent, any>,
  context: TContext,
  _event: SCXML.Event<TEvent>
): any {
  if (isFunction(mapper)) {
    return mapper(context, _event.data);
  }

  const result = {} as any;

  for (const key of Object.keys(mapper)) {
    const subMapper = mapper[key];

    if (isFunction(subMapper)) {
      result[key] = subMapper(context, _event.data);
    } else {
      result[key] = subMapper;
    }
  }

  return result;
}

export function isBuiltInEvent(eventType: EventType): boolean {
  return /^(done|error)\./.test(eventType);
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

// tslint:disable-next-line:no-empty
export let warn: (
  condition: boolean | Error,
  message: string
) => void = () => {};

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

export function isObservable<T>(value: any): value is Subscribable<T> {
  try {
    return 'subscribe' in value && isFunction(value.subscribe);
  } catch (e) {
    return false;
  }
}

export const symbolObservable = (() =>
  (typeof Symbol === 'function' && (Symbol as any).observable) ||
  '@@observable')();

export function isMachineNode(
  value: any
): value is StateMachine<any, any, any> {
  try {
    return '__xstatenode' in value && value.parent === undefined;
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
  event: Event<TEvent>,
  payload?: Record<string, any>
): TEvent {
  if (isString(event)) {
    return { type: event, ...payload } as TEvent;
  }

  return event;
}

export function isSCXMLEvent<TEvent extends EventObject>(
  event: Event<TEvent> | SCXML.Event<TEvent>
): event is SCXML.Event<TEvent> {
  return !isString(event) && '$$type' in event && event.$$type === 'scxml';
}

export function isSCXMLErrorEvent(
  event: SCXML.Event<any>
): event is SCXMLErrorEvent {
  return event.name === errorExecution || event.name.startsWith(errorPlatform);
}

export function toSCXMLEvent<TEvent extends EventObject>(
  event: Event<TEvent> | SCXML.Event<TEvent>,
  scxmlEvent?: Partial<SCXML.Event<TEvent>>
): SCXML.Event<TEvent> {
  if (isSCXMLEvent(event)) {
    return event as SCXML.Event<TEvent>;
  }

  const eventObject = toEventObject(event as Event<TEvent>);

  return {
    name: eventObject.type,
    data: eventObject,
    $$type: 'scxml',
    type: 'external',
    ...scxmlEvent
  };
}

export function toTransitionConfigArray<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  event: TEvent['type'] | NullEvent['type'] | '*',
  configLike: SingleOrArray<
    | TransitionConfig<TContext, TEvent>
    | TransitionConfigTarget<TContext, TEvent>
  >
): Array<
  TransitionConfig<TContext, TEvent> & {
    event: TEvent['type'] | NullEvent['type'] | '*';
  }
> {
  const transitions = toArrayStrict(configLike).map((transitionLike) => {
    if (
      typeof transitionLike === 'undefined' ||
      typeof transitionLike === 'string' ||
      isMachineNode(transitionLike)
    ) {
      return { target: transitionLike, event };
    }

    return { ...transitionLike, event };
  }) as Array<
    TransitionConfig<TContext, TEvent> & {
      event: TEvent['type'] | NullEvent['type'] | '*';
    } // TODO: fix 'as' (remove)
  >;

  return transitions;
}

export function normalizeTarget<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  target: SingleOrArray<string | StateNode<TContext, TEvent>> | undefined
): Array<string | StateNode<TContext, TEvent>> | undefined {
  if (target === undefined || target === TARGETLESS_KEY) {
    return undefined;
  }
  return toArray(target);
}

export function reportUnhandledExceptionOnInvocation(
  originalError: any,
  currentError: any,
  id: string
) {
  if (!IS_PRODUCTION) {
    const originalStackTrace = originalError.stack
      ? ` Stacktrace was '${originalError.stack}'`
      : '';
    if (originalError === currentError) {
      // tslint:disable-next-line:no-console
      console.error(
        `Missing onError handler for invocation '${id}', error was '${originalError}'.${originalStackTrace}`
      );
    } else {
      const stackTrace = currentError.stack
        ? ` Stacktrace was '${currentError.stack}'`
        : '';
      // tslint:disable-next-line:no-console
      console.error(
        `Missing onError handler and/or unhandled exception/promise rejection for invocation '${id}'. ` +
          `Original error: '${originalError}'. ${originalStackTrace} Current error is '${currentError}'.${stackTrace}`
      );
    }
  }
}

export function toInvokeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  invocable:
    | InvokeConfig<TContext, TEvent>
    | string
    | BehaviorCreator<TContext, TEvent>
    | Behavior<any, any>,
  id: string
): InvokeConfig<TContext, TEvent> {
  if (typeof invocable === 'object') {
    if ('src' in invocable) {
      return invocable;
    }

    if ('transition' in invocable) {
      return {
        id,
        src: () => invocable
      };
    }
  }

  return {
    id,
    src: invocable
  };
}

export function toInvokeSource(
  src: string | InvokeSourceDefinition
): InvokeSourceDefinition {
  if (typeof src === 'string') {
    return { type: src };
  }

  return src;
}

export function toObserver<T>(
  nextHandler: Observer<T> | ((value: T) => void),
  errorHandler?: (error: any) => void,
  completionHandler?: () => void
): Observer<T> {
  if (typeof nextHandler === 'object') {
    return nextHandler;
  }

  const noop = () => void 0;

  return {
    next: nextHandler,
    error: errorHandler || noop,
    complete: completionHandler || noop
  };
}
