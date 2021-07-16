import { MachineContext, MachineNode } from '.';
import {
  EventObject,
  Assigner,
  ExtractEvent,
  PropertyAssigner,
  AssignAction,
  MachineConfig,
  MachineImplementations
} from './types';

export type AnyFunction = (...args: any[]) => any;

export type Cast<A1 extends any, A2 extends any> = A1 extends A2 ? A1 : A2;
export type Compute<A extends any> = { [K in keyof A]: A[K] } & unknown;
export type Prop<T, K> = K extends keyof T ? T[K] : never;

export interface Model<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TModelCreators = void
> {
  initialContext: TContext;
  assign: <TEventType extends TEvent['type'] = TEvent['type']>(
    assigner:
      | Assigner<TContext, ExtractEvent<TEvent, TEventType>>
      | PropertyAssigner<TContext, ExtractEvent<TEvent, TEventType>>,
    eventType?: TEventType
  ) => AssignAction<TContext, ExtractEvent<TEvent, TEventType>>;
  events: Prop<TModelCreators, 'events'>;
  reset: () => AssignAction<TContext, any>;
  createMachine: (
    config: MachineConfig<TContext, TEvent>,
    implementations?: Partial<MachineImplementations<TContext, TEvent>>
  ) => MachineNode<TContext, TEvent, any>;
}

export type ModelContextFrom<
  TModel extends Model<any, any, any>
> = TModel extends Model<infer TContext, any, any> ? TContext : never;

export type ModelEventsFrom<
  TModel extends Model<any, any, any>
> = TModel extends Model<any, infer TEvent, any> ? TEvent : never;

export type EventCreator<
  Self extends AnyFunction,
  Return = ReturnType<Self>
> = Return extends object
  ? Return extends {
      type: any;
    }
    ? "An event creator can't return an object with a type property"
    : Self
  : 'An event creator must return an object';

export type EventCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? EventCreator<Self[K]>
    : 'An event creator must be a function';
};

export type ModelCreators<Self> = {
  events: EventCreators<Prop<Self, 'events'>>;
};

export type FinalEventCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? (
        ...args: Parameters<Self[K]>
      ) => Compute<ReturnType<Self[K]> & { type: K }>
    : never;
};

export type FinalModelCreators<Self> = {
  events: FinalEventCreators<Prop<Self, 'events'>>;
};

export type EventFromEventCreators<EventCreators> = {
  [K in keyof EventCreators]: EventCreators[K] extends AnyFunction
    ? ReturnType<EventCreators[K]>
    : never;
}[keyof EventCreators];
