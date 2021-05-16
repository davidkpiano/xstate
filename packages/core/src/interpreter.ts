import {
  Event,
  EventObject,
  CancelActionObject,
  DefaultContext,
  ActionObject,
  SpecialTargets,
  ActionTypes,
  SendActionObject,
  StateValue,
  InterpreterOptions,
  DoneEvent,
  Subscription,
  MachineImplementations,
  ActionFunctionMap,
  SCXML,
  Observer,
  Typestate,
  InvokeActionObject,
  AnyEventObject,
  ActorRef,
  SCXMLErrorEvent
} from './types';
import { State, bindActionToState, isState } from './State';
import * as actionTypes from './actionTypes';
import { doneInvoke, error, getActionFunction, initEvent } from './actions';
import { IS_PRODUCTION } from './environment';
import {
  mapContext,
  warn,
  keys,
  isArray,
  isFunction,
  toSCXMLEvent,
  symbolObservable,
  isSCXMLErrorEvent,
  toEventObject
} from './utils';
import { Scheduler } from './scheduler';
import { isActorRef, fromService } from './Actor';
import { isInFinalState } from './stateUtils';
import { registry } from './registry';
import { MachineNode } from './MachineNode';
import { devToolsAdapter } from './dev';
import { CapturedState } from './capturedState';
import { PayloadSender, SpawnedActorRef, StopActionObject } from '.';

export type StateListener<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
> = (state: State<TContext, TEvent, TTypestate>, event: TEvent) => void;

export type EventListener<TEvent extends EventObject = EventObject> = (
  event: TEvent
) => void;

export type Listener = () => void;
export type ErrorListener = (error: any) => void;

export interface Clock {
  setTimeout(fn: (...args: any[]) => void, timeout: number): any;
  clearTimeout(id: any): void;
}

export enum InterpreterStatus {
  NotStarted,
  Running,
  Stopped
}

const defaultOptions: InterpreterOptions = ((global) => ({
  deferEvents: true,
  clock: {
    setTimeout: (fn, ms) => {
      return setTimeout(fn, ms);
    },
    clearTimeout: (id) => {
      return clearTimeout(id);
    }
  },
  logger: global.console.log.bind(console),
  devTools: false
}))(typeof window === 'undefined' ? global : window);

export class Interpreter<
  TContext,
  TEvent extends EventObject = EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
