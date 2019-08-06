import { EventObject, ActionObject, DefaultContext } from 'xstate';
import { produce, Draft } from 'immer';
import { actionTypes } from 'xstate/lib/actions';

export type ImmerAssigner<
  TContext extends DefaultContext,
  TEvent extends EventObject
> = (context: Draft<TContext>, event: TEvent) => void;

export interface ImmerAssignAction<
  TContext extends DefaultContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  assignment: ImmerAssigner<TContext, TEvent>;
}

export function assign<
  TContext extends DefaultContext,
  TEvent extends EventObject = EventObject
>(
  assignment: ImmerAssigner<TContext, TEvent>
): ImmerAssignAction<TContext, TEvent> {
  return {
    type: actionTypes.assign,
    assignment
  };
}

export function updater<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  context: TContext,
  event: TEvent,
  assignActions: Array<ImmerAssignAction<TContext, TEvent>>
): TContext {
  const updatedContext = context
    ? assignActions.reduce((acc, assignAction) => {
        const { assignment } = assignAction as ImmerAssignAction<
          TContext,
          TEvent
        >;

        const update = produce(acc, interim => void assignment(interim, event));

        return update;
      }, context)
    : context;

  return updatedContext as TContext;
}
