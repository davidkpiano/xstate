import {
  EventObject,
  InvokeCallback,
  Subscribable,
  BehaviorCreator,
  SCXML,
  InvokeMeta,
  MachineContext,
  Behavior
} from './types';

import { isFunction, mapContext } from './utils';
import { AnyEventObject } from './types';
import { StateMachine } from './StateMachine';
import {
  createMachineBehavior,
  createDeferredBehavior,
  createObservableBehavior,
  createPromiseBehavior
} from './behaviors';

export const DEFAULT_SPAWN_OPTIONS = { sync: false };

export function invokeMachine<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TMachine extends StateMachine<any, any, any>
>(
  machine:
    | TMachine
    | ((ctx: TContext, event: TEvent, meta: InvokeMeta) => TMachine),
  options: { sync?: boolean } = {}
): BehaviorCreator<TContext, TEvent> {
  return (ctx, event, { data, src, _event }) => {
    const resolvedContext = data ? mapContext(data, ctx, _event) : undefined;
    const machineOrDeferredMachine = isFunction(machine)
      ? () => {
          const resolvedMachine = machine(ctx, event, {
            data: resolvedContext,
            src
          });
          return resolvedContext
            ? resolvedMachine.withContext(resolvedContext)
            : resolvedMachine;
        }
      : resolvedContext
      ? machine.withContext(resolvedContext)
      : machine;

    return createMachineBehavior(machineOrDeferredMachine, options);
  };
}

export function invokePromise<T>(
  getPromise: (
    ctx: any,
    event: AnyEventObject,
    meta: InvokeMeta
  ) => PromiseLike<T>
): BehaviorCreator<any, AnyEventObject> {
  return (ctx, e, { data, src, _event }) => {
    const resolvedData = data ? mapContext(data, ctx, _event) : undefined;

    const lazyPromise = () => getPromise(ctx, e, { data: resolvedData, src });
    return createPromiseBehavior(lazyPromise);
  };
}

export function invokeActivity<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  activityCreator: (ctx: TContext, event: TEvent) => any
): BehaviorCreator<TContext, TEvent> {
  const callbackCreator = (ctx: TContext, event: TEvent) => () => {
    return activityCreator(ctx, event);
  };

  return invokeCallback<TContext, TEvent>(callbackCreator);
}

export function invokeCallback<
  TContext extends MachineContext,
  TEvent extends EventObject = AnyEventObject
>(
  callbackCreator: (ctx: TContext, e: TEvent) => InvokeCallback
): BehaviorCreator<TContext, TEvent> {
  return (ctx, event): Behavior<SCXML.Event<TEvent>, undefined> => {
    const lazyCallback = () => callbackCreator(ctx, event);
    return createDeferredBehavior<SCXML.Event<TEvent>>(lazyCallback);
  };
}

export function invokeObservable<TEvent extends EventObject = AnyEventObject>(
  source: (ctx: any, event: any) => Subscribable<TEvent>
): BehaviorCreator<any, any> {
  return (ctx, e): Behavior<never, TEvent | undefined> => {
    const resolvedSource = isFunction(source) ? source(ctx, e) : source;
    return createObservableBehavior(() => resolvedSource);
  };
}