> {
  /**
   * The current state of the interpreted machine.
   */
  private _state?: State<TContext, TEvent, TTypestate>;
  private _initialState?: State<TContext, TEvent, TTypestate>;
  /**
   * The clock that is responsible for setting and clearing timeouts, such as delayed events and transitions.
   */
  public clock: Clock;
  public options: Readonly<InterpreterOptions>;

  private scheduler: Scheduler = new Scheduler();
  private delayedEventsMap: Record<string, number> = {};
  private listeners: Set<
    StateListener<TContext, TEvent, TTypestate>
  > = new Set();
  private stopListeners: Set<Listener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private doneListeners: Set<EventListener> = new Set();
  private logger: (...args: any[]) => void;
  /**
   * Whether the service is started.
   */
  public status: InterpreterStatus = InterpreterStatus.NotStarted;

  // Actor Ref
  public parent?: ActorRef<any>;
  public id: string;
  public ref: SpawnedActorRef<TEvent>;

  /**
   * The globally unique process ID for this invocation.
   */
  public sessionId: string;
  public children: Map<string | number, SpawnedActorRef<any>> = new Map();
  private forwardTo: Set<string> = new Set();

  /**
   * Creates a new Interpreter instance (i.e., service) for the given machine with the provided options, if any.
   *
   * @param machine The machine to be interpreted
   * @param options Interpreter options
   */
  constructor(
    public machine: MachineNode<TContext, TEvent, TTypestate>,
    options?: Partial<InterpreterOptions>
  ) {
    const resolvedOptions: InterpreterOptions = {
      ...defaultOptions,
      ...options
    };

    const { clock, logger, parent, id } = resolvedOptions;

    const resolvedId = id !== undefined ? id : machine.id;

    this.id = resolvedId;
    this.logger = logger;
    this.clock = clock;
    this.parent = parent;

    this.options = resolvedOptions;

    this.scheduler = new Scheduler({
      deferEvents: this.options.deferEvents
    });

    this.ref = fromService(this, resolvedId);

    this.sessionId = this.ref.name;
  }

  public get initialized() {
    return this.status === InterpreterStatus.Running;
  }

  public get initialState(): State<TContext, TEvent, TTypestate> {
    try {
      CapturedState.current = {
        actorRef: this.ref,
        spawns: []
      };
      return (
        this._initialState ||
        ((this._initialState = this.machine.getInitialState()),
        this._initialState)
      );
    } finally {
      CapturedState.current = {
        actorRef: undefined,
        spawns: []
      };
    }
  }

  public get state(): State<TContext, TEvent, TTypestate> {
    return this._state!;
  }

  /**
   * Executes the actions of the given state, with that state's `context` and `event`.
   *
   * @param state The state whose actions will be executed
   * @param actionsConfig The action implementations to use
   */
  public execute(
    state: State<TContext, TEvent, TTypestate>,
    actionsConfig?: MachineImplementations<TContext, TEvent>['actions']
  ): void {
    for (const action of state.actions) {
      this.exec(action, state, actionsConfig);
    }
  }

  private update(
    state: State<TContext, TEvent, TTypestate>,
    _event: SCXML.Event<TEvent>
  ): void {
    // Attach session ID to state
    state._sessionid = this.sessionId;

    // Update state
    this._state = state;

    // Execute actions
    this.execute(this.state);

    for (const listener of this.listeners) {
      listener(state, state.event);
    }

    const isDone = isInFinalState(state.configuration || [], this.machine);

    if (this.state.configuration && isDone) {
      // get final child state node
      const finalChildStateNode = state.configuration.find(
        (stateNode) =>
          stateNode.type === 'final' && stateNode.parent === this.machine
      );

      const doneData =
        finalChildStateNode && finalChildStateNode.doneData
          ? mapContext(finalChildStateNode.doneData, state.context, _event)
          : undefined;

      for (const listener of this.doneListeners) {
        listener(
          toSCXMLEvent(doneInvoke(this.id, doneData), { invokeid: this.id })
        );
      }
      this.stop();
    }
  }
  /*
   * Adds a listener that is notified whenever a state transition happens. The listener is called with
   * the next state and the event object that caused the state transition.
   *
   * @param listener The state listener
   */
  public onTransition(
    listener: StateListener<TContext, TEvent, TTypestate>
  ): this {
    this.listeners.add(listener);

    // Send current state to listener
    if (this.status === InterpreterStatus.Running) {
      listener(this.state, this.state.event);
    }

    return this;
  }

  public subscribe(
    observer: Observer<State<TContext, TEvent, TTypestate>>
  ): Subscription;
  public subscribe(
    nextListener?: (state: State<TContext, TEvent, TTypestate>) => void,
    errorListener?: (error: any) => void,
    completeListener?: () => void
  ): Subscription;
  public subscribe(
    nextListenerOrObserver?:
      | ((state: State<TContext, TEvent, TTypestate>) => void)
      | Observer<State<TContext, TEvent, TTypestate>>,
    errorListener?: (error: Error) => void,
    completeListener?: () => void
  ): Subscription {
    if (!nextListenerOrObserver) {
      return { unsubscribe: () => void 0 };
    }

    let listener: (state: State<TContext, TEvent, TTypestate>) => void;
    let resolvedCompleteListener = completeListener;

    if (typeof nextListenerOrObserver === 'function') {
      listener = nextListenerOrObserver;
    } else {
      listener = nextListenerOrObserver.next?.bind(nextListenerOrObserver);
      resolvedCompleteListener = nextListenerOrObserver.complete?.bind(
        nextListenerOrObserver
      );
    }

    if (listener) {
      this.listeners.add(listener);
    }

    if (errorListener) {
      this.onError(errorListener);
    }

    // Send current state to listener
    if (this.status === InterpreterStatus.Running) {
      listener(this.state);
    }

    if (resolvedCompleteListener) {
      this.onDone(resolvedCompleteListener);
    }

    return {
      unsubscribe: () => {
        listener && this.off(listener);
        resolvedCompleteListener && this.off(resolvedCompleteListener);
        errorListener && this.off(errorListener);
      }
    };
  }

  /**
   * Adds a listener that is notified when the machine is stopped.
   *
   * @param listener The listener
   */
  public onStop(listener: Listener): Interpreter<TContext, TEvent, TTypestate> {
    this.stopListeners.add(listener);
    return this;
  }

  /**
   * Adds an error listener that is notified with an `Error` whenever an
   * error occurs during execution.
   *
   * @param listener The error listener
   */
  public onError(listener: ErrorListener): Interpreter<TContext, TEvent> {
    this.errorListeners.add(listener);
    return this;
  }

  private handleErrorEvent(errorEvent: SCXMLErrorEvent): void {
    if (this.errorListeners.size > 0) {
      this.errorListeners.forEach((listener) => {
        listener(errorEvent.data.data);
      });
    } else {
      this.stop();
      throw errorEvent.data.data;
    }
  }

  /**
   * Adds a state listener that is notified when the statechart has reached its final state.
   * @param listener The state listener
   */
  public onDone(
    listener: EventListener<DoneEvent>
  ): Interpreter<TContext, TEvent, TTypestate> {
    this.doneListeners.add(listener);
    return this;
  }

  /**
   * Removes a listener.
   * @param listener The listener to remove
   */
  public off(
    listener: (...args: any[]) => void
  ): Interpreter<TContext, TEvent, TTypestate> {
    this.listeners.delete(listener);
    this.stopListeners.delete(listener);
    this.doneListeners.delete(listener);
    this.errorListeners.delete(listener);
    return this;
  }

  /**
   * Starts the interpreter from the given state, or the initial state.
   * @param initialState The state to start the statechart from
   */
  public start(
    initialState?: State<TContext, TEvent, TTypestate> | StateValue
  ): Interpreter<TContext, TEvent, TTypestate> {
    if (this.status === InterpreterStatus.Running) {
      // Do not restart the service if it is already started
      return this;
    }

    registry.register(this.sessionId, this.ref);
    this.status = InterpreterStatus.Running;

    const resolvedState =
      initialState === undefined
        ? this.initialState
        : isState<TContext, TEvent, TTypestate>(initialState)
        ? this.machine.resolveState(initialState)
        : this.machine.resolveState(
            State.from(initialState, this.machine.context)
          );

    this.scheduler.initialize(() => {
      this.update(resolvedState, initEvent as SCXML.Event<TEvent>);

      if (this.options.devTools) {
        this.attachDevTools();
      }
    });
    return this;
  }

  /**
   * Stops the interpreter and unsubscribe all listeners.
   *
   * This will also notify the `onStop` listeners.
   */
  public stop(): Interpreter<TContext, TEvent, TTypestate> {
    this.listeners.clear();
    for (const listener of this.stopListeners) {
      // call listener, then remove
      listener();
    }
    this.stopListeners.clear();
    this.doneListeners.clear();

    if (!this.initialized) {
      // Interpreter already stopped; do nothing
      return this;
    }

    this.state.configuration.forEach((stateNode) => {
      for (const action of stateNode.definition.exit) {
        this.exec(action, this.state);
      }
    });

    // Stop all children
    this.children.forEach((child) => {
      if (isFunction(child.stop)) {
        child.stop();
      }
    });

    // Cancel all delayed events
    for (const key of keys(this.delayedEventsMap)) {
      this.clock.clearTimeout(this.delayedEventsMap[key]);
    }

    this.scheduler.clear();
    this.status = InterpreterStatus.Stopped;
    registry.free(this.sessionId);

    return this;
  }

  private _transition(
    state: State<TContext, TEvent>,
    event: SCXML.Event<TEvent>
  ) {
    try {
      CapturedState.current = {
        actorRef: this.ref,
        spawns: []
      };
      return this.machine.transition(state, event);
    } finally {
      CapturedState.current = {
        actorRef: undefined,
        spawns: []
      };
    }
  }

  /**
   * Sends an event to the running interpreter to trigger a transition.
   *
   * An array of events (batched) can be sent as well, which will send all
   * batched events to the running interpreter. The listeners will be
   * notified only **once** when all events are processed.
   *
   * @param event The event(s) to send
   */
  public send: PayloadSender<TEvent> = (event, payload?): void => {
    if (isArray(event)) {
      this.batch(event);
      return;
    }

    const eventObject = toEventObject(event, payload);
    const _event = toSCXMLEvent(eventObject);

    if (this.status === InterpreterStatus.Stopped) {
      // do nothing
      if (!IS_PRODUCTION) {
        warn(
          false,
          `Event "${_event.name}" was sent to stopped service "${
            this.machine.id
          }". This service has already reached its final state, and will not transition.\nEvent: ${JSON.stringify(
            _event.data
          )}`
        );
      }
      return;
    }

    if (
      this.status !== InterpreterStatus.Running &&
      !this.options.deferEvents
    ) {
      throw new Error(
        `Event "${_event.name}" was sent to uninitialized service "${
          this.machine.id
          // tslint:disable-next-line:max-line-length
        }". Make sure .start() is called for this service, or set { deferEvents: true } in the service options.\nEvent: ${JSON.stringify(
          _event.data
        )}`
      );
    }

    this.scheduler.schedule(() => {
      // Forward copy of event to child actors
      this.forward(_event);

      const nextState = this.nextState(_event);

      this.update(nextState, _event);
    });
  };

  public batch(events: Array<TEvent | TEvent['type']>): void {
    if (
      this.status === InterpreterStatus.NotStarted &&
      this.options.deferEvents
    ) {
      // tslint:disable-next-line:no-console
      if (!IS_PRODUCTION) {
        warn(
          false,
          `${events.length} event(s) were sent to uninitialized service "${
            this.machine.id
          }" and are deferred. Make sure .start()  is called for this service.\nEvents: ${JSON.stringify(
            events
          )}`
        );
      }
    } else if (this.status !== InterpreterStatus.Running) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `${events.length} event(s) were sent to uninitialized service "${this.machine.id}". Make sure .start() is called for this service, or set { deferEvents: true } in the service options.`
      );
    }

    this.scheduler.schedule(() => {
      let nextState = this.state;
      let batchChanged = false;
      const batchedActions: Array<ActionObject<TContext, TEvent>> = [];
      for (const event of events) {
        const _event = toSCXMLEvent(event);

        this.forward(_event);

        nextState = this._transition(nextState, _event);

        batchedActions.push(
          ...(nextState.actions.map((a) =>
            bindActionToState(a, nextState)
          ) as Array<ActionObject<TContext, TEvent>>)
        );

        batchChanged = batchChanged || !!nextState.changed;
      }

      nextState.changed = batchChanged;
      nextState.actions = batchedActions;
      this.update(nextState, toSCXMLEvent(events[events.length - 1]));
    });
  }

  private sendTo(
    event: SCXML.Event<AnyEventObject>,
    to: string | ActorRef<any>
  ) {
    const isParent = this.parent && to === SpecialTargets.Parent;
    const target = isParent
      ? this.parent
      : isActorRef(to)
      ? to
      : this.children.get(to);

    if (!target) {
      if (!isParent) {
        const executionError = new Error(
          `Unable to send event to child '${to}' from service '${this.id}'.`
        );
        this.send(
          toSCXMLEvent<TEvent>(actionTypes.errorExecution, {
            data: executionError as any // TODO: refine
          })
        );
      }

      // tslint:disable-next-line:no-console
      if (!IS_PRODUCTION) {
        warn(
          false,
          `Service '${this.id}' has no parent: unable to send event ${event.type}`
        );
      }
      return;
    }

    target.send({
      ...event,
      name: event.name === actionTypes.error ? `${error(this.id)}` : event.name,
      origin: this
    });
  }
  /**
   * Returns the next state given the interpreter's current state and the event.
   *
   * This is a pure method that does _not_ update the interpreter's state.
   *
   * @param event The event to determine the next state
   */
  public nextState(
    event: Event<TEvent> | SCXML.Event<TEvent>
  ): State<TContext, TEvent, TTypestate> {
    const _event = toSCXMLEvent(event);

    if (
      isSCXMLErrorEvent(_event) &&
      !this.state.nextEvents.some((nextEvent) => nextEvent === _event.name)
    ) {
      this.handleErrorEvent(_event);
    }

    return this._transition(this.state, _event);
  }
  private forward(event: SCXML.Event<TEvent>): void {
    for (const id of this.forwardTo) {
      const child = this.children.get(id);

      if (!child) {
        throw new Error(
          `Unable to forward event '${event.name}' from interpreter '${this.id}' to nonexistant child '${id}'.`
        );
      }

      child.send(event);
    }
  }
  private defer(sendAction: SendActionObject<TContext, TEvent>): void {
    this.delayedEventsMap[sendAction.id!] = this.clock.setTimeout(() => {
      if (sendAction.to) {
        this.sendTo(sendAction._event, sendAction.to);
      } else {
        this.send(
          (sendAction as SendActionObject<TContext, TEvent, TEvent>)._event
        );
      }
    }, sendAction.delay as number);
  }
  private cancel(sendId: string | number): void {
    this.clock.clearTimeout(this.delayedEventsMap[sendId]);
    delete this.delayedEventsMap[sendId];
  }
  private exec(
    action: InvokeActionObject | ActionObject<TContext, TEvent>,
    state: State<TContext, TEvent, TTypestate>,
    actionFunctionMap: ActionFunctionMap<TContext, TEvent> = this.machine
      .options.actions
  ): void {
    const { context, _event } = state;
    const actionOrExec =
      action.exec || getActionFunction(action.type, actionFunctionMap);
    const exec = isFunction(actionOrExec)
      ? actionOrExec
      : actionOrExec
      ? actionOrExec.exec
      : action.exec;

    if (exec) {
      try {
        return exec(context, _event.data, {
          action,
          state: this.state,
          _event
        });
      } catch (err) {
        if (this.parent) {
          this.parent.send({
            type: 'xstate.error',
            data: err
          } as EventObject);
        }

        throw err;
      }
    }

    switch (action.type) {
      case actionTypes.send:
        const sendAction = action as SendActionObject<TContext, TEvent>;

        if (typeof sendAction.delay === 'number') {
          this.defer(sendAction);
          return;
        } else {
          if (sendAction.to) {
            this.sendTo(sendAction._event, sendAction.to);
          } else {
            this.send(
              (sendAction as SendActionObject<TContext, TEvent, TEvent>)._event
            );
          }
        }
        break;

      case actionTypes.cancel:
        this.cancel((action as CancelActionObject<TContext, TEvent>).sendId);

        break;

      case ActionTypes.Invoke: {
        const { id, autoForward, ref } = action as InvokeActionObject;
        if (!ref) {
          break;
        }
        // If the actor will be stopped right after it's started
        // (such as in transient states) don't bother starting the actor.
        if (
          state.actions.find((otherAction) => {
            return (
              otherAction.type === actionTypes.stop && otherAction.actor === id
            );
          })
        ) {
          return;
        }
        try {
          if (autoForward) {
            this.forwardTo.add(id);
          }

          this.children.set(id, ref);
          this.state.children[id] = ref;

          ref.subscribe({
            error: () => {
              // TODO: handle error
              this.stop();
            },
            complete: () => {
              /* ... */
            }
          });

          ref.start?.();
        } catch (err) {
          this.send(error(id, err));
          break;
        }

        break;
      }
      case actionTypes.stop: {
        const { actor } = action as StopActionObject;
        const actorRef =
          typeof actor === 'string' ? this.children.get(actor) : actor;

        if (actorRef) {
          this.stopChild((actorRef as SpawnedActorRef<any>).name); // TODO: fix
        }
        break;
      }

      case actionTypes.log:
        const { label, value } = action;

        if (label) {
          this.logger(label, value);
        } else {
          this.logger(value);
        }
        break;
      case actionTypes.assign:
        break;
      default:
        if (!IS_PRODUCTION) {
          warn(
            false,
            `No implementation found for action type '${action.type}'`
          );
        }
        break;
    }

    return undefined;
  }

  private stopChild(childId: string): void {
    const child = this.children.get(childId);
    if (!child) {
      return;
    }

    this.children.delete(childId);
    this.forwardTo.delete(childId);
    delete this.state.children[childId];

    if (isFunction(child.stop)) {
      child.stop();
    }
  }

  private attachDevTools(): void {
    const { devTools } = this.options;
    if (devTools) {
      const resolvedDevToolsAdapter =
        typeof devTools === 'function' ? devTools : devToolsAdapter;

      resolvedDevToolsAdapter(this);
    }
  }

  public toJSON() {
    return {
      id: this.id
    };
  }

  public [symbolObservable]() {
    return this;
  }
}

/**
 * Creates a new Interpreter instance for the given machine with the provided options, if any.
 *
 * @param machine The machine to interpret
 * @param options Interpreter options
 */
export function interpret<
  TContext = DefaultContext,
  TEvent extends EventObject = EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  machine: MachineNode<TContext, TEvent, TTypestate>,
  options?: Partial<InterpreterOptions>
) {
  const interpreter = new Interpreter<TContext, TEvent, TTypestate>(
    machine,
    options
  );

  return interpreter;
}
