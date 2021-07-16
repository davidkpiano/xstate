import { StateNode } from './StateNode';
import { State } from './State';
import { Clock, Interpreter } from './interpreter';
import { StateMachine } from './StateMachine';
import { LifecycleSignal } from './behaviors';
import { MachineNode } from '.';
import { Model } from './model.types';

export type EventType = string;
export type ActionType = string;
export type MetaObject = Record<string, any>;

/**
 * The full definition of an event, with a string `type`.
 */
export interface EventObject {
  /**
   * The type of event that is sent.
   */
  type: string;
}

export interface AnyEventObject extends EventObject {
  [key: string]: any;
}

/**
 * The full definition of an action, with a string `type` and an
 * `exec` implementation function.
 */
export interface ActionObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  /**
   * The type of action that is executed.
   */
  type: string;
  /**
   * The implementation for executing the action.
   */
  exec?: ActionFunction<TContext, TEvent>;
  [other: string]: any;
}

export type MachineContext = object;

/**
 * The specified string event types or the specified event objects.
 */
export type Event<TEvent extends EventObject> = TEvent['type'] | TEvent;

export interface ActionMeta<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends StateMeta<TContext, TEvent> {
  action: ActionObject<TContext, TEvent>;
  _event: SCXML.Event<TEvent>;
}

export type Spawner = <T extends Behavior<any, any>>(
  behavior: T,
  name?: string
) => T extends Behavior<infer TActorEvent, infer TActorEmitted>
  ? ActorRef<TActorEvent, TActorEmitted>
  : never;

export interface AssignMeta<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  state?: State<TContext, TEvent>;
  action: AssignAction<TContext, TEvent>;
  _event: SCXML.Event<TEvent>;
}

export type ActionFunction<
  TContext extends MachineContext,
  TEvent extends EventObject
> = (
  context: TContext,
  event: TEvent,
  meta: ActionMeta<TContext, TEvent>
) => void;

export interface ChooseConditon<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  guard?: GuardConfig<TContext, TEvent>;
  actions: Actions<TContext, TEvent>;
}

export type Action<
  TContext extends MachineContext,
  TEvent extends EventObject
> =
  | ActionType
  | ActionObject<TContext, TEvent>
  | ActionFunction<TContext, TEvent>;

export type Actions<
  TContext extends MachineContext,
  TEvent extends EventObject
> = SingleOrArray<Action<TContext, TEvent>>;

export type StateKey = string | State<any>;

export interface StateValueMap {
  [key: string]: StateValue;
}

/**
 * The string or object representing the state value relative to the parent state node.
 *
 * - For a child atomic state node, this is a string, e.g., `"pending"`.
 * - For complex state nodes, this is an object, e.g., `{ success: "someChildState" }`.
 */
export type StateValue = string | StateValueMap;

export type GuardPredicate<
  TContext extends MachineContext,
  TEvent extends EventObject
> = (
  context: TContext,
  event: TEvent,
  meta: GuardMeta<TContext, TEvent>
) => boolean;

export interface DefaultGuardObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  type: string;
  params?: { [key: string]: any };
  /**
   * Nested guards
   */
  children?: Array<GuardObject<TContext, TEvent>>;
  predicate?: GuardPredicate<TContext, TEvent>;
}

export type GuardEvaluator<
  TContext extends MachineContext,
  TEvent extends EventObject
> = (
  guard: GuardDefinition<TContext, TEvent>,
  context: TContext,
  _event: SCXML.Event<TEvent>,
  state: State<TContext, TEvent>
) => boolean;

export interface GuardMeta<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends StateMeta<TContext, TEvent> {
  guard: GuardDefinition<TContext, TEvent>;
  evaluate: GuardEvaluator<TContext, TEvent>;
}

export type GuardConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> = string | GuardPredicate<TContext, TEvent> | GuardObject<TContext, TEvent>;

export type GuardObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> = BooleanGuardObject<TContext, TEvent> | DefaultGuardObject<TContext, TEvent>;

export interface GuardDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  type: string;
  children?: Array<GuardDefinition<TContext, TEvent>>;
  predicate?: GuardPredicate<TContext, TEvent>;
  params: { [key: string]: any };
}

export interface BooleanGuardObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  type: 'xstate.boolean';
  children: Array<GuardConfig<TContext, TEvent>>;
  params: {
    op: 'and' | 'or' | 'not';
  };
  predicate: undefined;
}

export interface BooleanGuardDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends GuardDefinition<TContext, TEvent> {
  type: 'xstate.boolean';
  params: {
    op: 'and' | 'or' | 'not';
  };
}

