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
  Unsubscribable,
  MachineOptions,
  ActionFunctionMap
} from './types';
import { State, bindActionToState } from './State';
import * as actionTypes from './actionTypes';
import { doneInvoke, error, getActionFunction } from './actions';
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
  toSCXMLEvent
} from './utils';
import { Scheduler } from './scheduler';
import { Actor, isActor } from './Actor';
import { isInFinalState } from './stateUtils';

export type StateListener<
  TContext extends DefaultContext,
  TEvent extends EventObject
> = (state: State<TContext, TEvent>, event: TEvent) => void;

export type ContextListener<
  TContext extends DefaultContext = DefaultContext
> = (context: TContext, prevContext: TContext | undefined) => void;

export type EventListener<TEvent extends EventObject = EventObject> = (
  event: TEvent
) => void;

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

/**
 * Maintains a stack of the current service in scope.
 * This is used to provide the correct service to spawn().
 *
 * @private
 */
const withServiceScope = (() => {
  const serviceStack = [] as Array<Interpreter<any, any>>;

  return <T, TService extends Interpreter<any, any>>(
    service: TService | undefined,
    fn: (service: TService) => T
  ) => {
    service && serviceStack.push(service);

    const result = fn(
      service || (serviceStack[serviceStack.length - 1] as TService)
    );

    service && serviceStack.pop();

    return result;
  };
})();

export class Interpreter<
  // tslint:disable-next-line:max-classes-per-file
  TContext extends DefaultContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject
