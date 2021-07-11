import { DoneInvokeEvent } from '.';
import { assign } from './actions';
import { createMachine } from './Machine';
import type {
  AssignAction,
  Assigner,
  PropertyAssigner,
  ExtractEvent,
  EventObject,
  MachineConfig,
  StateMachine,
  MachineOptions
} from './types';
import { mapValues } from './utils';

type AnyFunction = (...args: any[]) => any;

type Cast<A1 extends any, A2 extends any> = A1 extends A2 ? A1 : A2;
type Compute<A extends any> = { [K in keyof A]: A[K] } & unknown;
type Prop<T, K> = K extends keyof T ? T[K] : never;

export interface Model<
  TContext,
  TEvent extends EventObject,
  TModelCreators = void
> {
  initialContext: TContext;
  assign<TEventType extends TEvent['type'] = TEvent['type']>(
    assigner:
      | Assigner<TContext, ExtractEvent<TEvent, TEventType>>
      | PropertyAssigner<TContext, ExtractEvent<TEvent, TEventType>>,
    eventType?: TEventType
  ): AssignAction<TContext, ExtractEvent<TEvent, TEventType>>;
  assign(
    assigner:
      | Assigner<TContext, DoneInvokeEvent<any>>
      | PropertyAssigner<TContext, DoneInvokeEvent<any>>,
    eventType: `done.invoke` | `done.invoke.${string}`
  ): AssignAction<TContext, DoneInvokeEvent<any>>;
  events: Prop<TModelCreators, 'events'>;
  reset: () => AssignAction<TContext, any>;
  createMachine: (
    config: MachineConfig<TContext, any, TEvent>,
    implementations?: Partial<MachineOptions<TContext, TEvent>>
  ) => StateMachine<TContext, any, TEvent, any>;
}

export type ModelContextFrom<
  TModel extends Model<any, any, any>
> = TModel extends Model<infer TContext, any, any> ? TContext : never;

export type ModelEventsFrom<
  TModel extends Model<any, any, any>
> = TModel extends Model<any, infer TEvent, any> ? TEvent : never;

type EventCreator<
  Self extends AnyFunction,
  Return = ReturnType<Self>
> = Return extends object
  ? Return extends {
      type: any;
    }
    ? "An event creator can't return an object with a type property"
    : Self
  : 'An event creator must return an object';

type EventCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? EventCreator<Self[K]>
    : 'An event creator must be a function';
};

type ModelCreators<Self> = {
  events: EventCreators<Prop<Self, 'events'>>;
};

type FinalEventCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? (
        ...args: Parameters<Self[K]>
      ) => Compute<ReturnType<Self[K]> & { type: K }>
    : never;
};

type FinalModelCreators<Self> = {
  events: FinalEventCreators<Prop<Self, 'events'>>;
};

type EventFromEventCreators<EventCreators> = {
  [K in keyof EventCreators]: EventCreators[K] extends AnyFunction
    ? ReturnType<EventCreators[K]>
    : never;
}[keyof EventCreators];

export function createModel<TContext, TEvent extends EventObject>(
  initialContext: TContext
): Model<TContext, TEvent, void>;
export function createModel<
  TContext,
  TModelCreators extends ModelCreators<TModelCreators>,
  TFinalModelCreators = FinalModelCreators<TModelCreators>
>(
  initialContext: TContext,
  creators: TModelCreators
): Model<
  TContext,
  Cast<
    EventFromEventCreators<Prop<TFinalModelCreators, 'events'>>,
    EventObject
  >,
  TFinalModelCreators
>;
export function createModel(initialContext: object, creators?): unknown {
  const eventCreators = creators?.events;

  const model: Model<any, any, any> = {
    initialContext,
    assign,
    events: (eventCreators
      ? mapValues(eventCreators, (fn, eventType) => (...args: any[]) => ({
          ...fn(...args),
          type: eventType
        }))
      : undefined) as any,
    reset: () => assign(initialContext),
    createMachine: (config, implementations) => {
      return createMachine(
        'context' in config ? config : { ...config, context: initialContext },
        implementations
      );
    }
  };

  return model;
}