export type TransitionTarget<
  TContext extends MachineContext,
  TEvent extends EventObject
> = SingleOrArray<string | StateNode<TContext, TEvent>>;

export type TransitionTargets<TContext extends MachineContext> = Array<
  string | StateNode<TContext, any>
>;

export interface TransitionConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  guard?: GuardConfig<TContext, TEvent>;
  actions?: Actions<TContext, TEvent>;
  internal?: boolean;
  target?: TransitionTarget<TContext, TEvent>;
  meta?: Record<string, any>;
}

export interface TargetTransitionConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends TransitionConfig<TContext, TEvent> {
  target: TransitionTarget<TContext, TEvent>; // TODO: just make this non-optional
}

export type ConditionalTransitionConfig<
  TContext extends MachineContext,
  TEvent extends EventObject = EventObject
> = Array<TransitionConfig<TContext, TEvent>>;

export interface InitialTransitionConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends TransitionConfig<TContext, TEvent> {
  guard?: never;
  target: TransitionTarget<TContext, TEvent>;
}

export type Transition<
  TContext extends MachineContext,
  TEvent extends EventObject = EventObject
> =
  | string
  | TransitionConfig<TContext, TEvent>
  | ConditionalTransitionConfig<TContext, TEvent>;

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
  (event: TEvent | SCXML.Event<TEvent> | ExtractSimple<TEvent>['type']): void;
  /**
   * Send an event type and its payload
   */
  <K extends TEvent['type']>(
    eventType: K,
    payload: NeverIfEmpty<ExtractExtraParameters<TEvent, K>>
  ): void;
}

export type Receiver<TEvent extends EventObject> = (
  listener: (event: TEvent) => void
) => void;

export type InvokeCallback<
  TEvent extends EventObject = AnyEventObject,
  TSentEvent extends EventObject = AnyEventObject
> = (
  callback: Sender<TSentEvent>,
  onReceive: Receiver<TEvent>
) => (() => void) | Promise<any> | void;

export type BehaviorCreator<
  TContext extends MachineContext,
  TEvent extends EventObject
> = (
  context: TContext,
  event: TEvent,
  meta: {
    id: string;
    data?: any;
    src: InvokeSourceDefinition;
    _event: SCXML.Event<TEvent>;
  }
) => Behavior<any, any>;

export interface InvokeMeta {
  data: any;
  src: InvokeSourceDefinition;
}

export interface InvokeDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  id: string;
  /**
   * The source of the actor's behavior to be invoked
   */
  src: InvokeSourceDefinition;
  /**
   * If `true`, events sent to the parent service will be forwarded to the invoked service.
   *
   * Default: `false`
   */
  autoForward?: boolean;
  /**
   * Data from the parent machine's context to set as the (partial or full) context
   * for the invoked child machine.
   *
   * Data should be mapped to match the child machine's context shape.
   */
  data?: Mapper<TContext, TEvent, any> | PropertyMapper<TContext, TEvent, any>;
  /**
   * The transition to take upon the invoked child machine reaching its final top-level state.
   */
  onDone?:
    | string
    | SingleOrArray<TransitionConfig<TContext, DoneInvokeEvent<any>>>;
  /**
   * The transition to take upon the invoked child machine sending an error event.
   */
  onError?:
    | string
    | SingleOrArray<TransitionConfig<TContext, DoneInvokeEvent<any>>>;

  toJSON: () => Omit<
    InvokeDefinition<TContext, TEvent>,
    'onDone' | 'onError' | 'toJSON'
  >;
}

export interface Delay {
  id: string;
  /**
   * The time to delay the event, in milliseconds.
   */
  delay: number;
}

export type DelayedTransitions<
  TContext extends MachineContext,
  TEvent extends EventObject
> =
  | Record<
      string | number,
      string | SingleOrArray<TransitionConfig<TContext, TEvent>>
    >
  | Array<
      TransitionConfig<TContext, TEvent> & {
        delay: number | string | Expr<TContext, TEvent, number>;
      }
    >;

export type StateTypes =
  | 'atomic'
  | 'compound'
  | 'parallel'
  | 'final'
  | 'history'
  | string; // TODO: remove once TS fixes this type-widening issue

export type SingleOrArray<T> = T[] | T;

export type StateNodesConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> = {
  [K in string]: StateNode<TContext, TEvent>;
};

export type StatesConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> = {
  [K in string]: StateNodeConfig<TContext, TEvent>;
};

export type StatesDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> = {
  [K in string]: StateNodeDefinition<TContext, TEvent>;
};

export type TransitionConfigTarget<
  TContext extends MachineContext,
  TEvent extends EventObject
