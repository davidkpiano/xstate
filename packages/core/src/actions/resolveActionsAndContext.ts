import {
  EventObject,
  ForEachAction,
  InvokeAction,
  InvokeSourceDefinition
} from '..';
import { toArray, warn, isArray, isString, toSCXMLEvent } from '../utils';
import { updateContext } from '../updateContext';
import {
  SCXML,
  ActionObject,
  AssignAction,
  RaiseAction,
  CancelAction,
  SendAction,
  LogAction,
  PureAction,
  RaiseActionObject,
  SpecialTargets,
  ChooseAction,
  StopActionObject,
  AnyEventObject
} from '../types';
import { State } from '../State';
import {
  toActionObjects,
  actionTypes,
  resolveRaise,
  resolveSend,
  resolveLog,
  resolveCancel,
  toActionObject,
  resolveStop,
  assign,
  resolveInvoke
} from '../actions';
import { IS_PRODUCTION } from '../environment';
import { MachineNode } from '../MachineNode';
import { evaluateGuard, toGuardDefinition } from '../guards';

export function resolveActionsAndContext<TContext, TEvent extends EventObject>(
  actions: Array<ActionObject<TContext, TEvent>>,
  machine: MachineNode<TContext, TEvent, any>,
  _event: SCXML.Event<TEvent>,
  currentState: State<TContext, TEvent, any> | undefined
): {
  actions: typeof actions;
  raised: Array<RaiseActionObject<TEvent>>;
  context: TContext;
} {
  let context: TContext = currentState ? currentState.context : machine.context;
  const resActions: Array<ActionObject<TContext, TEvent>> = [];
  const raisedActions: Array<RaiseActionObject<TEvent>> = [];

  toActionObjects(actions, machine.options.actions).forEach(
    function resolveAction(actionObject) {
      switch (actionObject.type) {
        case actionTypes.raise:
          raisedActions.push(resolveRaise(actionObject as RaiseAction<TEvent>));
          break;
        case actionTypes.cancel:
          resActions.push(
            resolveCancel(
              actionObject as CancelAction<TContext, TEvent>,
              context,
              _event
            )
          );
          break;
        case actionTypes.send:
          const sendAction = resolveSend(
            actionObject as SendAction<TContext, TEvent, AnyEventObject>,
            context,
            _event,
            machine.machine.options.delays
          );
          if (!IS_PRODUCTION) {
            // warn after resolving as we can create better contextual message here
            warn(
              !isString(actionObject.delay) ||
                typeof sendAction.delay === 'number',
              // tslint:disable-next-line:max-line-length
              `No delay reference for delay expression '${actionObject.delay}' was found on machine '${machine.machine.id}'`
            );
          }
          if (sendAction.to === SpecialTargets.Internal) {
            raisedActions.push(sendAction as RaiseActionObject<any>);
          } else {
            resActions.push(sendAction);
          }
          break;
        case actionTypes.log:
          resActions.push(
            resolveLog(
              actionObject as LogAction<TContext, TEvent>,
              context,
              _event
            )
          );
          break;
        case actionTypes.choose: {
          const chooseAction = actionObject as ChooseAction<TContext, TEvent>;
          const matchedActions = chooseAction.guards.find((condition) => {
            const guard =
              condition.guard &&
              toGuardDefinition(
                condition.guard,
                (guardType) => machine.options.guards[guardType]
              );
            return (
              !guard ||
              evaluateGuard(guard, context, _event, currentState as any)
            );
          })?.actions;

          if (matchedActions) {
            toActionObjects(
              toArray(matchedActions),
              machine.options.actions
            ).forEach(resolveAction);
          }
          break;
        }

        case actionTypes.pure:
          const matchedActions = (actionObject as PureAction<
            TContext,
            TEvent
          >).get(context, _event.data);

          if (matchedActions) {
            toActionObjects(
              toArray(matchedActions),
              machine.options.actions
            ).forEach(resolveAction);
          }
          break;
        case actionTypes.assign:
          try {
            const [nextContext, nextActions] = updateContext(
              context,
              _event,
              [actionObject as AssignAction<TContext, TEvent>],
              currentState
            );
            context = nextContext;
            resActions.push(actionObject, ...nextActions);
          } catch (err) {
            // Raise error.execution events for failed assign actions
            raisedActions.push({
              type: actionTypes.raise,
              _event: toSCXMLEvent({
                type: actionTypes.errorExecution,
                error: err
              } as any) // TODO: fix
            });
          }
          break;
        case actionTypes.invoke:
          const invokeAction = resolveInvoke(
            actionObject as InvokeAction,
            context,
            _event,
            machine.options.actors
          );
          if (!IS_PRODUCTION && !invokeAction.ref) {
            warn(
              false,
              `Actor type '${
                (invokeAction.src as InvokeSourceDefinition).type
              }' not found in machine '${machine.id}'.`
            );
          }
          resActions.push(invokeAction);
          break;
        case actionTypes.stop:
          const stopAction = resolveStop(
            actionObject as StopActionObject,
            context,
            _event
          );
          resActions.push(stopAction);
          break;
        case actionTypes.each:
          const action = actionObject as ForEachAction<TContext, TEvent>;
          const array = context[action.array];

          if (isArray(array)) {
            array.forEach((item, index) => {
              const [nextContext] = updateContext(
                context,
                _event,
                [
                  assign<TContext, TEvent>({
                    [action.item]: item as any,
                    [action.index]: index as any // TODO: fix
                  } as any) // TODO: fix
                ],
                currentState
              );

              context = nextContext;
              action.actions.forEach(resolveAction);
            });
          } else {
            raisedActions.push({
              type: actionTypes.raise,
              _event: toSCXMLEvent({
                type: actionTypes.errorExecution,
                error: `Invalid array: '${action.array}'`
              } as any) // TODO: fix
            });
          }
          break;
        default:
          resActions.push(
            toActionObject(actionObject, machine.machine.options.actions)
          );
          break;
      }
    }
  );

  return {
    actions: resActions,
    raised: raisedActions,
    context
  };
}
