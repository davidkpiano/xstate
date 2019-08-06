import {
  AtomicStateNodeConfig,
  StatesConfig,
  Event,
  EventObject,
  StateSchema,
  StateNodeConfig,
  DefaultContext
} from './types';
import { toEventObject } from './utils';

export function toggle<TEventType extends string = string>(
  onState: string,
  offState: string,
  eventType: TEventType
): Record<string, AtomicStateNodeConfig<any, { type: TEventType }>> {
  return {
    [onState]: {
      on: { [eventType]: offState }
    },
    [offState]: {
      on: { [eventType]: onState }
    }
  } as Record<string, AtomicStateNodeConfig<any, { type: TEventType }>>;
}

interface SequencePatternOptions<TEvent extends EventObject> {
  nextEvent: Event<TEvent> | undefined;
  prevEvent: Event<TEvent> | undefined;
}

const defaultSequencePatternOptions = {
  nextEvent: 'NEXT',
  prevEvent: 'PREV'
};

export function sequence<
  TStateSchema extends StateSchema,
  TEvent extends EventObject
>(
  items: string[],
  options?: Partial<SequencePatternOptions<TEvent>>
): {
  initial: keyof TStateSchema['states'];
  states: StatesConfig<DefaultContext, TStateSchema, TEvent>;
} {
  const resolvedOptions = { ...defaultSequencePatternOptions, ...options };
  const states = {} as StatesConfig<DefaultContext, TStateSchema, TEvent>;
  const nextEventObject =
    resolvedOptions.nextEvent === undefined
      ? undefined
      : toEventObject(resolvedOptions.nextEvent);
  const prevEventObject =
    resolvedOptions.prevEvent === undefined
      ? undefined
      : toEventObject(resolvedOptions.prevEvent);

  items.forEach((item, i) => {
    const state: StateNodeConfig<TEvent, TStateSchema, TEvent> = {
      on: {}
    };

    if (i + 1 === items.length) {
      state.type = 'final';
    }

    if (nextEventObject && i + 1 < items.length) {
      state.on![nextEventObject.type] = items[i + 1];
    }

    if (prevEventObject && i > 0) {
      state.on![prevEventObject.type] = items[i - 1];
    }

    states[item] = state;
  });

  return {
    initial: items[0] as keyof TStateSchema['states'],
    states
  };
}