> = string | undefined | StateNode<TContext, TEvent>;

export type TransitionConfigOrTarget<
  TContext extends MachineContext,
  TEvent extends EventObject
> = SingleOrArray<
  TransitionConfigTarget<TContext, TEvent> | TransitionConfig<TContext, TEvent>
>;

export type TransitionsConfigMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> = {
  [K in TEvent['type']]?: TransitionConfigOrTarget<
    TContext,
    TEvent extends { type: K } ? TEvent : never
  >;
} & {
  ''?: TransitionConfigOrTarget<TContext, TEvent>;
} & {
  '*'?: TransitionConfigOrTarget<TContext, TEvent>;
};

type TransitionsConfigArray<
  TContext extends MachineContext,
  TEvent extends EventObject
> = Array<
  // distribute the union
  | (TEvent extends EventObject
      ? TransitionConfig<TContext, TEvent> & { event: TEvent['type'] }
      : never)
  | (TransitionConfig<TContext, TEvent> & { event: '' })
  | (TransitionConfig<TContext, TEvent> & { event: '*' })
>;

export type TransitionsConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> =
  | TransitionsConfigMap<TContext, TEvent>
  | TransitionsConfigArray<TContext, TEvent>;

export interface InvokeSourceDefinition {
  [key: string]: any;
  type: string;
}

export interface InvokeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  /**
   * The unique identifier for the invoked machine. If not specified, this
   * will be the machine's own `id`, or the URL (from `src`).
   */
  id?: string;
  /**
   * The source of the machine to be invoked, or the machine itself.
   */
  src: string | InvokeSourceDefinition | BehaviorCreator<TContext, TEvent>;
  /**
   * If `true`, events sent to the parent service will be forwarded to the invoked service.
   *
   * Default: `false`
   */
  autoForward?: boolean;
  /**
   * Data from the parent machine's context to set as the (partial or full) context
   * for the invoked child machine.
   *
   * Data should be mapped to match the child machine's context shape.
   */
  data?: Mapper<TContext, TEvent, any> | PropertyMapper<TContext, TEvent, any>;
  /**
   * The transition to take upon the invoked child machine reaching its final top-level state.
   */
  onDone?:
    | string
    | SingleOrArray<TransitionConfig<TContext, DoneInvokeEvent<any>>>;
  /**
   * The transition to take upon the invoked child machine sending an error event.
   */
  onError?:
    | string
    | SingleOrArray<TransitionConfig<TContext, DoneInvokeEvent<any>>>;
}

export interface StateNodeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  /**
   * The relative key of the state node, which represents its location in the overall state value.
   * This is automatically determined by the configuration shape via the key where it was defined.
   */
  key?: string;
  /**
   * The initial state transition.
   */
  initial?:
    | InitialTransitionConfig<TContext, TEvent>
    | SingleOrArray<string>
    | undefined;
  /**
   * The type of this state node:
   *
   *  - `'atomic'` - no child state nodes
   *  - `'compound'` - nested child state nodes (XOR)
   *  - `'parallel'` - orthogonal nested child state nodes (AND)
   *  - `'history'` - history state node
   *  - `'final'` - final state node
   */
  type?: 'atomic' | 'compound' | 'parallel' | 'final' | 'history';
  /**
   * The initial context (extended state) of the machine.
   *
   * Can be an object or a function that returns an object.
   */
  context?: TContext | (() => TContext);
  /**
   * Indicates whether the state node is a history state node, and what
   * type of history:
   * shallow, deep, true (shallow), false (none), undefined (none)
   */
  history?: 'shallow' | 'deep' | boolean | undefined;
  /**
   * The mapping of state node keys to their state node configurations (recursive).
   */
  states?: StatesConfig<TContext, TEvent> | undefined;
  /**
   * The services to invoke upon entering this state node. These services will be stopped upon exiting this state node.
   */
  invoke?: SingleOrArray<
    string | BehaviorCreator<TContext, TEvent> | InvokeConfig<TContext, TEvent>
  >;
  /**
   * The mapping of event types to their potential transition(s).
   */
  on?: TransitionsConfig<TContext, TEvent>;
  /**
   * The action(s) to be executed upon entering the state node.
   */
  entry?: Actions<TContext, TEvent>;
  /**
   * The action(s) to be executed upon exiting the state node.
   */
  exit?: Actions<TContext, TEvent>;
  /**
   * The potential transition(s) to be taken upon reaching a final child state node.
   *
   * This is equivalent to defining a `[done(id)]` transition on this state node's `on` property.
   */
  onDone?: string | SingleOrArray<TransitionConfig<TContext, DoneEventObject>>;
  /**
   * The mapping (or array) of delays (in milliseconds) to their potential transition(s).
   * The delayed transitions are taken after the specified delay in an interpreter.
   */
  after?: DelayedTransitions<TContext, TEvent>;

  /**
   * An eventless transition that is always taken when this state node is active.
   * Equivalent to a transition specified as an empty `''`' string in the `on` property.
   */
  always?: TransitionConfigOrTarget<TContext, TEvent>;
  /**
   * @private
   */
  parent?: StateNode<TContext, TEvent>;
  strict?: boolean | undefined;
  /**
   * The meta data associated with this state node, which will be returned in State instances.
   */
  meta?: any;
  /**
   * The data sent with the "done.state._id_" event if this is a final state node.
   *
   * The data will be evaluated with the current `context` and placed on the `.data` property
   * of the event.
   */
  data?: Mapper<TContext, TEvent, any> | PropertyMapper<TContext, TEvent, any>;
  /**
   * The unique ID of the state node, which can be referenced as a transition target via the
   * `#id` syntax.
   */
  id?: string | undefined;
  /**
   * The string delimiter for serializing the path to a string. The default is "."
   */
  delimiter?: string;
  /**
   * The order this state node appears. Corresponds to the implicit SCXML document order.
   */
  order?: number;

  /**
   * The tags for this state node, which are accumulated into the `state.tags` property.
   */
  tags?: SingleOrArray<string>;
  /**
   * Whether actions should be called in order.
   * When `false` (default), `assign(...)` actions are prioritized before other actions.
   *
   * @default false
   */
  preserveActionOrder?: boolean;
}

