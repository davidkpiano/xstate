import {
  EventObject,
  Assigner,
  ExtractEvent,
  PropertyAssigner,
  AssignAction,
  MachineConfig,
  MachineOptions,
  StateMachine,
  ActionObject
} from './types';

export type AnyFunction = (...args: any[]) => any;

export type Cast<A1 extends any, A2 extends any> = A1 extends A2 ? A1 : A2;
export type Compute<A extends any> = { [K in keyof A]: A[K] } & unknown;
export type Prop<T, K> = K extends keyof T ? T[K] : never;

export interface Model<
  TContext,
  TEvent extends EventObject,
  _TActions extends ActionObject<TContext, TEvent>,
  TModelCreators extends FinalModelCreators<any>
> {
  initialContext: TContext;
  assign: <TEventType extends TEvent['type'] = TEvent['type']>(
    assigner:
      | Assigner<TContext, ExtractEvent<TEvent, TEventType>>
      | PropertyAssigner<TContext, ExtractEvent<TEvent, TEventType>>,
    eventType?: TEventType
  ) => AssignAction<TContext, ExtractEvent<TEvent, TEventType>>;
  events: Prop<TModelCreators, 'events'>;
  actions: Prop<TModelCreators, 'actions'>;
  reset: () => AssignAction<TContext, any>;
  createMachine: (
    config: MachineConfig<TContext, any, TEvent>,
    implementations?: Partial<MachineOptions<TContext, TEvent>>
  ) => StateMachine<TContext, any, TEvent, any>;
}

export type ModelContextFrom<
  TModel extends Model<any, any, any, any>
> = TModel extends Model<infer TContext, any, any, any> ? TContext : never;

export type ModelEventsFrom<
  TModel extends Model<any, any, any, any> | undefined
> = TModel extends Model<any, infer TEvent, any, any> ? TEvent : EventObject;

export type ModelActionsFrom<
  TModel extends Model<any, any, any, any>
> = TModel extends Model<any, any, infer TActions, any> ? TActions : never;

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

export type FinalEventCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? (
        ...args: Parameters<Self[K]>
      ) => Compute<ReturnType<Self[K]> & { type: K }>
    : never;
};

export type ActionCreator<
  Self extends AnyFunction,
  Return = ReturnType<Self>
> = Return extends object
  ? Return extends {
      type: any;
    }
    ? "An action creator can't return an object with a type property"
    : Self
  : 'An action creator must return an object';

export type ActionCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? ActionCreator<Self[K]>
    : 'An action creator must be a function';
};

export type FinalActionCreators<Self> = {
  [K in keyof Self]: Self[K] extends AnyFunction
    ? (
        ...args: Parameters<Self[K]>
      ) => Compute<ReturnType<Self[K]> & { type: K }>
    : never;
};

export type ModelCreators<Self> = {
  events?: EventCreators<Prop<Self, 'events'>>;
  actions?: ActionCreators<Prop<Self, 'actions'>>;
};

export type FinalModelCreators<Self> = {
  events: FinalEventCreators<Prop<Self, 'events'>>;
  actions: FinalActionCreators<Prop<Self, 'actions'>>;
};

export type EventFromEventCreators<
  TEventCreators
> = keyof TEventCreators extends never
  ? EventObject
  : {
      [K in keyof TEventCreators]: TEventCreators[K] extends AnyFunction
        ? ReturnType<TEventCreators[K]>
        : never;
    }[keyof TEventCreators];
