import {
  ActionMeta,
  ActionObject,
  EventObject,
  MachineContext,
  State,
  StateConfig
} from 'xstate';

export type Sender<TEvent extends EventObject> = (event: TEvent) => void;

export interface Subscription {
  unsubscribe(): void;
}

export interface Observer<T> {
  // Sends the next value in the sequence
  next?: (value: T) => void;

  // Sends the sequence error
  error?: (errorValue: any) => void;

  // Sends the completion notification
  complete: () => void;
}

export interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription;
  subscribe(
    next: (value: T) => void,
    error?: (error: any) => void,
    complete?: () => void
  ): Subscription;
}

export type MaybeLazy<T> = T | (() => T);

// TODO: remove these types (up to PayloadSender) when
// @xstate/react depends on xstate v5.0 (use PayloadSender from core instead)
type ExcludeType<A> = { [K in Exclude<keyof A, 'type'>]: A[K] };

type ExtractExtraParameters<A, T> = A extends { type: T }
  ? ExcludeType<A>
  : never;

type ExtractSimple<A> = A extends any
  ? {} extends ExcludeType<A>
    ? A
    : never
  : never;

type NeverIfEmpty<T> = {} extends T ? never : T;

export interface PayloadSender<TEvent extends EventObject> {
  /**
   * Send an event object or just the event type, if the event has no other payload
   */
  (event: TEvent | ExtractSimple<TEvent>['type']): void;
  /**
   * Send an event type and its payload
   */
  <K extends TEvent['type']>(
    eventType: K,
    payload: NeverIfEmpty<ExtractExtraParameters<TEvent, K>>
  ): void;
}

// TODO: use ActorRef from XState core instead.
// Kept here because of breaking change/versioning concern:
// https://github.com/davidkpiano/xstate/pull/1622#discussion_r528309213
export interface ActorRef<TEvent extends EventObject, TEmitted = any>
  extends Subscribable<TEmitted> {
  send: Sender<TEvent>;
}

export enum ReactEffectType {
  Effect = 1,
  LayoutEffect = 2
}

export interface ReactActionFunction<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  (
    context: TContext,
    event: TEvent,
    meta: ActionMeta<TContext, TEvent>
  ): () => void;
  __effect: ReactEffectType;
}

export interface ReactActionObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  exec: ReactActionFunction<TContext, TEvent>;
}

export interface UseMachineOptions<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  /**
   * If provided, will be merged with machine's `context`.
   */
  context?: Partial<TContext>;
  /**
   * The state to rehydrate the machine to. The machine will
   * start at this state instead of its `initialState`.
   */
  state?: StateConfig<TContext, TEvent>;
}

export type ActionStateTuple<
  TContext extends MachineContext,
  TEvent extends EventObject
> = [ReactActionObject<TContext, TEvent>, State<TContext, TEvent>];
