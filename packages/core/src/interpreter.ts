import {
  StateMachine,
  Event,
  EventObject,
  CancelAction,
  DefaultContext,
  ActionObject,
  StateSchema,
  ActivityActionObject,
  SpecialTargets,
  ActionTypes,
  InvokeDefinition,
  SendActionObject,
  ServiceConfig,
  InvokeCallback,
  DisposeActivityFunction,
  StateValue,
  InterpreterOptions,
  ActivityDefinition,
  SingleOrArray,
  Subscribable,
  DoneEvent,
  MachineOptions,
  ActionFunctionMap,
  SCXML,
  EventData,
  Observer,
  Spawnable,
  Typestate,
  AnyEventObject,
  AnyInterpreter
} from './types';
import { State, bindActionToState, isState } from './State';
import * as actionTypes from './actionTypes';
import { doneInvoke, error, getActionFunction, initEvent } from './actions';
import { IS_PRODUCTION } from './environment';
import {
  isPromiseLike,
  mapContext,
  warn,
  keys,
  isArray,
  isFunction,
  isString,
  isObservable,
  uniqueId,
  isMachine,
  toEventObject,
  toSCXMLEvent,
  reportUnhandledExceptionOnInvocation,
  symbolObservable,
  toInvokeSource,
  toObserver,
  isActor
} from './utils';
import { Scheduler } from './scheduler';
import { Actor, isSpawnedActor, createDeferredActor } from './Actor';
import { isInFinalState } from './stateUtils';
import { registry } from './registry';
import { getGlobal, registerService } from './devTools';
import * as serviceScope from './serviceScope';
import {
  ActorRef,
  ActorRefFrom,
  SpawnedActorRef,
  StopActionObject,
  Subscription
} from '.';

export type StateListener<
  TContext,
  TEvent extends EventObject,
  TStateSchema extends StateSchema<TContext> = any,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
> = (
  state: State<TContext, TEvent, TStateSchema, TTypestate>,
  event: TEvent
) => void;

export type ContextListener<TContext = DefaultContext> = (
  context: TContext,
  prevContext: TContext | undefined
) => void;

export type EventListener<TEvent extends EventObject = EventObject> = (
  event: TEvent
) => void;

export type ErrorListener = (error: unknown) => void;

export type Listener = () => void;

export interface Clock {
  setTimeout(fn: (...args: any[]) => void, timeout: number): any;
  clearTimeout(id: any): void;
}

interface SpawnOptions {
  name?: string;
  autoForward?: boolean;
  sync?: boolean;
}

const DEFAULT_SPAWN_OPTIONS = { sync: false, autoForward: false };

export enum InterpreterStatus {
  NotStarted,
  Running,
  Stopped
}

export class Interpreter<
  // tslint:disable-next-line:max-classes-per-file
  TContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
