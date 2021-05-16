import {
  Action,
  Event,
  EventObject,
  SingleOrArray,
  SendAction,
  SendActionOptions,
  CancelAction,
  CancelActionObject,
  ActionObject,
  ActionType,
  Assigner,
  PropertyAssigner,
  AssignAction,
  ActionFunction,
  ActionFunctionMap,
  ActionTypes,
  SpecialTargets,
  RaiseAction,
  RaiseActionObject,
  DoneEvent,
  ErrorPlatformEvent,
  DoneEventObject,
  SendExpr,
  SendActionObject,
  PureAction,
  LogExpr,
  LogAction,
  LogActionObject,
  DelayFunctionMap,
  SCXML,
  ExprWithMeta,
  ChooseCondition,
  ChooseAction,
  InvokeDefinition,
  InvokeAction,
  StopActionObject,
  AnyEventObject,
  ActorRef,
  Expr,
  ForEachAction,
  StopAction,
  SpawnedActorRef,
  BehaviorCreator,
  ActorMap,
  InvokeActionObject
} from './types';
import * as actionTypes from './actionTypes';
import {
  getEventType,
  isFunction,
  isString,
  toEventObject,
  toSCXMLEvent,
  isArray
} from './utils';

import { isActorRef } from './Actor';
import { ObservableActorRef } from './ObservableActorRef';
export { actionTypes };

export const initEvent = toSCXMLEvent({ type: actionTypes.init });

export function getActionFunction<TContext, TEvent extends EventObject>(
  actionType: ActionType,
  actionFunctionMap?: ActionFunctionMap<TContext, TEvent>
):
  | ActionObject<TContext, TEvent>
  | ActionFunction<TContext, TEvent>
  | undefined {
  return actionFunctionMap
    ? actionFunctionMap[actionType] || undefined
    : undefined;
}

export function toActionObject<TContext, TEvent extends EventObject>(
  action: Action<TContext, TEvent>,
  actionFunctionMap?: ActionFunctionMap<TContext, TEvent>
): ActionObject<TContext, TEvent> {
  let actionObject: ActionObject<TContext, TEvent>;

  if (isString(action) || typeof action === 'number') {
    const exec = getActionFunction(action, actionFunctionMap);
    if (isFunction(exec)) {
      actionObject = {
        type: action,
        exec
      };
    } else if (exec) {
      actionObject = exec;
    } else {
      actionObject = { type: action, exec: undefined };
    }
  } else if (isFunction(action)) {
    actionObject = {
      // Convert action to string if unnamed
      type: action.name || action.toString(),
      exec: action
    };
  } else {
    const exec = getActionFunction(action.type, actionFunctionMap);
    if (isFunction(exec)) {
      actionObject = {
        ...action,
        exec
      };
    } else if (exec) {
      const actionType = exec.type || action.type;

      actionObject = {
        ...exec,
        ...action,
        type: actionType
      } as ActionObject<TContext, TEvent>;
    } else {
      actionObject = action as ActionObject<TContext, TEvent>;
    }
  }

  Object.defineProperty(actionObject, 'toString', {
    value: () => actionObject.type,
    enumerable: false,
    configurable: true
  });

  return actionObject;
}

export const toActionObjects = <TContext, TEvent extends EventObject>(
  action?: SingleOrArray<Action<TContext, TEvent>> | undefined,
  actionFunctionMap?: ActionFunctionMap<TContext, TEvent>
): Array<ActionObject<TContext, TEvent>> => {
  if (!action) {
    return [];
  }

  const actions = isArray(action) ? action : [action];

  return actions.map((subAction) =>
    toActionObject(subAction, actionFunctionMap)
  );
};

/**
 * Raises an event. This places the event in the internal event queue, so that
 * the event is immediately consumed by the machine in the current step.
 *
 * @param eventType The event to raise.
 */
export function raise<TContext, TEvent extends EventObject>(
  event: Event<TEvent>
): RaiseAction<TEvent> | SendAction<TContext, AnyEventObject, TEvent> {
  if (!isString(event)) {
    return send(event, { to: SpecialTargets.Internal });
  }
  return {
    type: actionTypes.raise,
    event
  };
}

