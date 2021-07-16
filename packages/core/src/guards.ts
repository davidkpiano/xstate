import {
  EventObject,
  StateValue,
  BooleanGuardDefinition,
  GuardConfig,
  GuardDefinition,
  GuardMeta,
  SCXML,
  GuardPredicate,
  MachineContext
} from './types';
import { isStateId } from './stateUtils';
import { isFunction, isString } from './utils';
import { State } from './State';

export function stateIn<
  TContext extends MachineContext,
  TEvent extends EventObject
>(stateValue: StateValue): GuardDefinition<TContext, TEvent> {
  return {
    type: 'xstate.guard:in',
    params: { stateValue },
    predicate: (_, __, { state }) => {
      if (isString(stateValue) && isStateId(stateValue)) {
        return state.configuration.some((sn) => sn.id === stateValue.slice(1));
      }

      return state.matches(stateValue);
    }
  };
}

export function not<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  guard: GuardConfig<TContext, TEvent>
): BooleanGuardDefinition<TContext, TEvent> {
  return {
    type: 'xstate.boolean',
    params: { op: 'not' },
    children: [toGuardDefinition(guard)],
    predicate: (ctx, _, meta) => {
      return !meta.evaluate(
        meta.guard.children![0],
        ctx,
        meta._event,
        meta.state
      );
    }
  };
}

export function and<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  guards: Array<GuardConfig<TContext, TEvent>>
): BooleanGuardDefinition<TContext, TEvent> {
  return {
    type: 'xstate.boolean',
    params: { op: 'and' },
    children: guards.map((guard) => toGuardDefinition(guard)),
    predicate: (ctx, _, meta) => {
      return meta.guard.children!.every((childGuard) => {
        return meta.evaluate(childGuard, ctx, meta._event, meta.state);
      });
    }
  };
}

export function or<TContext extends MachineContext, TEvent extends EventObject>(
  guards: Array<GuardConfig<TContext, TEvent>>
): BooleanGuardDefinition<TContext, TEvent> {
  return {
    type: 'xstate.boolean',
    params: { op: 'or' },
    children: guards.map((guard) => toGuardDefinition(guard)),
    predicate: (ctx, _, meta) => {
      return meta.guard.children!.some((childGuard) => {
        return meta.evaluate(childGuard, ctx, meta._event, meta.state);
      });
    }
  };
}

export function evaluateGuard<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  guard: GuardDefinition<TContext, TEvent>,
  context: TContext,
  _event: SCXML.Event<TEvent>,
  state: State<TContext, TEvent>
): boolean {
  const guardMeta: GuardMeta<TContext, TEvent> = {
    state,
    guard,
    _event,
    evaluate: evaluateGuard
  };

  const predicate = guard.predicate;

  if (!predicate) {
    throw new Error(`Guard '${guard.type}' is not implemented.'.`);
  }

  return predicate(context, _event.data, guardMeta);
}

export function toGuardDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  guardConfig: GuardConfig<TContext, TEvent>,
  getPredicate?: (guardType: string) => GuardPredicate<TContext, TEvent>
): GuardDefinition<TContext, TEvent> {
  if (isString(guardConfig)) {
    return {
      type: guardConfig,
      predicate: getPredicate?.(guardConfig) || undefined,
      params: { type: guardConfig }
    };
  }

  if (isFunction(guardConfig)) {
    return {
      type: guardConfig.name,
      predicate: guardConfig,
      params: {
        type: guardConfig.name,
        name: guardConfig.name
      }
    };
  }

  return {
    type: guardConfig.type,
    params: guardConfig.params || guardConfig,
    children: (guardConfig.children as Array<
      GuardConfig<TContext, TEvent>
    >)?.map((childGuard) => toGuardDefinition(childGuard, getPredicate)),
    predicate:
      getPredicate?.(guardConfig.type) || (guardConfig as any).predicate
  };
}
