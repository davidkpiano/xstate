import { useRef, useEffect } from 'react';
import { State, EventObject, Typestate } from 'xstate';

type Resolver = (value: undefined) => void;
type EmptyPromise = Promise<undefined>;
type SuspenseState<TResult> =
  | {
      promise: EmptyPromise;
      resolve: Resolver;
      status: 'loading';
      result: null;
    }
  | {
      promise: EmptyPromise;
      resolve: Resolver;
      status: 'resolved';
      result: TResult;
    };

export interface Resource<TResult> {
  read(): never | TResult;
}

export function useSuspensefulGetter<
  TContext,
  TEvent extends EventObject,
  TStateSchema,
  TTypeState extends Typestate<TContext>,
  TGetterReturn
>(
  state: State<TContext, TEvent, TStateSchema, TTypeState>,
  condition: (
    state: State<TContext, TEvent, TStateSchema, TTypeState>
  ) => boolean,
  getter: (
    state: State<TContext, TEvent, TStateSchema, TTypeState>
  ) => TGetterReturn
): Resource<TGetterReturn> {
  let resolveValue: Resolver;
  const promise: EmptyPromise = new Promise((resolve) => {
    resolveValue = resolve;
  });

  const ref = useRef<SuspenseState<TGetterReturn>>({
    promise,
    // @ts-ignore
    resolve: resolveValue,
    status: 'loading',
    result: null
  });

  useEffect(() => {
    if (ref.current.status === 'resolved') {
      ref.current.result = getter(state);
    }
  }, [ref.current.status, state, getter]);

  if (condition(state)) {
    ref.current.status = 'resolved';
    ref.current.result = getter(state);
    ref.current.resolve(undefined);
  }

  return {
    read(): never | TGetterReturn {
      switch (ref.current.status) {
        case 'resolved':
          return ref.current.result;
        case 'loading':
        default:
          throw ref.current.promise;
      }
    }
  };
}
