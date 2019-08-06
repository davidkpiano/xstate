import {
  StateMachine,
  MachineOptions,
  DefaultContext,
  MachineConfig,
  StateSchema,
  EventObject
} from './types';
import { StateNode } from './StateNode';

export function Machine<
  TContext extends DefaultContext = DefaultContext,
  TEvent extends EventObject = EventObject
>(
  config: MachineConfig<TContext, any, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>,
  initialContext?: TContext
): StateMachine<TContext, any, TEvent>;
export function Machine<
  TContext extends DefaultContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject
>(
  config: MachineConfig<TContext, TStateSchema, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>,
  initialContext?: TContext
): StateMachine<TContext, TStateSchema, TEvent>;
export function Machine<
  TContext extends DefaultContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject
>(
  config: MachineConfig<TContext, TStateSchema, TEvent>,
  options?: Partial<MachineOptions<TContext, TEvent>>,
  initialContext?: TContext
): StateMachine<TContext, TStateSchema, TEvent> {
  return new StateNode<TContext, TStateSchema, TEvent>(
    config,
    options,
    initialContext
  ) as StateMachine<TContext, TStateSchema, TEvent>;
}