export function resolveRaise<TEvent extends EventObject>(
  action: RaiseAction<TEvent>
): RaiseActionObject<TEvent> {
  return {
    type: actionTypes.raise,
    _event: toSCXMLEvent(action.event)
  };
}

/**
 * Sends an event. This returns an action that will be read by an interpreter to
 * send the event in the next step, after the current step is finished executing.
 *
 * @param event The event to send.
 * @param options Options to pass into the send event:
 *  - `id` - The unique send event identifier (used with `cancel()`).
 *  - `delay` - The number of milliseconds to delay the sending of the event.
 *  - `to` - The target of this event (by default, the machine the event was sent from).
 */
export function send<
  TContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject = AnyEventObject
>(
  event: Event<TSentEvent> | SendExpr<TContext, TEvent, TSentEvent>,
  options?: SendActionOptions<TContext, TEvent>
): SendAction<TContext, TEvent, TSentEvent> {
  return {
    to: options ? options.to : undefined,
    type: actionTypes.send,
    event: isFunction(event) ? event : toEventObject<TSentEvent>(event),
    delay: options ? options.delay : undefined,
    id:
      options && options.id !== undefined
        ? options.id
        : isFunction(event)
        ? undefined
        : (getEventType<TSentEvent>(event) as string)
  };
}

export function resolveSend<
  TContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject
>(
  action: SendAction<TContext, TEvent, TSentEvent>,
  ctx: TContext,
  _event: SCXML.Event<TEvent>,
  delaysMap?: DelayFunctionMap<TContext, TEvent>
): SendActionObject<TContext, TEvent, TSentEvent> {
  const meta = {
    _event
  };

  // TODO: helper function for resolving Expr
  const resolvedEvent = toSCXMLEvent(
    isFunction(action.event)
      ? action.event(ctx, _event.data, meta)
      : action.event,
    {
      sendid: action.id
    }
  );

  let resolvedDelay: number | undefined;
  if (isString(action.delay)) {
    const configDelay = delaysMap && delaysMap[action.delay];
    resolvedDelay = isFunction(configDelay)
      ? configDelay(ctx, _event.data, meta)
      : configDelay;
  } else {
    resolvedDelay = isFunction(action.delay)
      ? action.delay(ctx, _event.data, meta)
      : action.delay;
  }

  let resolvedTarget = isFunction(action.to)
    ? action.to(ctx, _event.data, meta)
    : action.to;
  resolvedTarget =
    isString(resolvedTarget) &&
    resolvedTarget !== SpecialTargets.Parent &&
    resolvedTarget !== SpecialTargets.Internal &&
    resolvedTarget.startsWith('#_')
      ? resolvedTarget.slice(2)
      : resolvedTarget;

  return {
    ...action,
    to: resolvedTarget,
    _event: resolvedEvent,
    event: resolvedEvent.data,
    delay: resolvedDelay
  };
}

export function resolveInvoke<TContext, TEvent extends EventObject>(
  action: InvokeAction,
  ctx: TContext,
  _event: SCXML.Event<TEvent>,
  actorMap: ActorMap<TContext, TEvent>
): InvokeActionObject {
  const { id, data, src } = action;

  if (isActorRef(src)) {
    return {
      ...action,
      ref: src as SpawnedActorRef<any>
    };
  }

  const behaviorCreator: BehaviorCreator<TContext, TEvent> | undefined =
    actorMap[src.type];

  if (!behaviorCreator) {
    return action;
  }

  const behavior = behaviorCreator(ctx, _event.data, {
    id,
    data,
    src,
    _event
  });

  return {
    ...action,
    ref: new ObservableActorRef(behavior, id)
  };
}

/**
 * Sends an event to this machine's parent.
 *
 * @param event The event to send to the parent machine.
 * @param options Options to pass into the send event.
 */
export function sendParent<
  TContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject = AnyEventObject
>(
  event: Event<TSentEvent> | SendExpr<TContext, TEvent, TSentEvent>,
  options?: SendActionOptions<TContext, TEvent>
): SendAction<TContext, TEvent, TSentEvent> {
  return send<TContext, TEvent, TSentEvent>(event, {
    ...options,
    to: SpecialTargets.Parent
  });
}

/**
 * Sends an update event to this machine's parent.
 */
export function sendUpdate<TContext, TEvent extends EventObject>(): SendAction<
  TContext,
  TEvent,
  { type: ActionTypes.Update }
