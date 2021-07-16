import { assign } from './actions';
import { createMachine } from './Machine';
import type { EventObject, MachineContext } from './types';
import { mapValues } from './utils';
import {
  Cast,
  EventFromEventCreators,
  FinalModelCreators,
  Model,
  ModelCreators,
  Prop
} from './model.types';

export function createModel<
  TContext extends MachineContext,
  TEvent extends EventObject
>(initialContext: TContext): Model<TContext, TEvent, void>;
export function createModel<
  TContext extends MachineContext,
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