export interface StateNodeDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  id: string;
  version?: string | undefined;
  key: string;
  context: TContext;
  type: 'atomic' | 'compound' | 'parallel' | 'final' | 'history';
  initial: InitialTransitionDefinition<TContext, TEvent> | undefined;
  history: boolean | 'shallow' | 'deep' | undefined;
  states: StatesDefinition<TContext, TEvent>;
  on: TransitionDefinitionMap<TContext, TEvent>;
  transitions: Array<TransitionDefinition<TContext, TEvent>>;
  entry: Array<ActionObject<TContext, TEvent>>;
  exit: Array<ActionObject<TContext, TEvent>>;
  meta: any;
  order: number;
  data?: FinalStateNodeConfig<TContext, TEvent>['data'];
  invoke: Array<InvokeDefinition<TContext, TEvent>>;
}

export type AnyStateNodeDefinition = StateNodeDefinition<any, any>;

export interface AtomicStateNodeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends StateNodeConfig<TContext, TEvent> {
  initial?: undefined;
  parallel?: false | undefined;
  states?: undefined;
  onDone?: undefined;
}

export interface HistoryStateNodeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends AtomicStateNodeConfig<TContext, TEvent> {
  history: 'shallow' | 'deep' | true;
  target: string | undefined;
}

export interface FinalStateNodeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends AtomicStateNodeConfig<TContext, TEvent> {
  type: 'final';
  /**
   * The data to be sent with the "done.state.<id>" event. The data can be
   * static or dynamic (based on assigners).
   */
  data?: Mapper<TContext, TEvent, any> | PropertyMapper<TContext, TEvent, any>;
}

export type SimpleOrStateNodeConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> = AtomicStateNodeConfig<TContext, TEvent> | StateNodeConfig<TContext, TEvent>;

export type ActionFunctionMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> = Record<
  string,
  ActionObject<TContext, TEvent> | ActionFunction<TContext, TEvent>
>;

export type DelayFunctionMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> = Record<string, DelayConfig<TContext, TEvent>>;

export type DelayConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> = number | DelayExpr<TContext, TEvent>;

export type ActorMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> = Record<string, BehaviorCreator<TContext, TEvent>>;

export interface MachineImplementations<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  guards: Record<string, GuardPredicate<TContext, TEvent>>;
  actions: ActionFunctionMap<TContext, TEvent>;
  actors: ActorMap<TContext, TEvent>;
  delays: DelayFunctionMap<TContext, TEvent>;
  context: Partial<TContext>;
}

export interface MachineConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends StateNodeConfig<TContext, TEvent> {
  /**
   * The initial context (extended state)
   */
  context?: TContext | (() => TContext);
  /**
   * The machine's own version.
   */
  version?: string;
  /**
   * If `true`, will use SCXML semantics, such as event token matching.
   */
  scxml?: boolean;
  schema?: MachineSchema<TContext, TEvent>;
}

export interface MachineSchema<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  context?: TContext;
  events?: TEvent;
  actions?: { type: string; [key: string]: any };
  guards?: { type: string; [key: string]: any };
  services?: { type: string; [key: string]: any };
}