> {
  return sendParent<TContext, TEvent, { type: ActionTypes.Update }>(
    actionTypes.update
  );
}

/**
 * Sends an event back to the sender of the original event.
 *
 * @param event The event to send back to the sender
 * @param options Options to pass into the send event
 */
export function respond<
  TContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject = AnyEventObject
>(
  event: Event<TEvent> | SendExpr<TContext, TEvent, TSentEvent>,
  options?: SendActionOptions<TContext, TEvent>
) {
  return send<TContext, TEvent>(event, {
    ...options,
    to: (_, __, { _event }) => {
      return _event.origin!; // TODO: handle when _event.origin is undefined
    }
  });
}

const defaultLogExpr = <TContext, TEvent extends EventObject>(
  context: TContext,
  event: TEvent
) => ({
  context,
  event
});

/**
 *
 * @param expr The expression function to evaluate which will be logged.
 *  Takes in 2 arguments:
 *  - `ctx` - the current state context
 *  - `event` - the event that caused this action to be executed.
 * @param label The label to give to the logged expression.
 */
export function log<TContext, TEvent extends EventObject>(
  expr: string | LogExpr<TContext, TEvent> = defaultLogExpr,
  label?: string
): LogAction<TContext, TEvent> {
  return {
    type: actionTypes.log,
    label,
    expr
  };
}

export const resolveLog = <TContext, TEvent extends EventObject>(
  action: LogAction<TContext, TEvent>,
  ctx: TContext,
  _event: SCXML.Event<TEvent>
): LogActionObject<TContext, TEvent> => ({
  // TODO: remove .expr from resulting object
  ...action,
  value: isString(action.expr)
    ? action.expr
    : action.expr(ctx, _event.data, {
        _event
      })
});

/**
 * Cancels an in-flight `send(...)` action. A canceled sent action will not
 * be executed, nor will its event be sent, unless it has already been sent
 * (e.g., if `cancel(...)` is called after the `send(...)` action's `delay`).
 *
 * @param sendId The `id` of the `send(...)` action to cancel.
 */
export const cancel = <TContext, TEvent extends EventObject>(
  sendId: string | ExprWithMeta<TContext, TEvent, string>
): CancelAction<TContext, TEvent> => {
  return {
    type: actionTypes.cancel,
    sendId
  };
};

export const resolveCancel = <TContext, TEvent extends EventObject>(
  action: CancelAction<TContext, TEvent>,
  ctx: TContext,
  _event: SCXML.Event<TEvent>
): CancelActionObject<TContext, TEvent> => {
  if (typeof action.sendId === 'function') {
    return {
      ...action,
      sendId: action.sendId(ctx, _event.data, {
        _event
      })
    };
  }

  return action as CancelActionObject<TContext, TEvent>;
};

export function invoke<TContext, TEvent extends EventObject>(
  invokeDef: InvokeDefinition<TContext, TEvent>
): InvokeAction {
  return {
    type: ActionTypes.Invoke,
    src: invokeDef.src,
    id: invokeDef.id,
    autoForward: invokeDef.autoForward,
    data: invokeDef.data,
    exec: undefined
  };
}

/**
 * Stops an actor.
 *
 * @param actorRef The activity to stop.
 */
export function stop<TContext, TEvent extends EventObject>(
  actorRef: string | Expr<TContext, TEvent, ActorRef<any>>
): StopAction<TContext, TEvent> {
  const activity = isFunction(actorRef) ? actorRef : actorRef;

  return {
    type: ActionTypes.Stop,
    actor: activity
  };
}

export function resolveStop<TContext, TEvent extends EventObject>(
  action: StopAction<TContext, TEvent>,
  context: TContext,
  _event: SCXML.Event<TEvent>
): StopActionObject {
  const actorRefOrString = isFunction(action.actor)
    ? action.actor(context, _event.data)
    : action.actor;

  const actionObject = {
    type: ActionTypes.Stop as const,
    actor: actorRefOrString
  };

  return actionObject;
}

/**
 * Updates the current context of the machine.
 *
 * @param assignment An object that represents the partial context to update.
 */
