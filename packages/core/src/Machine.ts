import {
  StateMachine,
  MachineOptions,
  DefaultContext,
  MachineConfig,
  StateSchema,
  EventObject,
  AnyEventObject,
  Typestate
} from './types';
import { StateNode } from './StateNode';
import { Model, ModelContextFrom, ModelEventsFrom } from './model';

/**
 * Docs: {@link https://xstate.js.org/docs/guides/machines.html#configuration Machines}.
 * API: {@link https://xstate.js.org/api/globals.html#machine Machine}.
 *
 * Recommendation: Prefer `createMachine`.
 *
 * Creates a new finite-state machine (statechart) from the config.
 *
 */
export function Machine<
  TContext = any,
  TEvent extends EventObject = AnyEventObject
>(
  config: MachineConfig<TContext, any, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>,
  initialContext?: TContext
): StateMachine<TContext, any, TEvent>;
export function Machine<
  TContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = AnyEventObject
>(
  config: MachineConfig<TContext, TStateSchema, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>,
  initialContext?: TContext
): StateMachine<TContext, TStateSchema, TEvent>;
export function Machine<
  TContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = AnyEventObject
>(
  config: MachineConfig<TContext, TStateSchema, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>,
  initialContext: TContext | (() => TContext) | undefined = config.context
): StateMachine<TContext, TStateSchema, TEvent> {
  return new StateNode<TContext, TStateSchema, TEvent>(
    config,
    options,
    initialContext
  ) as StateMachine<TContext, TStateSchema, TEvent>;
}

/**
 * Docs: {@link https://xstate.js.org/docs/guides/machines.html#configuration Machines}.
 * API: {@link https://xstate.js.org/api/globals.html#createmachine createMachine}.
 *
 * Creates a new finite state machine from the config.
 *
 * @param config The config object for creating the machine.
 * @param options The implementation details for actions, guards, services, and delays.
 */
export function createMachine<
  TModel extends Model<any, any, any>,
  TContext = ModelContextFrom<TModel>,
  TEvent extends EventObject = ModelEventsFrom<TModel>,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  config: MachineConfig<TContext, any, TEvent> & { context: TContext },
  options?: Partial<MachineOptions<TContext, TEvent>>
): StateMachine<TContext, any, TEvent, TTypestate>;
export function createMachine<
  TContext,
  TEvent extends EventObject = AnyEventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  // Ensure that only the first overload matches models, and prevent
  // accidental inference of the model as the `TContext` (which leads to cryptic errors)
  config: TContext extends Model<any, any, any>
    ? never
    : MachineConfig<TContext, any, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>
): StateMachine<TContext, any, TEvent, TTypestate>;
export function createMachine<
  TContext,
  TEvent extends EventObject = AnyEventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  config: MachineConfig<TContext, any, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>
): StateMachine<TContext, any, TEvent, TTypestate> {
  return new StateNode<TContext, any, TEvent, TTypestate>(
    config,
    options
  ) as StateMachine<TContext, any, TEvent, TTypestate>;
}
