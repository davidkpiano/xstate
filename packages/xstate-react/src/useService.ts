import {
  EventObject,
  State,
  Interpreter,
  Typestate,
  MachineContext
} from 'xstate';
import { useActor } from './useActor';
import { PayloadSender } from './types';

export function getServiceSnapshot<TService extends Interpreter<any, any, any>>(
  service: TService
): TService['state'] {
  // TODO: remove compat lines in a new major, replace literal number with InterpreterStatus then as well
  return ('status' in service ? service.status : (service as any)._status) !== 0
    ? service.state
    : service.machine.initialState;
}

/**
 * @deprecated Use `useActor` instead.
 *
 * @param service The interpreted machine
 * @returns A tuple of the current `state` of the service and the service's `send(event)` method
 */
export function useService<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  service: Interpreter<TContext, TEvent, TTypestate>
): [State<TContext, TEvent, TTypestate>, PayloadSender<TEvent>] {
  if (process.env.NODE_ENV !== 'production' && !('machine' in service)) {
    throw new Error(
      `Attempted to use an actor-like object instead of a service in the useService() hook. Please use the useActor() hook instead.`
    );
  }

  const [state] = useActor(service);

  return [state, service.send];
}