export interface HistoryStateNode<TContext extends MachineContext>
  extends StateNode<TContext> {
  history: 'shallow' | 'deep';
  target: string | undefined;
}

export type HistoryValue<
  TContext extends MachineContext,
  TEvent extends EventObject
> = Record<string, Array<StateNode<TContext, TEvent>>>;

export type StateFrom<
  TMachine extends StateMachine<any, any, any>
> = ReturnType<TMachine['transition']>;

export type Transitions<
  TContext extends MachineContext,
  TEvent extends EventObject
> = Array<TransitionDefinition<TContext, TEvent>>;

export enum ActionTypes {
  Stop = 'xstate.stop',
  Raise = 'xstate.raise',
  Send = 'xstate.send',
  Cancel = 'xstate.cancel',
  NullEvent = '',
  Assign = 'xstate.assign',
  After = 'xstate.after',
  DoneState = 'done.state',
  DoneInvoke = 'done.invoke',
  Log = 'xstate.log',
  Init = 'xstate.init',
  Invoke = 'xstate.invoke',
  ErrorExecution = 'error.execution',
  ErrorCommunication = 'error.communication',
  ErrorPlatform = 'error.platform',
  ErrorCustom = 'xstate.error',
  Update = 'xstate.update',
  Pure = 'xstate.pure',
  Choose = 'xstate.choose'
}

export interface RaiseAction<TEvent extends EventObject> {
  type: ActionTypes.Raise;
  event: TEvent['type'];
}

export interface RaiseActionObject<TEvent extends EventObject> {
  type: ActionTypes.Raise;
  _event: SCXML.Event<TEvent>;
}

export interface DoneInvokeEvent<TData> extends EventObject {
  data: TData;
}

export interface ErrorExecutionEvent extends EventObject {
  src: string;
  type: ActionTypes.ErrorExecution;
  data: any;
}

export interface ErrorPlatformEvent extends EventObject {
  data: any;
}

export interface SCXMLErrorEvent extends SCXML.Event<any> {
  name:
    | ActionTypes.ErrorExecution
    | ActionTypes.ErrorPlatform
    | ActionTypes.ErrorCommunication;
  data: any;
}

export interface DoneEventObject extends EventObject {
  data?: any;
  toString(): string;
}

export interface UpdateObject extends EventObject {
  id: string | number;
  state: State<any, any>;
}

export type DoneEvent = DoneEventObject & string;

export interface NullEvent {
  type: ActionTypes.NullEvent;
}

export interface InvokeAction {
  type: ActionTypes.Invoke;
  src: InvokeSourceDefinition | ActorRef<any>;
  id: string;
  autoForward?: boolean;
  data?: any;
  exec?: undefined;
}

export interface InvokeActionObject extends InvokeAction {
  ref?: ActorRef<any>;
}

export interface StopAction<TC extends MachineContext, TE extends EventObject> {
  type: ActionTypes.Stop;
  actor: string | ActorRef<any> | Expr<TC, TE, ActorRef<any>>;
}
export interface StopActionObject {
  type: ActionTypes.Stop;
  actor: string | ActorRef<any>;
}

export type DelayExpr<
  TContext extends MachineContext,
  TEvent extends EventObject
> = ExprWithMeta<TContext, TEvent, number>;

export type LogExpr<
  TContext extends MachineContext,
  TEvent extends EventObject
> = ExprWithMeta<TContext, TEvent, any>;

export interface LogAction<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  label: string | undefined;
  expr: string | LogExpr<TContext, TEvent>;
}

export interface LogActionObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends LogAction<TContext, TEvent> {
  value: any;
}

export interface SendAction<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  to:
    | string
    | ActorRef<any>
    | ExprWithMeta<TContext, TEvent, string | ActorRef<any> | undefined>
    | undefined;
  event: TSentEvent | SendExpr<TContext, TEvent, TSentEvent>;
  delay?: number | string | DelayExpr<TContext, TEvent>;
  id: string | number;
}

export interface SendActionObject<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject = AnyEventObject
> extends SendAction<TContext, TEvent, TSentEvent> {
  to: string | ActorRef<TSentEvent> | undefined;
  _event: SCXML.Event<TSentEvent>;
  event: TSentEvent;
  delay?: number;
  id: string | number;
}

export type Expr<
  TContext extends MachineContext,
  TEvent extends EventObject,
  T
> = (context: TContext, event: TEvent) => T;

export type ExprWithMeta<
  TContext extends MachineContext,
  TEvent extends EventObject,
  T
> = (context: TContext, event: TEvent, meta: SCXMLEventMeta<TEvent>) => T;