>
  implements
    Subscribable<State<TContext, TEvent>>,
    Actor<State<TContext, TEvent>, TEvent> {
  /**
   * The default interpreter options:
   *
   * - `clock` uses the global `setTimeout` and `clearTimeout` functions
   * - `logger` uses the global `console.log()` method
   */
  public static defaultOptions: InterpreterOptions = (global => ({
    execute: true,
    deferEvents: true,
    clock: {
      setTimeout: (fn, ms) => {
        return global.setTimeout.call(null, fn, ms);
      },
      clearTimeout: id => {
        return global.clearTimeout.call(null, id);
      }
    },
    logger: global.console.log.bind(console),
    devTools: false
  }))(typeof window === 'undefined' ? global : window);
  /**
   * The current state of the interpreted machine.
   */
  private _state?: State<TContext, TEvent>;
  /**
   * The clock that is responsible for setting and clearing timeouts, such as delayed events and transitions.
   */
  public clock: Clock;
  public options: Readonly<InterpreterOptions>;

  private scheduler: Scheduler = new Scheduler();
  private delayedEventsMap: Record<string, number> = {};
  private listeners: Set<StateListener<TContext, TEvent>> = new Set();
  private contextListeners: Set<ContextListener<TContext>> = new Set();
  private stopListeners: Set<Listener> = new Set();
  private doneListeners: Set<EventListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private sendListeners: Set<EventListener> = new Set();
  private logger: (...args: any[]) => void;
  /**
   * Whether the service is started.
   */
  public initialized = false;
  /**
   * The initial state of the machine.
   */
  private _initialState?: State<TContext, TEvent>;

  // Actor
  public parent?: Interpreter<any>;
  public id: string;
  public children: Map<string | number, Actor> = new Map();
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
    public machine: StateMachine<TContext, TStateSchema, TEvent>,
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
  }
  public get initialState(): State<TContext, TEvent> {
    if (!IS_PRODUCTION) {
      warn(
        this.initialized,
        // tslint:disable-next-line:max-line-length
        `Attempted to read initial state from uninitialized service '${this.id}'. Make sure the service is started first.`
      );
    }

    return (
      this._initialState ||
      withServiceScope(this, () => this.machine.initialState)
    );
  }
  public get state(): State<TContext, TEvent> {
    if (!IS_PRODUCTION) {
      warn(
        this.initialized,
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
    state: State<TContext, TEvent>,
    actionsConfig?: MachineOptions<TContext, TEvent>['actions']
  ): void {
    for (const action of state.actions) {
      this.exec(action, state.context, state.event, actionsConfig);
    }
  }
  private update(state: State<TContext, TEvent>, event: TEvent): void {
    // Update state
    this._state = state;

    // Execute actions
    if (this.options.execute) {
      this.execute(this.state);
    }

    // Dev tools
    if (this.devTools) {
      this.devTools.send(event, state);
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
      const finalChildStateNode = state.configuration!.find(
        sn => sn.type === 'final' && sn.parent === this.machine
      );

      const doneData =
        finalChildStateNode && finalChildStateNode.data
          ? mapContext(finalChildStateNode.data, state.context, event)
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
    listener: StateListener<TContext, TEvent>
  ): Interpreter<TContext, TStateSchema, TEvent> {
    this.listeners.add(listener);
    return this;
  }
  public subscribe(
    nextListener?: (state: State<TContext, TEvent>) => void,
    // @ts-ignore
    errorListener?: (error: any) => void,
    completeListener?: () => void
  ): Unsubscribable {
    if (nextListener) {
      this.onTransition(nextListener);
    }

    if (completeListener) {
      this.onDone(completeListener);
    }

    return {
      unsubscribe: () => {
        nextListener && this.listeners.delete(nextListener);
        completeListener && this.doneListeners.delete(completeListener);
      }
    };
  }
  /**
   * Adds an event listener that is notified whenever an event is sent to the running interpreter.
   * @param listener The event listener
   */
  public onEvent(
    listener: EventListener
  ): Interpreter<TContext, TStateSchema, TEvent> {
    this.eventListeners.add(listener);
    return this;
  }
  /**
   * Adds an event listener that is notified whenever a `send` event occurs.
   * @param listener The event listener
   */
  public onSend(
    listener: EventListener
  ): Interpreter<TContext, TStateSchema, TEvent> {
    this.sendListeners.add(listener);
    return this;
  }
  /**
   * Adds a context listener that is notified whenever the state context changes.
   * @param listener The context listener
   */
  public onChange(
    listener: ContextListener<TContext>
  ): Interpreter<TContext, TStateSchema, TEvent> {
    this.contextListeners.add(listener);
    return this;
  }
  /**
   * Adds a listener that is notified when the machine is stopped.
   * @param listener The listener
   */
  public onStop(
    listener: Listener
  ): Interpreter<TContext, TStateSchema, TEvent> {
    this.stopListeners.add(listener);
    return this;
  }
  /**
   * Adds a state listener that is notified when the statechart has reached its final state.
   * @param listener The state listener
   */
  public onDone(
    listener: EventListener<DoneEvent>
  ): Interpreter<TContext, TStateSchema, TEvent> {
    this.doneListeners.add(listener);
    return this;
  }
  /**
   * Removes a listener.
   * @param listener The listener to remove
   */
  public off(
    listener: (...args: any[]) => void
  ): Interpreter<TContext, TStateSchema, TEvent> {
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
    initialState?: State<TContext, TEvent> | StateValue
  ): Interpreter<TContext, TStateSchema, TEvent> {
    if (this.initialized) {
      // Do not restart the service if it is already started
      return this;
    }

    this.initialized = true;

    const resolvedState = withServiceScope(this, () => {
      return initialState === undefined
        ? this.machine.initialState
        : initialState instanceof State
        ? this.machine.resolveState(initialState)
        : this.machine.resolveState(
            State.from(initialState, this.machine.context)
          );
    });

    if (this.options.devTools) {
      this.attachDev();
    }
    this.scheduler.initialize(() => {
      this.update(resolvedState, { type: actionTypes.init } as TEvent);
    });
    return this;
  }
  /**
   * Stops the interpreter and unsubscribe all listeners.
   *
   * This will also notify the `onStop` listeners.
   */
  public stop(): Interpreter<TContext, TStateSchema, TEvent> {
    for (const listener of this.listeners) {
      this.listeners.delete(listener);
    }
    for (const listener of this.stopListeners) {
      // call listener, then remove
      listener();
      this.stopListeners.delete(listener);
    }
    for (const listener of this.contextListeners) {
      this.contextListeners.delete(listener);
    }
    for (const listener of this.doneListeners) {
      this.doneListeners.delete(listener);
    }

    // Stop all children
    this.children.forEach(child => {
      if (isFunction(child.stop)) {
        child.stop();
      }
    });

    // Cancel all delayed events
    for (const key of keys(this.delayedEventsMap)) {
      this.clock.clearTimeout(this.delayedEventsMap[key]);
    }

    this.initialized = false;

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
    event: SingleOrArray<TEvent | TEvent['type']>,
    payload?: Record<string, any> & { type?: never }
  ): State<TContext, TEvent> => {
    if (isArray(event)) {
      this.batch(event);
      return this.state;
    }

    const eventObject = toEventObject(event, payload);
    if (!this.initialized && this.options.deferEvents) {
      // tslint:disable-next-line:no-console
      if (!IS_PRODUCTION) {
        warn(
          false,
          `Event "${eventObject.type}" was sent to uninitialized service "${
            this.machine.id
          }" and is deferred. Make sure .start() is called for this service.\nEvent: ${JSON.stringify(
            event
          )}`
        );
      }
    } else if (!this.initialized) {
      throw new Error(
        `Event "${eventObject.type}" was sent to uninitialized service "${
          this.machine.id
          // tslint:disable-next-line:max-line-length
        }". Make sure .start() is called for this service, or set { deferEvents: true } in the service options.\nEvent: ${JSON.stringify(
          eventObject
        )}`
      );
    }

    this.scheduler.schedule(() => {
      // Forward copy of event to child interpreters
      this.forward(eventObject);

      const nextState = this.nextState(eventObject);

      this.update(nextState, eventObject);
    });

    return this._state!; // TODO: deprecate (should return void)
    // tslint:disable-next-line:semicolon
  };

  private batch(events: Array<TEvent | TEvent['type']>): void {
    if (!this.initialized && this.options.deferEvents) {
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
    } else if (!this.initialized) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `${events.length} event(s) were sent to uninitialized service "${this.machine.id}". Make sure .start() is called for this service, or set { deferEvents: true } in the service options.`
      );
    }

    this.scheduler.schedule(() => {
      let nextState = this.state;
      for (const event of events) {
        const { changed } = nextState;
        const eventObject = toEventObject(event);
        const actions = nextState.actions.map(a =>
          bindActionToState(a, nextState)
        ) as Array<ActionObject<TContext, TEvent>>;
        nextState = this.machine.transition(nextState, eventObject);
        nextState.actions.unshift(...actions);
        nextState.changed = nextState.changed || !!changed;

        this.forward(eventObject);
      }

      this.update(nextState, toEventObject(events[events.length - 1]));
    });
  }

  /**
   * Returns a send function bound to this interpreter instance.
   *
   * @param event The event to be sent by the sender.
   */
  public sender(event: Event<TEvent>): () => State<TContext, TEvent> {
    return this.send.bind(this, event);
  }

  public sendTo = (event: TEvent, to: string | number | Actor) => {
    const isParent =
      this.parent && (to === SpecialTargets.Parent || this.parent.id === to);
    const target = isParent
      ? this.parent
      : isActor(to)
      ? to
      : this.children.get(to);

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

    // add SCXML event
    const eventWithSCXML = {
      ...event,
      __scxml: toSCXMLEvent(event, { origin: this.id, type: 'external' })
    };

    target.send(eventWithSCXML);
  };
  /**
   * Returns the next state given the interpreter's current state and the event.
   *
   * This is a pure method that does _not_ update the interpreter's state.
   *
   * @param event The event to determine the next state
   */
  public nextState(event: TEvent | TEvent['type']): State<TContext, TEvent> {
    const eventObject = toEventObject(event);

    if (
      eventObject.type.indexOf(actionTypes.errorPlatform) === 0 &&
      !this.state.nextEvents.some(
        nextEvent => nextEvent.indexOf(actionTypes.errorPlatform) === 0
      )
    ) {
      throw (eventObject as TEvent).data;
    }

    const nextState = withServiceScope(this, () => {
      return this.machine.transition(
        this.state,
        eventObject,
        this.state.context
      );
    });

    return nextState;
  }
  private forward(event: TEvent): void {
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
    let { delay } = sendAction;

    if (isString(delay)) {
      if (
        !this.machine.options.delays ||
        this.machine.options.delays[delay] === undefined
      ) {
        // tslint:disable-next-line:no-console
        if (!IS_PRODUCTION) {
          warn(
            false,
            // tslint:disable-next-line:max-line-length
            `No delay reference for delay expression '${delay}' was found on machine '${this.machine.id}' on service '${this.id}'.`
          );
        }

        // Do not send anything
        return;
      } else {
        const delayExpr = this.machine.options.delays[delay];
        delay =
          typeof delayExpr === 'number'
            ? delayExpr
            : delayExpr(this.state.context, this.state.event);
      }
    }

    this.delayedEventsMap[sendAction.id] = this.clock.setTimeout(() => {
      if (sendAction.to) {
        this.sendTo(sendAction.event, sendAction.to);
      } else {
        this.send(sendAction.event);
      }
    }, (delay as number) || 0);
  }
  private cancel(sendId: string | number): void {
    this.clock.clearTimeout(this.delayedEventsMap[sendId]);
    delete this.delayedEventsMap[sendId];
  }
  private exec(
    action: ActionObject<TContext, TEvent>,
    context: TContext,
    event: TEvent,
    actionFunctionMap?: ActionFunctionMap<TContext, TEvent>
  ): void {
    const actionOrExec =
      getActionFunction(action.type, actionFunctionMap) || action.exec;
    const exec = isFunction(actionOrExec)
      ? actionOrExec
      : actionOrExec
      ? actionOrExec.exec
      : action.exec;

    if (exec) {
      // @ts-ignore (TODO: fix for TypeDoc)
      return exec(context, event, { action, state: this.state });
    }

    switch (action.type) {
      case actionTypes.send:
        const sendAction = action as SendActionObject<TContext, TEvent>;

        if (sendAction.delay) {
          this.defer(sendAction);
          return;
        } else {
          if (sendAction.to) {
            this.sendTo(sendAction.event, sendAction.to);
          } else {
            this.send(sendAction.event);
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
        if (!this.state.activities[activity.type]) {
          break;
        }

        // Invoked services
        if (activity.type === ActionTypes.Invoke) {
          const serviceCreator: ServiceConfig<TContext> | undefined = this
            .machine.options.services
            ? this.machine.options.services[activity.src]
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

          const source = isFunction(serviceCreator)
            ? serviceCreator(context, event)
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
              data
                ? source.withContext(mapContext(data, context, event as TEvent))
                : source,
              {
                id,
                autoForward
              }
            );
          } else {
            // service is string
          }
        } else {
          this.spawnActivity(activity);
        }

        break;
      }
      case actionTypes.stop: {
        this.stopChild(action.activity.id);

        break;
      }

      case actionTypes.log:
        const expr = action.expr ? action.expr(context, event) : undefined;

        if (action.label) {
          this.logger(action.label, expr);
        } else {
          this.logger(expr);
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
  private stopChild(childId: string): void {
    const child = this.children.get(childId);
    if (!child) {
      return;
    }

    this.children.delete(childId);
    this.forwardTo.delete(childId);

    if (isFunction(child.stop)) {
      child.stop();
    }
  }
  public spawn<TChildContext extends DefaultContext>(
    entity: Spawnable<TChildContext>,
    name: string,
    options?: SpawnOptions
  ): Actor {
    if (isPromiseLike(entity)) {
      return this.spawnPromise(Promise.resolve(entity), name);
    } else if (isFunction(entity)) {
      return this.spawnCallback(entity, name);
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
    TChildContext extends DefaultContext,
    TChildStateSchema,
    TChildEvents extends EventObject
  >(
    machine: StateMachine<TChildContext, TChildStateSchema, TChildEvents>,
    options: { id?: string; autoForward?: boolean; sync?: boolean } = {}
  ): Actor<State<TChildContext, TChildEvents>> {
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
      childService.onTransition(state => {
        this.send(actionTypes.update as any, {
          state,
          id: childService.id
        });
      });
    }

    childService
      .onDone(doneEvent => {
        this.send(doneEvent as any);
      })
      .start();

    const actor = childService as Actor<State<TChildContext, TChildEvents>>;

    // const actor = {
    //   id: childService.id,
    //   send: childService.send,
    //   state: childService.state,
    //   subscribe: childService.subscribe,
    //   toJSON() {
    //     return { id: childService.id };
    //   }
    // } as Actor<State<TChildContext, TChildEvents>>;

    this.children.set(childService.id, actor);

    if (resolvedOptions.autoForward) {
      this.forwardTo.add(childService.id);
    }

    return actor;
  }
  private spawnPromise(promise: Promise<any>, id: string): Actor {
    let canceled = false;

    promise.then(
      response => {
        if (!canceled) {
          this.send(doneInvoke(id, response) as any);
        }
      },
      errorData => {
        if (!canceled) {
          const errorEvent = error(id, errorData);
          try {
            // Send "error.execution" to this (parent).
            this.send(errorEvent as any);
          } catch (error) {
            this.reportUnhandledExceptionOnInvocation(errorData, error, id);
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

    const actor = {
      id,
      send: () => void 0,
      subscribe: (next, handleError, complete) => {
        let unsubscribed = false;
        promise.then(
          response => {
            if (unsubscribed) {
              return;
            }
            next && next(response);
            if (unsubscribed) {
              return;
            }
            complete && complete();
          },
          err => {
            if (unsubscribed) {
              return;
            }
            handleError(err);
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
  private spawnCallback(callback: InvokeCallback, id: string): Actor {
    let canceled = false;
    const receive = (e: TEvent) => {
      if (canceled) {
        return;
      }
      this.send(e);
    };
    const listeners = new Set<(e: EventObject) => void>();

    let callbackStop;

    try {
      callbackStop = callback(receive, newListener => {
        listeners.add(newListener);
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
      send: event => listeners.forEach(listener => listener(event)),
      subscribe: next => {
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
  ): Actor {
    const subscription = source.subscribe(
      value => {
        this.send(value);
      },
      err => {
        this.send(error(id, err) as any);
      },
      () => {
        this.send(doneInvoke(id) as any);
      }
    );

    const actor = {
      id,
      send: () => void 0,
      subscribe: (next, handleError, complete) => {
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
  private spawnActivity(activity: ActivityDefinition<TContext, TEvent>): void {
    const implementation =
      this.machine.options && this.machine.options.activities
        ? this.machine.options.activities[activity.type]
        : undefined;

    if (!implementation) {
      // tslint:disable-next-line:no-console
      if (!IS_PRODUCTION) {
        warn(false, `No implementation found for activity '${activity.type}'`);
      }
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
  private reportUnhandledExceptionOnInvocation(
    originalError: any,
    currentError: any,
    id: string
  ) {
    if (!IS_PRODUCTION) {
      const originalStackTrace = originalError.stack
        ? ` Stacktrace was '${originalError.stack}'`
        : '';
      if (originalError === currentError) {
        // tslint:disable-next-line:no-console
        console.error(
          `Missing onError handler for invocation '${id}', error was '${originalError}'.${originalStackTrace}`
        );
      } else {
        const stackTrace = currentError.stack
          ? ` Stacktrace was '${currentError.stack}'`
          : '';
        // tslint:disable-next-line:no-console
        console.error(
          `Missing onError handler and/or unhandled exception/promise rejection for invocation '${id}'. ` +
            `Original error: '${originalError}'. ${originalStackTrace} Current error is '${currentError}'.${stackTrace}`
        );
      }
    }
  }
  private attachDev() {
    if (
      this.options.devTools &&
      typeof window !== 'undefined' &&
      (window as any).__REDUX_DEVTOOLS_EXTENSION__
    ) {
      const devToolsOptions =
        typeof this.options.devTools === 'object'
          ? this.options.devTools
          : undefined;
      this.devTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__.connect({
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
          ...(devToolsOptions ? (devToolsOptions as any).features : undefined)
        }
      });
      this.devTools.init(this.state);
    }
  }
  public toJSON() {
    return {
      id: this.id
    };
  }
}

export type Spawnable<TContext extends DefaultContext> =
  | StateMachine<TContext, any, any>
  | Promise<TContext>
  | InvokeCallback
  | Subscribable<TContext>;

const createNullActor = (name: string = 'null'): Actor => ({
  id: name,
  send: () => void 0,
  subscribe: () => {
    // tslint:disable-next-line:no-empty
    return { unsubscribe: () => {} };
  },
  toJSON: () => ({ id: name })
});

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

export function spawn<TContext extends DefaultContext>(
  entity: StateMachine<TContext, any, any>,
  nameOrOptions?: string | SpawnOptions
): Actor<State<TContext>>;
export function spawn<TContext>(
  entity: Exclude<Spawnable<TContext>, StateMachine<any, any, any>>,
  nameOrOptions?: string | SpawnOptions
): Actor<TContext>;
export function spawn<TContext>(
  entity: Spawnable<TContext>,
  nameOrOptions?: string | SpawnOptions
) {
  const resolvedOptions = resolveSpawnOptions(nameOrOptions);

  return withServiceScope(undefined, service => {
    if (!IS_PRODUCTION) {
      warn(
        !!service,
        `Attempted to spawn an Actor (ID: "${
          isMachine(entity) ? entity.id : 'undefined'
        }") outside of a service. This will have no effect.`
      );
    }

    if (service) {
      return service.spawn(entity, resolvedOptions.name, resolvedOptions);
    } else {
      return createNullActor(resolvedOptions.name);
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
  TContext extends DefaultContext = DefaultContext,
  TStateSchema extends StateSchema = any,
  TEvent extends EventObject = EventObject
>(
  machine: StateMachine<TContext, TStateSchema, TEvent>,
  options?: Partial<InterpreterOptions>
) {
  const interpreter = new Interpreter<TContext, TStateSchema, TEvent>(
    machine,
    options
  );

  return interpreter;
}
