import { ActionObject } from '.';
import { assign } from './actions';
import { createMachine } from './Machine';
import type { EventObject } from './types';
import { mapValues } from './utils';
import {
  Cast,
  EventFromEventCreators,
  FinalModelCreators,
  Model,
  ModelCreators,
  Prop
} from './model.types';

export function createModel<TContext, TEvent extends EventObject>(
  initialContext: TContext
): Model<TContext, TEvent, any, any>;
export function createModel<
  TContext,
  TModelCreators extends ModelCreators<TModelCreators>,
  TFinalModelCreators extends FinalModelCreators<TModelCreators> = FinalModelCreators<TModelCreators>
>(
  initialContext: TContext,
  creators: TModelCreators
): Model<
  TContext,
  Prop<TFinalModelCreators, 'events'> extends never
    ? EventObject
    : Cast<
        EventFromEventCreators<Prop<TFinalModelCreators, 'events'>>,
        EventObject
      >,
  Prop<TFinalModelCreators, 'actions'> extends never
    ? ActionObject<TContext, any>
    : Cast<
        EventFromEventCreators<Prop<TFinalModelCreators, 'actions'>>,
        ActionObject<TContext, any>
      >,
  TFinalModelCreators
>;
export function createModel(
  initialContext: object,
  creators?: ModelCreators<any>
): unknown {
  const eventCreators = creators?.events;
  const actionCreators = creators?.actions;

  const model: Model<any, any, any, any> = {
    initialContext,
    assign,
    events: (eventCreators
      ? mapValues(eventCreators, (fn, eventType) => (...args: any[]) => ({
          ...fn(...args),
          type: eventType
        }))
      : undefined) as any,
    actions: actionCreators
      ? mapValues(actionCreators, (fn, actionType) => (...args: any[]) => ({
          ...fn(...args),
          type: actionType
        }))
      : undefined,
    reset: () => assign(initialContext),
    createMachine: (config, implementations) => {
      return createMachine(
        // @ts-ignore TODO
        'context' in config ? config : { ...config, context: initialContext },
        implementations
      );
    }
  };

  return model;
}