> implements Actor<State<TContext, TEvent, TStateSchema, TTypestate>, TEvent> {
  /**
   * The default interpreter options:
   *
   * - `clock` uses the global `setTimeout` and `clearTimeout` functions
   * - `logger` uses the global `console.log()` method
   */
  public static defaultOptions: InterpreterOptions = ((global) => ({
    execute: true,
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
  }))(typeof self !== 'undefined' ? self : global);
  /**
   * The current state of the interpreted machine.
   */
  private _state?: State<TContext, TEvent, TStateSchema, TTypestate>;
  private _initialState?: State<TContext, TEvent, TStateSchema, TTypestate>;
  /**
   * The clock that is responsible for setting and clearing timeouts, such as delayed events and transitions.
   */
  public clock: Clock;
  public options: Readonly<InterpreterOptions>;

  private scheduler: Scheduler = new Scheduler();
  private delayedEventsMap: Record<string, number> = {};
  private listeners: Set<
    StateListener<TContext, TEvent, TStateSchema, TTypestate>
  > = new Set();
  private contextListeners: Set<ContextListener<TContext>> = new Set();
  private stopListeners: Set<Listener> = new Set();
  private doneListeners: Set<EventListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private sendListeners: Set<EventListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private logger: (...args: any[]) => void;
  /**
   * Whether the service is started.
   */
  public initialized = false;
  public status: InterpreterStatus = InterpreterStatus.NotStarted;

  // Actor
  public parent?: Interpreter<any>;
  public id: string;

  /**
   * The globally unique process ID for this invocation.
   */
  public sessionId: string;
  public children: Map<string | number, SpawnedActorRef<any>> = new Map();
  private forwardTo: Set<string> = new Set();

  // Dev Tools
  private devTools?: any;

  /**
   * Creates a new Interpreter instance (i.e., service) for the given machine with the provided options, if any.
   *
   * @param machine The machine to be interpreted
   * @param options Interpreter options
   */
  constructor(
    public machine: StateMachine<TContext, TStateSchema, TEvent, TTypestate>,
    options: Partial<InterpreterOptions> = Interpreter.defaultOptions
  ) {
    const resolvedOptions: InterpreterOptions = {
      ...Interpreter.defaultOptions,
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

    this.sessionId = registry.bookId();
  }
  public get initialState(): State<TContext, TEvent, TStateSchema, TTypestate> {
    if (this._initialState) {
      return this._initialState;
    }

    return serviceScope.provide(this, () => {
      this._initialState = this.machine.initialState;
      return this._initialState;
    });
  }
  public get state(): State<TContext, TEvent, TStateSchema, TTypestate> {
    if (!IS_PRODUCTION) {
      warn(
        this.status !== InterpreterStatus.NotStarted,
        `Attempted to read state from uninitialized service '${this.id}'. Make sure the service is started first.`
      );
    }

    return this._state!;
  }
  public static interpret = interpret;
  /**
   * Executes the actions of the given state, with that state's `context` and `event`.
   *
   * @param state The state whose actions will be executed
   * @param actionsConfig The action implementations to use
   */
  public execute(
    state: State<TContext, TEvent, TStateSchema, TTypestate>,
    actionsConfig?: MachineOptions<TContext, TEvent>['actions']
  ): void {
    for (const action of state.actions) {
      this.exec(action, state, actionsConfig);
    }
  }

  private update(
    state: State<TContext, TEvent, TStateSchema, TTypestate>,
    _event: SCXML.Event<TEvent>
  ): void {
    // Attach session ID to state
    state._sessionid = this.sessionId;

    // Update state
    this._state = state;

    // Execute actions
    if (this.options.execute) {
      this.execute(this.state);
    }

    // Update children
    this.children.forEach((child) => {
      this.state.children[child.id] = child;
    });

    // Dev tools
    if (this.devTools) {
      this.devTools.send(_event.data, state);
    }

    // Execute listeners
    if (state.event) {
      for (const listener of this.eventListeners) {
        listener(state.event);
      }
    }

    for (const listener of this.listeners) {
      listener(state, state.event);
    }

    for (const contextListener of this.contextListeners) {
      contextListener(
        this.state.context,
        this.state.history ? this.state.history.context : undefined
      );
    }

    const isDone = isInFinalState(state.configuration || [], this.machine);

    if (this.state.configuration && isDone) {
      // get final child state node
      const finalChildStateNode = state.configuration.find(
        (sn) => sn.type === 'final' && sn.parent === this.machine
      );

      const doneData =
        finalChildStateNode && finalChildStateNode.doneData
          ? mapContext(finalChildStateNode.doneData, state.context, _event)
          : undefined;

      for (const listener of this.doneListeners) {
        listener(doneInvoke(this.id, doneData));
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
    listener: StateListener<TContext, TEvent, TStateSchema, TTypestate>
  ): this {
    this.listeners.add(listener);

    // Send current state to listener
    if (this.status === InterpreterStatus.Running) {
      listener(this.state, this.state.event);
    }

    return this;
  }
  public subscribe(
    observer: Observer<State<TContext, TEvent, any, TTypestate>>
  ): Subscription;
  public subscribe(
    nextListener?: (state: State<TContext, TEvent, any, TTypestate>) => void,
    errorListener?: (error: any) => void,
    completeListener?: () => void
  ): Subscription;
  public subscribe(
    nextListenerOrObserver?:
      | ((state: State<TContext, TEvent, any, TTypestate>) => void)
      | Observer<State<TContext, TEvent, any, TTypestate>>,
    _?: (error: any) => void, // TODO: error listener
    completeListener?: () => void
  ): Subscription {
    if (!nextListenerOrObserver) {
      return { unsubscribe: () => void 0 };
    }

    let listener: (state: State<TContext, TEvent, any, TTypestate>) => void;
    let resolvedCompleteListener = completeListener;

    if (typeof nextListenerOrObserver === 'function') {
      listener = nextListenerOrObserver;
    } else {
      listener = nextListenerOrObserver.next.bind(nextListenerOrObserver);
      resolvedCompleteListener = nextListenerOrObserver.complete.bind(
        nextListenerOrObserver
      );
    }

    this.listeners.add(listener);

    // Send current state to listener
    if (this.status === InterpreterStatus.Running) {
      listener(this.state);
    }

    if (resolvedCompleteListener) {
      this.onDone(resolvedCompleteListener);
    }

    return {
      unsubscribe: () => {
        listener && this.listeners.delete(listener);
        resolvedCompleteListener &&
          this.doneListeners.delete(resolvedCompleteListener);
      }
    };
  }

  /**
   * Adds an event listener that is notified whenever an event is sent to the running interpreter.
   * @param listener The event listener
   */
  public onEvent(
    listener: EventListener
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.eventListeners.add(listener);
    return this;
  }
  /**
   * Adds an event listener that is notified whenever a `send` event occurs.
   * @param listener The event listener
   */
  public onSend(
    listener: EventListener
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.sendListeners.add(listener);
    return this;
  }
  /**
   * Adds a context listener that is notified whenever the state context changes.
   * @param listener The context listener
   */
  public onChange(
    listener: ContextListener<TContext>
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.contextListeners.add(listener);
    return this;
  }
  /**
   * Adds a listener that is notified when the machine is stopped.
   * @param listener The listener
   */
  public onStop(
    listener: Listener
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.stopListeners.add(listener);
    return this;
  }
  /**
   * Adds a state listener that is notified when the statechart has reached its final state.
   * @param listener The state listener
   */
  public onDone(
    listener: EventListener<DoneEvent>
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.doneListeners.add(listener);
    return this;
  }
  /**
   * Adds an error listener that is notified when an unhandled error occurs.
   * @param errorListener The error listener
   */
  public onError(
    errorListener: ErrorListener
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.errorListeners.add(errorListener);
    return this;
  }

  private handleError(errorData: unknown): void {
    const errorEventHandled = this.state.nextEvents.some(
      (event) => event === actionTypes.errorExecution
    );

    if (errorEventHandled) {
      this.send({
        type: actionTypes.errorExecution,
        data: errorData
      } as any); // TODO: allow this error type
    }

    if (!errorEventHandled && this.errorListeners.size === 0) {
      throw errorData;
    }

    this.errorListeners.forEach((errorListener) => errorListener(errorData));
  }
  /**
   * Removes a listener.
   * @param listener The listener to remove
   */
  public off(
    listener: (...args: any[]) => void
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.listeners.delete(listener);
    this.eventListeners.delete(listener);
    this.sendListeners.delete(listener);
    this.stopListeners.delete(listener);
    this.doneListeners.delete(listener);
    this.contextListeners.delete(listener);
    return this;
  }
  /**
   * Alias for Interpreter.prototype.start
   */
  public init = this.start;
  /**
   * Starts the interpreter from the given state, or the initial state.
   * @param initialState The state to start the statechart from
   */
  public start(
    initialState?:
      | State<TContext, TEvent, TStateSchema, TTypestate>
      | StateValue
  ): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    if (this.status === InterpreterStatus.Running) {
      // Do not restart the service if it is already started
      return this;
    }

    registry.register(this.sessionId, this as Actor);
    this.initialized = true;
    this.status = InterpreterStatus.Running;

    const resolvedState =
      initialState === undefined
        ? this.initialState
        : serviceScope.provide(this, () => {
            return isState<TContext, TEvent, TStateSchema, TTypestate>(
              initialState
            )
              ? this.machine.resolveState(initialState)
              : this.machine.resolveState(
                  State.from(initialState, this.machine.context)
                );
          });

    if (this.options.devTools) {
      this.attachDev();
    }
    this.scheduler.initialize(() => {
      this.update(resolvedState, initEvent as SCXML.Event<TEvent>);
    });
    return this;
  }
  /**
   * Stops the interpreter and unsubscribe all listeners.
   *
   * This will also notify the `onStop` listeners.
   */
  public stop(): Interpreter<TContext, TStateSchema, TEvent, TTypestate> {
    this.listeners.clear();

    for (const listener of this.stopListeners) {
      // call listener, then remove
      listener();
      this.stopListeners.delete(listener);
    }

    this.contextListeners.clear();
    this.doneListeners.clear();
    this.errorListeners.clear();

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
    this.initialized = false;
    this.status = InterpreterStatus.Stopped;
    registry.free(this.sessionId);

    return this;
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
  public send = (
    event: SingleOrArray<Event<TEvent>> | SCXML.Event<TEvent>,
    payload?: EventData
  ): State<TContext, TEvent, TStateSchema, TTypestate> => {
    if (isArray(event)) {
      this.batch(event);
      return this.state;
    }

    const _event = toSCXMLEvent(toEventObject(event as Event<TEvent>, payload));

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
      return this.state;
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

    return this._state!; // TODO: deprecate (should return void)
    // tslint:disable-next-line:semicolon
  };

  private batch(events: Array<TEvent | TEvent['type']>): void {
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
          }" and are deferred. Make sure .start() is called for this service.\nEvent: ${JSON.stringify(
            event
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

        nextState = serviceScope.provide(this, () => {
          return this.machine.transition(nextState, _event);
        });

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

  /**
   * Returns a send function bound to this interpreter instance.
   *
   * @param event The event to be sent by the sender.
   */
  public sender(
    event: Event<TEvent>
  ): () => State<TContext, TEvent, TStateSchema, TTypestate> {
    return this.send.bind(this, event);
  }

  private sendTo = (
    event: SCXML.Event<AnyEventObject>,
    to: string | number | ActorRef<any>
  ) => {
    const isParent =
      this.parent && (to === SpecialTargets.Parent || this.parent.id === to);
    const target = isParent
      ? this.parent
      : isString(to)
      ? this.children.get(to as string) || registry.get(to as string)
      : isActor(to)
      ? to
      : undefined;

    if (!target) {
      if (!isParent) {
        throw new Error(
          `Unable to send event to child '${to}' from service '${this.id}'.`
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

    if ('machine' in target) {
      // Send SCXML events to machines
      (target as AnyInterpreter).send({
        ...event,
        name:
          event.name === actionTypes.error ? `${error(this.id)}` : event.name,
        origin: this.sessionId
      });
    } else {
      // Send normal events to other targets
      target.send(event.data);
    }
  };
  /**
   * Returns the next state given the interpreter's current state and the event.
   *
   * This is a pure method that does _not_ update the interpreter's state.
   *
   * @param event The event to determine the next state
   */
  public nextState(
    event: Event<TEvent> | SCXML.Event<TEvent>
  ): State<TContext, TEvent, TStateSchema, TTypestate> {
    const _event = toSCXMLEvent(event);

    if (
      _event.name.startsWith(actionTypes.errorPlatform) &&
      !this.state.nextEvents.some((nextEvent) =>
        nextEvent.startsWith(actionTypes.errorPlatform)
      )
    ) {
      throw (_event.data as any).data;
    }

    const nextState = serviceScope.provide(this, () => {
      return this.machine.transition(this.state, _event);
    });

    return nextState;
  }
  private forward(event: SCXML.Event<TEvent>): void {
    for (const id of this.forwardTo) {
      const child = this.children.get(id);

      if (!child) {
        throw new Error(
          `Unable to forward event '${event}' from interpreter '${this.id}' to nonexistant child '${id}'.`
        );
      }

      child.send(event);
    }
  }
  private defer(sendAction: SendActionObject<TContext, TEvent>): void {
    this.delayedEventsMap[sendAction.id] = this.clock.setTimeout(() => {
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
    action: ActionObject<TContext, TEvent>,
    state: State<TContext, TEvent, TStateSchema, TTypestate>,
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
          this.parent.send(error(this.id, err));
        }

        this.handleError(err);
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
        this.cancel((action as CancelAction).sendId);

        break;
      case actionTypes.start: {
        const activity = (action as ActivityActionObject<TContext, TEvent>)
          .activity as InvokeDefinition<TContext, TEvent>;

        // If the activity will be stopped right after it's started
        // (such as in transient states)
        // don't bother starting the activity.
        if (!this.state.activities[activity.id || activity.type]) {
          break;
        }

        // Invoked services
        if (activity.type === ActionTypes.Invoke) {
          const invokeSource = toInvokeSource(activity.src);
          const serviceCreator:
            | ServiceConfig<TContext, TEvent>
            | undefined = this.machine.options.services
            ? this.machine.options.services[invokeSource.type]
            : undefined;

          const { id, data } = activity;

          if (!IS_PRODUCTION) {
            warn(
              !('forward' in activity),
              // tslint:disable-next-line:max-line-length
              `\`forward\` property is deprecated (found in invocation of '${activity.src}' in in machine '${this.machine.id}'). ` +
                `Please use \`autoForward\` instead.`
            );
          }

          const autoForward =
            'autoForward' in activity
              ? activity.autoForward
              : !!activity.forward;

          if (!serviceCreator) {
            // tslint:disable-next-line:no-console
            if (!IS_PRODUCTION) {
              warn(
                false,
                `No service found for invocation '${activity.src}' in machine '${this.machine.id}'.`
              );
            }
            return;
          }

          const resolvedData = data
            ? mapContext(data, context, _event)
            : undefined;

          try {
            const source = isFunction(serviceCreator)
              ? serviceCreator(context, _event.data, {
                  data: resolvedData,
                  src: invokeSource
                })
              : serviceCreator;

            if (isPromiseLike(source)) {
              this.spawnPromise(Promise.resolve(source), id);
            } else if (isFunction(source)) {
              this.spawnCallback(source, id);
            } else if (isObservable<TEvent>(source)) {
              this.spawnObservable(source, id);
            } else if (isMachine(source)) {
              // TODO: try/catch here
              this.spawnMachine(
                resolvedData ? source.withContext(resolvedData) : source,
                {
                  id,
                  autoForward
                }
              );
            } else {
              // service is string
            }
          } catch (err) {
            this.handleError(err);
          }
        } else {
          this.spawnActivity(activity);
        }

        break;
      }
      case actionTypes.stop: {
        this.stopChild((action as StopActionObject).activity.id);
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

  private removeChild(childId: string): void {
    this.children.delete(childId);
    this.forwardTo.delete(childId);

    delete this.state.children[childId];
  }

  private stopChild(childId: string): void {
    const child = this.children.get(childId);
    if (!child) {
      return;
    }

    this.removeChild(childId);

    if (isFunction(child.stop)) {
      child.stop();
    }
  }
  public spawn(
    entity: Spawnable,
    name: string,
    options?: SpawnOptions
  ): SpawnedActorRef<any> {
    if (isPromiseLike(entity)) {
      return this.spawnPromise(Promise.resolve(entity), name);
    } else if (isFunction(entity)) {
      return this.spawnCallback(entity as InvokeCallback, name);
    } else if (isSpawnedActor(entity)) {
      return this.spawnActor(entity);
    } else if (isObservable<TEvent>(entity)) {
      return this.spawnObservable(entity, name);
    } else if (isMachine(entity)) {
      return this.spawnMachine(entity, { ...options, id: name });
    } else {
      throw new Error(
        `Unable to spawn entity "${name}" of type "${typeof entity}".`
      );
    }
  }
  public spawnMachine<
    TChildContext,
    TChildStateSchema,
    TChildEvent extends EventObject
  >(
    machine: StateMachine<TChildContext, TChildStateSchema, TChildEvent>,
    options: { id?: string; autoForward?: boolean; sync?: boolean } = {}
  ): SpawnedActorRef<TChildEvent, State<TChildContext, TChildEvent>> {
    const childService = new Interpreter(machine, {
      ...this.options, // inherit options from this interpreter
      parent: this,
      id: options.id || machine.id
    });

    const resolvedOptions = {
      ...DEFAULT_SPAWN_OPTIONS,
      ...options
    };

    if (resolvedOptions.sync) {
      childService.onTransition((state) => {
        this.send(actionTypes.update as any, {
          state,
          id: childService.id
        });
      });
    }

    const actor = childService;

    this.children.set(childService.id, actor);

    if (resolvedOptions.autoForward) {
      this.forwardTo.add(childService.id);
    }

    childService
      .onDone((doneEvent) => {
        this.removeChild(childService.id);
        this.send(toSCXMLEvent(doneEvent as any, { origin: childService.id }));
      })
      .start();

    return actor;
  }
  private spawnPromise<T>(
    promise: Promise<T>,
    id: string
  ): SpawnedActorRef<never, T> {
    let canceled = false;

    promise.then(
      (response) => {
        if (!canceled) {
          this.removeChild(id);
          this.send(
            toSCXMLEvent(doneInvoke(id, response) as any, { origin: id })
          );
        }
      },
      (errorData) => {
        if (!canceled) {
          this.removeChild(id);
          const errorEvent = error(id, errorData);
          try {
            // Send "error.platform.id" to this (parent).
            this.send(toSCXMLEvent(errorEvent as any, { origin: id }));
          } catch (errorFromSend) {
            if (this.machine.strict) {
              this.handleError(errorFromSend);
            }

            reportUnhandledExceptionOnInvocation(errorData, errorFromSend, id);
            if (this.devTools) {
              this.devTools.send(errorEvent, this.state);
            }
            if (this.machine.strict) {
              // it would be better to always stop the state machine if unhandled
              // exception/promise rejection happens but because we don't want to
              // break existing code so enforce it on strict mode only especially so
              // because documentation says that onError is optional
              this.stop();
            }
          }
        }
      }
    );

    const actor: SpawnedActorRef<never, T> = {
      id,
      send: () => void 0,
      subscribe: (next, handleError?, complete?) => {
        const observer = toObserver(next, handleError, complete);

        let unsubscribed = false;
        promise.then(
          (response) => {
            if (unsubscribed) {
              return;
            }
            observer.next(response);
            if (unsubscribed) {
              return;
            }
            observer.complete();
          },
          (err) => {
            if (unsubscribed) {
              return;
            }
            observer.error(err);
          }
        );

        return {
          unsubscribe: () => (unsubscribed = true)
        };
      },
      stop: () => {
        canceled = true;
      },
      toJSON() {
        return { id };
      }
    };

    this.children.set(id, actor);

    return actor;
  }
  private spawnCallback(
    callback: InvokeCallback,
    id: string
  ): SpawnedActorRef<any> {
    let canceled = false;
    const receivers = new Set<(e: EventObject) => void>();
    const listeners = new Set<(e: EventObject) => void>();

    const receive = (e: TEvent) => {
      listeners.forEach((listener) => listener(e));
      if (canceled) {
        return;
      }
      this.send(toSCXMLEvent(e, { origin: id }));
    };

    let callbackStop;

    try {
      callbackStop = callback(receive, (newListener) => {
        receivers.add(newListener);
      });
    } catch (err) {
      this.send(error(id, err) as any);
    }

    if (isPromiseLike(callbackStop)) {
      // it turned out to be an async function, can't reliably check this before calling `callback`
      // because transpiled async functions are not recognizable
      return this.spawnPromise(callbackStop as Promise<any>, id);
    }

    const actor = {
      id,
      send: (event) => receivers.forEach((receiver) => receiver(event)),
      subscribe: (next) => {
        listeners.add(next);

        return {
          unsubscribe: () => {
            listeners.delete(next);
          }
        };
      },
      stop: () => {
        canceled = true;
        if (isFunction(callbackStop)) {
          callbackStop();
        }
      },
      toJSON() {
        return { id };
      }
    };

    this.children.set(id, actor);

    return actor;
  }
  private spawnObservable<T extends TEvent>(
    source: Subscribable<T>,
    id: string
  ): SpawnedActorRef<any, T> {
    const subscription = source.subscribe(
      (value) => {
        this.send(toSCXMLEvent(value, { origin: id }));
      },
      (err) => {
        this.removeChild(id);
        this.send(toSCXMLEvent(error(id, err) as any, { origin: id }));
      },
      () => {
        this.removeChild(id);
        this.send(toSCXMLEvent(doneInvoke(id) as any, { origin: id }));
      }
    );

    const actor: SpawnedActorRef<any, T> = {
      id,
      send: () => void 0,
      subscribe: (next, handleError?, complete?) => {
        return source.subscribe(next, handleError, complete);
      },
      stop: () => subscription.unsubscribe(),
      toJSON() {
        return { id };
      }
    };

    this.children.set(id, actor);

    return actor;
  }
  private spawnActor<T extends SpawnedActorRef<any>>(actor: T): T {
    this.children.set(actor.id, actor);

    return actor;
  }
  private spawnActivity(activity: ActivityDefinition<TContext, TEvent>): void {
    const implementation =
      this.machine.options && this.machine.options.activities
        ? this.machine.options.activities[activity.type]
        : undefined;

    if (!implementation) {
      if (!IS_PRODUCTION) {
        warn(false, `No implementation found for activity '${activity.type}'`);
      }
      // tslint:disable-next-line:no-console
      return;
    }

    // Start implementation
    const dispose = implementation(this.state.context, activity);
    this.spawnEffect(activity.id, dispose);
  }
  private spawnEffect(
    id: string,
    dispose?: DisposeActivityFunction | void
  ): void {
    this.children.set(id, {
      id,
      send: () => void 0,
      subscribe: () => {
        return { unsubscribe: () => void 0 };
      },
      stop: dispose || undefined,
      toJSON() {
        return { id };
      }
    });
  }

  private attachDev(): void {
    const global = getGlobal();
    if (this.options.devTools && global) {
      if ((global as any).__REDUX_DEVTOOLS_EXTENSION__) {
        const devToolsOptions =
          typeof this.options.devTools === 'object'
            ? this.options.devTools
            : undefined;
        this.devTools = (global as any).__REDUX_DEVTOOLS_EXTENSION__.connect(
          {
            name: this.id,
            autoPause: true,
            stateSanitizer: (state: State<any, any>): object => {
              return {
                value: state.value,
                context: state.context,
                actions: state.actions
              };
            },
            ...devToolsOptions,
            features: {
              jump: false,
              skip: false,
              ...(devToolsOptions
                ? (devToolsOptions as any).features
                : undefined)
            }
          },
          this.machine
        );
        this.devTools.init(this.state);
      }

      // add XState-specific dev tooling hook
      registerService(this);
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

const resolveSpawnOptions = (nameOrOptions?: string | SpawnOptions) => {
  if (isString(nameOrOptions)) {
    return { ...DEFAULT_SPAWN_OPTIONS, name: nameOrOptions };
  }

  return {
    ...DEFAULT_SPAWN_OPTIONS,
    name: uniqueId(),
    ...nameOrOptions
  };
};

export function spawn<TC, TE extends EventObject>(
  entity: StateMachine<TC, any, TE>,
  nameOrOptions?: string | SpawnOptions
): ActorRefFrom<StateMachine<TC, any, TE>>;
export function spawn(
  entity: Spawnable,
  nameOrOptions?: string | SpawnOptions
): SpawnedActorRef<any>;
export function spawn(
  entity: Spawnable,
  nameOrOptions?: string | SpawnOptions
): SpawnedActorRef<any> {
  const resolvedOptions = resolveSpawnOptions(nameOrOptions);

  return serviceScope.consume((service) => {
    if (!IS_PRODUCTION) {
      const isLazyEntity = isMachine(entity) || isFunction(entity);
      warn(
        !!service || isLazyEntity,
        `Attempted to spawn an Actor (ID: "${
          isMachine(entity) ? entity.id : 'undefined'
        }") outside of a service. This will have no effect.`
      );
    }
    if (service) {
      return service.spawn(entity, resolvedOptions.name, resolvedOptions);
    } else {
      return createDeferredActor(entity, resolvedOptions.name);
    }
  });
}

/**
 * Creates a new Interpreter instance for the given machine with the provided options, if any.
 *
 * @param machine The machine to interpret
 * @param options Interpreter options
 */
export function interpret<
  TContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  machine: StateMachine<TContext, TStateSchema, TEvent, TTypestate>,
  options?: Partial<InterpreterOptions>
) {
  const interpreter = new Interpreter<
    TContext,
    TStateSchema,
    TEvent,
    TTypestate
  >(machine, options);

  return interpreter;
}