export type SendExpr<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TSentEvent extends EventObject = AnyEventObject
> = ExprWithMeta<TContext, TEvent, TSentEvent>;

export enum SpecialTargets {
  Parent = '#_parent',
  Internal = '#_internal'
}

export interface SendActionOptions<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  id?: string | number;
  delay?: number | string | DelayExpr<TContext, TEvent>;
  to?:
    | string
    | ExprWithMeta<TContext, TEvent, string | ActorRef<any> | undefined>
    | undefined;
}

export interface CancelAction<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  sendId: string | ExprWithMeta<TContext, TEvent, string>;
}

export interface CancelActionObject<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends CancelAction<TContext, TEvent> {
  sendId: string;
}

export type Assigner<
  TContext extends MachineContext,
  TEvent extends EventObject
> = (
  context: TContext,
  event: TEvent,
  meta: AssignMeta<TContext, TEvent>
) => Partial<TContext>;

export type PartialAssigner<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TKey extends keyof TContext
> = (
  context: TContext,
  event: TEvent,
  meta: AssignMeta<TContext, TEvent>
) => TContext[TKey];

export type PropertyAssigner<
  TContext extends MachineContext,
  TEvent extends EventObject
> = {
  [K in keyof TContext]?: PartialAssigner<TContext, TEvent, K> | TContext[K];
};

export type Mapper<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TParams extends {}
> = (context: TContext, event: TEvent) => TParams;

export type PropertyMapper<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TParams extends {}
> = {
  [K in keyof TParams]?:
    | ((context: TContext, event: TEvent) => TParams[K])
    | TParams[K];
};

export interface AnyAssignAction<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  type: ActionTypes.Assign;
  assignment: any;
}

export interface AssignAction<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  type: ActionTypes.Assign;
  assignment: Assigner<TContext, TEvent> | PropertyAssigner<TContext, TEvent>;
}

export interface PureAction<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  type: ActionTypes.Pure;
  get: (
    context: TContext,
    event: TEvent
  ) => SingleOrArray<ActionObject<TContext, TEvent>> | undefined;
}

export interface ChooseAction<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends ActionObject<TContext, TEvent> {
  type: ActionTypes.Choose;
  guards: Array<ChooseConditon<TContext, TEvent>>;
}

export interface TransitionDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends TransitionConfig<TContext, TEvent> {
  target: Array<StateNode<TContext, TEvent>> | undefined;
  source: StateNode<TContext, TEvent>;
  actions: Array<ActionObject<TContext, TEvent>>;
  guard?: GuardDefinition<TContext, TEvent>;
  eventType: TEvent['type'] | NullEvent['type'] | '*';
  toJSON: () => {
    target: string[] | undefined;
    source: string;
    actions: Array<ActionObject<TContext, TEvent>>;
    guard?: GuardDefinition<TContext, TEvent>;
    eventType: TEvent['type'] | NullEvent['type'] | '*';
    meta?: Record<string, any>;
  };
}

export interface InitialTransitionDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends TransitionDefinition<TContext, TEvent> {
  target: Array<StateNode<TContext, TEvent>>;
  guard?: never;
}

export type TransitionDefinitionMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> = {
  [K in TEvent['type'] | NullEvent['type'] | '*']: Array<
    TransitionDefinition<
      TContext,
      K extends TEvent['type'] ? Extract<TEvent, { type: K }> : EventObject
    >
  >;
};

export interface DelayedTransitionDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
> extends TransitionDefinition<TContext, TEvent> {
  delay: number | string | DelayExpr<TContext, TEvent>;
}

export interface Edge<
  TContext extends MachineContext,
  TEvent extends EventObject,
  TEventType extends TEvent['type'] = string
> {
  event: TEventType;
  source: StateNode<TContext, TEvent>;
  target: StateNode<TContext, TEvent>;
  cond?: GuardConfig<TContext, TEvent & { type: TEventType }>;
  actions: Array<Action<TContext, TEvent>>;
  meta?: MetaObject;
  transition: TransitionDefinition<TContext, TEvent>;
}
export interface NodesAndEdges<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  nodes: StateNode[];
  edges: Array<Edge<TContext, TEvent, TEvent['type']>>;
}

export interface Segment<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  /**
   * From state.
   */
  state: State<TContext, TEvent>;
  /**
   * Event from state.
   */
  event: TEvent;
}

export interface PathItem<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  state: State<TContext, TEvent>;
  path: Array<Segment<TContext, TEvent>>;
  weight?: number;
}

export interface PathMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  [key: string]: PathItem<TContext, TEvent>;
}

