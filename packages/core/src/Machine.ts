import {
  MachineImplementations,
  MachineConfig,
  EventObject,
  AnyEventObject,
  Typestate,
  MachineContext
} from './types';
import { StateMachine } from './StateMachine';
import { Model, ModelContextFrom, ModelEventsFrom } from './model';

export function createMachine<
  TModel extends Model<any, any, any>,
  TContext extends MachineContext = ModelContextFrom<TModel>,
  TEvent extends EventObject = ModelEventsFrom<TModel>,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext },
  TConfig extends MachineConfig<TConfig, TContext, TEvent> = MachineConfig<
    any,
    TContext,
    TEvent
  >
>(
  config: TConfig,
  options?: Partial<MachineImplementations<TContext, TEvent>>
): StateMachine<TContext, TEvent, TTypestate>;
export function createMachine<
  TContext extends MachineContext,
  TEvent extends EventObject = AnyEventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext },
  TConfig extends MachineConfig<TConfig, TContext, TEvent> = MachineConfig<
    any,
    TContext,
    TEvent
  >
>(
  config: TConfig,
  options?: Partial<MachineImplementations<TContext, TEvent>>
): StateMachine<TContext, TEvent, TTypestate>;
export function createMachine<
  TContext extends MachineContext,
  TEvent extends EventObject = AnyEventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext },
  TConfig extends MachineConfig<TConfig, TContext, TEvent> = MachineConfig<
    any,
    TContext,
    TEvent
  >
>(
  definition: TConfig,
  implementations?: Partial<MachineImplementations<TContext, TEvent>>
): StateMachine<TContext, TEvent, TTypestate> {
  return new StateMachine<TContext, TEvent, TTypestate>(
    definition,
    implementations
  );
}
