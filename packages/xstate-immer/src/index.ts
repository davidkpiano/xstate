import {
  EventObject,
  ActionObject,
  AssignAction,
  assign as xstateAssign,
  AssignMeta,
  Assigner
} from 'xstate';
import { produce, Draft } from 'immer';

export type ImmerAssigner<TContext, TEvent extends EventObject> = (
  context: Draft<TContext>,
  event: TEvent,
  meta: AssignMeta<TContext, TEvent>
) => void;

export interface ImmerAssignAction<TContext, TEvent extends EventObject>
  extends ActionObject<TContext, TEvent> {
  assignment: ImmerAssigner<TContext, TEvent>;
}

function immerAssign<TContext, TEvent extends EventObject = EventObject>(
  recipe: ImmerAssigner<TContext, TEvent>
): AssignAction<TContext, TEvent> {
  return xstateAssign((context, event, meta) => {
    return produce(context, (draft) => void recipe(draft, event, meta));
  });
}

function produceAssign<TContext, TEvent extends EventObject>(
  recipe: ImmerAssigner<TContext, TEvent>
): Assigner<TContext, TEvent> {
  return (
    context: TContext,
    event: TEvent,
    meta: AssignMeta<TContext, TEvent>
  ) => {
    const newState = produce(
      context,
      (draft) => void recipe(draft, event, meta)
    );
    return newState;
  };
}

export { immerAssign as assign, produceAssign };

export interface ImmerUpdateEvent<
  TType extends string = string,
  TInput = unknown
> {
  type: TType;
  input: TInput;
}

export interface ImmerUpdater<TContext, TEvent extends ImmerUpdateEvent> {
  update: (input: TEvent['input']) => TEvent;
  action: AssignAction<TContext, TEvent>;
  type: TEvent['type'];
}

export function createUpdater<TContext, TEvent extends ImmerUpdateEvent>(
  type: TEvent['type'],
  recipe: ImmerAssigner<TContext, TEvent>
): ImmerUpdater<TContext, TEvent> {
  const update = (input: TEvent['input']): TEvent => {
    return {
      type,
      input
    } as TEvent;
  };

  return {
    update,
    action: immerAssign<TContext, TEvent>((ctx, event, meta) => {
      recipe(ctx, event, meta);
    }),
    type
  };
}