export interface PathsItem<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  state: State<TContext, TEvent>;
  paths: Array<Array<Segment<TContext, TEvent>>>;
}

export interface PathsMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  [key: string]: PathsItem<TContext, TEvent>;
}

export interface TransitionMap {
  state: StateValue | undefined;
}

export interface AdjacencyMap {
  [stateId: string]: Record<string, TransitionMap>;
}

export interface ValueAdjacencyMap<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  [stateId: string]: Record<string, State<TContext, TEvent>>;
}

export interface SCXMLEventMeta<TEvent extends EventObject> {
  _event: SCXML.Event<TEvent>;
}

export interface StateMeta<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  state: State<TContext, TEvent, any>;
  _event: SCXML.Event<TEvent>;
}

export interface Typestate<TContext extends MachineContext> {
  value: StateValue;
  context: TContext;
}

export interface StateLike<TContext extends MachineContext> {
  value: StateValue;
  context: TContext;
  event: EventObject;
  _event: SCXML.Event<EventObject>;
}

export interface StateConfig<
  TContext extends MachineContext,
  TEvent extends EventObject
> {
  value: StateValue;
  context: TContext;
  _event: SCXML.Event<TEvent>;
  _sessionid: string | null;
  history?: State<TContext, TEvent>;
  historyValue?: HistoryValue<TContext, TEvent>;
  actions?: Array<ActionObject<TContext, TEvent>>;
  meta?: any;
  configuration: Array<StateNode<TContext, TEvent>>;
  transitions: Array<TransitionDefinition<TContext, TEvent>>;
  children: Record<string, ActorRef<any>>;
  done?: boolean;
  tags?: Set<string>;
}

export interface InterpreterOptions {
  clock: Clock;
  logger: (...args: any[]) => void;
  parent?: ActorRef<any>;
  /**
   * If `true`, defers processing of sent events until the service
   * is initialized (`.start()`). Otherwise, an error will be thrown
   * for events sent to an uninitialized service.
   *
   * Default: `true`
   */
  deferEvents: boolean;
  /**
   * The custom `id` for referencing this service.
   */
  id?: string;
  /**
   * If `true`, states and events will be logged to Redux DevTools.
   *
   * Default: `false`
   */
  devTools: boolean | DevToolsAdapter; // TODO: add enhancer options
  /**
   * If `true`, events from the parent will be sent to this interpreter.
   *
   * Default: `false`
   */
  autoForward?: boolean;

  sync?: boolean;
  execute?: boolean;
}

export type AnyInterpreter = Interpreter<any, any, any>;

/**
 * Represents the `Interpreter` type of a given `MachineNode`.
 *
 * @typeParam TM - the machine to infer the interpreter's types from
 */
export type InterpreterOf<
  TM extends StateMachine<any, any, any>
> = TM extends StateMachine<infer TContext, infer TEvent, infer TTypestate>
  ? Interpreter<TContext, TEvent, TTypestate>
  : never;

export declare namespace SCXML {
  // tslint:disable-next-line:no-shadowed-variable
  export interface Event<TEvent extends EventObject> {
    /**
     * This is a character string giving the name of the event.
     * The SCXML Processor must set the name field to the name of this event.
     * It is what is matched against the 'event' attribute of <transition>.
     * Note that transitions can do additional tests by using the value of this field
     * inside boolean expressions in the 'cond' attribute.
     */
    name: string;
    /**
     * This field describes the event type.
     * The SCXML Processor must set it to: "platform" (for events raised by the platform itself, such as error events),
     * "internal" (for events raised by <raise> and <send> with target '_internal')
     * or "external" (for all other events).
     */
    type: 'platform' | 'internal' | 'external';
    /**
     * If the sending entity has specified a value for this, the Processor must set this field to that value
     * (see C Event I/O Processors for details).
     * Otherwise, in the case of error events triggered by a failed attempt to send an event,
     * the Processor must set this field to the send id of the triggering <send> element.
     * Otherwise it must leave it blank.
     */
    sendid?: string;
    /**
     * This is a URI, equivalent to the 'target' attribute on the <send> element.
     * For external events, the SCXML Processor should set this field to a value which,
     * when used as the value of 'target', will allow the receiver of the event to <send>
     * a response back to the originating entity via the Event I/O Processor specified in 'origintype'.
     * For internal and platform events, the Processor must leave this field blank.
     */
    origin?: ActorRef<any>;
    /**
     * This is equivalent to the 'type' field on the <send> element.
     * For external events, the SCXML Processor should set this field to a value which,
     * when used as the value of 'type', will allow the receiver of the event to <send>
     * a response back to the originating entity at the URI specified by 'origin'.
     * For internal and platform events, the Processor must leave this field blank.
     */
    origintype?: string;
    /**
     * If this event is generated from an invoked child process, the SCXML Processor
     * must set this field to the invoke id of the invocation that triggered the child process.
     * Otherwise it must leave it blank.
     */
    invokeid?: string;
    /**
     * This field contains whatever data the sending entity chose to include in this event.
     * The receiving SCXML Processor should reformat this data to match its data model,
     * but must not otherwise modify it.
     *
     * If the conversion is not possible, the Processor must leave the field blank
     * and must place an error 'error.execution' in the internal event queue.
     */
    data: TEvent;
    /**
     * @private
     */
    $$type: 'scxml';
  }
}

