import { EventObject, SingleOrArray, ActionObject, DefaultContext } from '.';

export function each<
  TContext extends DefaultContext,
  TEvent extends EventObject
>(
  collection: keyof TContext,
  item: keyof TContext,
  actions: SingleOrArray<ActionObject<TContext, TEvent>>
): ActionObject<TContext, TEvent>;
export function each<TContext, TEvent extends EventObject>(
  collection: keyof TContext,
  item: keyof TContext,
  index: keyof TContext,
  actions: SingleOrArray<ActionObject<TContext, TEvent>>
): ActionObject<TContext, TEvent>;
export function each<TContext, TEvent extends EventObject>(
  collection: keyof TContext,
  item: keyof TContext,
  indexOrActions:
    | keyof TContext
    | SingleOrArray<ActionObject<TContext, TEvent>>,
  maybeActions?: SingleOrArray<ActionObject<TContext, TEvent>>
): ActionObject<TContext, TEvent> {
  const actions = maybeActions || indexOrActions;
  const index = maybeActions ? indexOrActions : undefined;

  return {
    type: 'xstate.foreach',
    collection,
    item,
    index,
    actions
  };
}