export const assign = <TContext, TEvent extends EventObject = EventObject>(
  assignment: Assigner<TContext, TEvent> | PropertyAssigner<TContext, TEvent>
): AssignAction<TContext, TEvent> => {
  return {
    type: actionTypes.assign,
    assignment
  };
};

export function isActionObject<TContext, TEvent extends EventObject>(
  action: Action<TContext, TEvent>
): action is ActionObject<TContext, TEvent> {
  return typeof action === 'object' && 'type' in action;
}

/**
 * Returns an event type that represents an implicit event that
 * is sent after the specified `delay`.
 *
 * @param delayRef The delay in milliseconds
 * @param id The state node ID where this event is handled
 */
export function after(delayRef: number | string, id?: string) {
  const idSuffix = id ? `#${id}` : '';
  return `${ActionTypes.After}(${delayRef})${idSuffix}`;
}

/**
 * Returns an event that represents that a final state node
 * has been reached in the parent state node.
 *
 * @param id The final state node's parent state node `id`
 * @param data The data to pass into the event
 */
export function done(id: string, data?: any): DoneEventObject {
  const type = `${ActionTypes.DoneState}.${id}`;
  const eventObject = {
    type,
    data
  };

  eventObject.toString = () => type;

  return eventObject as DoneEvent;
}

/**
 * Returns an event that represents that an invoked service has terminated.
 *
 * An invoked service is terminated when it has reached a top-level final state node,
 * but not when it is canceled.
 *
 * @param invokeId The invoked service ID
 * @param data The data to pass into the event
 */
export function doneInvoke(invokeId: string, data?: any): DoneEvent {
  const type = `${ActionTypes.DoneInvoke}.${invokeId}`;
  const eventObject = {
    type,
    data
  };

  eventObject.toString = () => type;

  return eventObject as DoneEvent;
}

export function error(id: string, data?: any): ErrorPlatformEvent & string {
  const type = `${ActionTypes.ErrorPlatform}.${id}`;
  const eventObject = { type, data };

  eventObject.toString = () => type;

  return eventObject as ErrorPlatformEvent & string;
}

export function pure<TContext, TEvent extends EventObject>(
  getActions: (
    context: TContext,
    event: TEvent
  ) => SingleOrArray<ActionObject<TContext, TEvent>> | undefined
): PureAction<TContext, TEvent> {
  return {
    type: ActionTypes.Pure,
    get: getActions
  };
}

/**
 * Forwards (sends) an event to a specified service.
 *
 * @param target The target service to forward the event to.
 * @param options Options to pass into the send action creator.
 */
export function forwardTo<TContext, TEvent extends EventObject>(
  target: Required<SendActionOptions<TContext, TEvent>>['to'],
  options?: SendActionOptions<TContext, TEvent>
): SendAction<TContext, TEvent, AnyEventObject> {
  return send<TContext, TEvent>((_, event) => event, {
    ...options,
    to: target
  });
}

/**
 * Escalates an error by sending it as an event to this machine's parent.
 *
 * @param errorData The error data to send, or the expression function that
 * takes in the `context`, `event`, and `meta`, and returns the error data to send.
 * @param options Options to pass into the send action creator.
 */
export function escalate<
  TContext,
  TEvent extends EventObject,
  TErrorData = any
>(
  errorData: TErrorData | ExprWithMeta<TContext, TEvent, TErrorData>,
  options?: SendActionOptions<TContext, TEvent>
): SendAction<TContext, TEvent, AnyEventObject> {
  return sendParent<TContext, TEvent>(
    (context, event, meta) => {
      return {
        type: actionTypes.error,
        data: isFunction(errorData)
          ? errorData(context, event, meta)
          : errorData
      };
    },
    {
      ...options,
      to: SpecialTargets.Parent
    }
  );
}

export function choose<TContext, TEvent extends EventObject>(
  guards: Array<ChooseCondition<TContext, TEvent>>
): ChooseAction<TContext, TEvent> {
  return {
    type: ActionTypes.Choose,
    guards
  };
}

export function each<TContext, TEvent extends EventObject>(
  actions: Array<ActionObject<TContext, TEvent>>,
  props: {
    array: keyof TContext;
    item: keyof TContext;
    index: keyof TContext;
  }
): ForEachAction<TContext, TEvent> {
  return {
    type: ActionTypes.Each,
    actions,
    ...props
  };
}