// TODO: should only take in behaviors
export type Spawnable =
  | StateMachine<any, any, any>
  | PromiseLike<any>
  | InvokeCallback
  | Subscribable<any>
  | Behavior<any, any>;

// Taken from RxJS
export type Observer<T> =
  | {
      next: (value: T) => void;
      error?: (err: any) => void;
      complete?: () => void;
    }
  | {
      next?: (value: T) => void;
      error: (err: any) => void;
      complete?: () => void;
    }
  | {
      next?: (value: T) => void;
      error?: (err: any) => void;
      complete: () => void;
    };

export interface Subscription {
  unsubscribe(): void;
}

export interface Subscribable<T> {
  subscribe(
    next: (value: T) => void,
    error?: (error: any) => void,
    complete?: () => void
  ): Subscription;
  subscribe(observer: Observer<T>): Subscription;
}

export type ExtractEvent<
  TEvent extends EventObject,
  TEventType extends TEvent['type']
> = TEvent extends { type: TEventType } ? TEvent : never;

export interface BaseActorRef<TEvent extends EventObject> {
  send: (event: TEvent) => void;
}

export interface ActorLike<TCurrent, TEvent extends EventObject>
  extends Subscribable<TCurrent> {
  send: Sender<TEvent>;
}

export type Sender<TEvent extends EventObject> = (event: TEvent) => void;

export interface ActorRef<TEvent extends EventObject, TEmitted = any>
  extends Subscribable<TEmitted> {
  name: string;
  send: (event: TEvent) => void;
  start?: () => void;
  getSnapshot: () => TEmitted | undefined;
  stop?: () => void;
  toJSON?: () => any;
}

export type ActorRefFrom<T extends Spawnable> = T extends StateMachine<
  infer TContext,
  infer TEvent,
  infer TTypestate
>
  ? ActorRef<TEvent, State<TContext, TEvent, TTypestate>>
  : T extends Promise<infer U>
  ? ActorRef<never, U>
  : T extends Behavior<infer TEvent1, infer TEmitted>
  ? ActorRef<TEvent1, TEmitted>
  : never;

export type DevToolsAdapter = (service: AnyInterpreter) => void;

export type Lazy<T> = () => T;

export type InterpreterFrom<
  T extends StateMachine<any, any, any>
> = T extends StateMachine<infer TContext, infer TEvent, infer TTypestate>
  ? Interpreter<TContext, TEvent, TTypestate>
  : never;

export type EventOfMachine<
  TMachine extends StateMachine<any, any>
> = TMachine extends StateMachine<any, infer E> ? E : never;

export interface ActorContext<TEvent extends EventObject, TEmitted> {
  parent?: ActorRef<any, any>;
  self: ActorRef<TEvent, TEmitted>;
  name: string;
  observers: Set<Observer<TEmitted>>;
  _event: SCXML.Event<TEvent>;
}

export interface Behavior<TEvent extends EventObject, TEmitted = any> {
  transition: (
    state: TEmitted,
    message: TEvent | LifecycleSignal,
    ctx: ActorContext<TEvent, TEmitted>
  ) => TEmitted;
  initialState: TEmitted;
  start?: (actorCtx: ActorContext<TEvent, TEmitted>) => TEmitted;
  subscribe?: (observer: Observer<TEmitted>) => Subscription | undefined;
}

export type EventFrom<T> = T extends MachineNode<any, infer TEvent, any>
  ? TEvent
  : T extends Model<any, infer TEvent, any>
  ? TEvent
  : T extends State<any, infer TEvent, any>
  ? TEvent
  : T extends Interpreter<any, infer TEvent, any>
  ? TEvent
  : never;

export type ContextFrom<T> = T extends StateMachine<infer TContext, any, any>
  ? TContext
  : T extends Model<infer TContext, any, any>
  ? TContext
  : T extends State<infer TContext, any, any>
  ? TContext
  : T extends Interpreter<infer TContext, any, any>
  ? TContext
  : never;
