import {
  interpret,
  EventObject,
  State,
  Interpreter,
  InterpreterOptions,
  MachineImplementations,
  Typestate,
  Observer,
  MachineNode
} from 'xstate';
import { UseMachineOptions, MaybeLazy } from './types';
import { onBeforeUnmount, onMounted } from 'vue';
import { MachineContext } from '../../core/src';

// copied from core/src/utils.ts
// it avoids a breaking change between this package and XState which is its peer dep
function toObserver<T>(
  nextHandler: Observer<T> | ((value: T) => void),
  errorHandler?: (error: any) => void,
  completionHandler?: () => void
): Observer<T> {
  if (typeof nextHandler === 'object') {
    return nextHandler;
  }

  const noop = () => void 0;

  return {
    next: nextHandler,
    error: errorHandler || noop,
    complete: completionHandler || noop
  };
}

export function useInterpret<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  getMachine: MaybeLazy<MachineNode<TContext, TEvent, TTypestate>>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext, TEvent>> &
    Partial<MachineImplementations<TContext, TEvent>> = {},
  observerOrListener?:
    | Observer<State<TContext, TEvent, TTypestate>>
    | ((value: State<TContext, TEvent, TTypestate>) => void)
): Interpreter<TContext, TEvent, TTypestate> {
  const machine = typeof getMachine === 'function' ? getMachine() : getMachine;

  const {
    context,
    guards,
    actions,
    actors,
    delays,
    state: rehydratedState,
    ...interpreterOptions
  } = options;

  const machineConfig = {
    context,
    guards,
    actions,
    actors,
    delays
  };

  const machineWithConfig = machine.provide({ ...machineConfig, context });

  const service = interpret(machineWithConfig, interpreterOptions).start(
    rehydratedState ? (State.create(rehydratedState) as any) : undefined
  );

  let sub;
  onMounted(() => {
    if (observerOrListener) {
      sub = service.subscribe(toObserver(observerOrListener));
    }
  });

  onBeforeUnmount(() => {
    service.stop();
    sub?.unsubscribe();
  });

  return service;
}
