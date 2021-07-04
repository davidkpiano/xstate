# Interpreting Machines

While a state machine/statechart with a pure `.transition()` function is useful for flexibility, purity, and testability, for it to have any use in a real-life application, something needs to:

- Keep track of the current state, and persist it
- Execute side-effects
- Handle delayed transitions and events
- Communicate with external services

The **interpreter** is responsible for _interpreting_ the state machine/statechart and doing all of the above - that is, parsing and executing it in a runtime environment. An interpreted, running instance of a statechart is called a **service**.

## Interpreter <Badge text="4.0+" />

An optional interpreter is provided that you can use to run your statecharts. The interpreter handles:

- State transitions
- Executing actions (side-effects)
- Delayed events with cancellation
- Activities (ongoing actions)
- Invoking/spawning child statechart services
- Support for multiple listeners for state transitions, context changes, events, etc.
- And more!

```js
import { createMachine, interpret } from 'xstate';

const machine = createMachine(/* machine config */);

// Interpret the machine, and add a listener for whenever a transition occurs.
const service = interpret(machine).onTransition((state) => {
  console.log(state.value);
});

// Start the service
service.start();

// Send events
service.send({ type: 'SOME_EVENT' });

// Stop the service when you are no longer using it.
service.stop();
```

## Sending Events

Events are sent to a running service by calling `service.send(event)`. There are 3 ways an event can be sent:

```js {5,8,12}
service.start();

// As an object (preferred):
service.send({ type: 'CLICK', x: 40, y: 21 });

// As a string:
// (same as service.send({ type: 'CLICK' }))
service.send('CLICK');

// As a string with an object payload:
// (same as service.send({ type: 'CLICK', x: 40, y: 21 }))
service.send('CLICK', { x: 40, y: 21 });
```

- As an event object (e.g., `.send({ type: 'CLICK', x: 40, y: 21 })`)
  - The event object must have a `type: ...` string property.
- As a string (e.g., `.send('CLICK')`, which resolves to sending `{ type: 'CLICK' }`)
  - The string represents the event type.
- As a string followed by an object payload (e.g., `.send('CLICK', { x: 40, y: 21 })`) <Badge text="4.5+"/>
  - The first string argument represents the event type.
  - The second argument must be an object without a `type: ...` property.

::: warning
If the service is not initialized (that is, if `service.start()` wasn't called yet), events will be **deferred** until the service is started. This means that the events won't be processed until `service.start()` is called, and then they will all be sequentially processed.

This behavior can be changed by setting `{ deferEvents: false }` in the [service options](#options). When `deferEvents` is `false`, sending an event to an uninitialized service will throw an error.
:::

## Batched Events

Multiple events can be sent as a group, or "batch", to a running service by calling `service.send(events)` with an array of events:

```js
service.send([
  // String events
  'CLICK',
  'CLICK',
  'ANOTHER_EVENT',
  // Event objects
  { type: 'CLICK', x: 40, y: 21 },
  { type: 'KEYDOWN', key: 'Escape' }
]);
```

This will immediately schedule all batched events to be processed sequentially. Since each event causes a state transition that might have actions to execute, actions in intermediate states are deferred until all events are processed, and then they are executed with the state they were created in (not the end state).

This means that the end state (after all events are processed) will have an `.actions` array of _all_ of the accumulated actions from the intermediate states. Each of these actions will be bound to its respective intermediate states.

::: warning

Only one state -- the **end state** (i.e., the resulting state after all events are processed) -- will be sent to the `.onTransition(...)` listener(s). This makes batched events an optimized approach for performance.

:::

::: tip

Batched events are useful for [event sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) approaches. A log of events can be stored and later replayed by sending the batched events to a service to arrive at the same state.

:::

## Transitions

Listeners for state transitions are registered via the `.onTransition(...)` method, which takes a state listener. State listeners are called every time a state transition (including the initial state) happens, with the current [`state` instance](./states.md):

```js
// Interpret the machine
const service = interpret(machine);

// Add a state listener, which is called whenever a state transition occurs.
service.onTransition((state) => {
  console.log(state.value);
});

service.start();
```

::: tip

If you only want the `.onTransition(...)` handler(s) to be called when the state changes (that is, when the `state.value` changes, the `state.context` changes, or there are new `state.actions`), use [`state.changed`](https://xstate.js.org/docs/guides/states.html#state-changed):

```js {2}
service.onTransition((state) => {
  if (state.changed) {
    console.log(state.value);
  }
});
```

:::

## Starting and Stopping

The service can be initialized (i.e., started) and stopped with `.start()` and `.stop()`. Calling `.start()` will immediately transition the service to its initial state. Calling `.stop()` will remove all listeners from the service and do any listener cleanup, if applicable.

```js
const service = interpret(machine);

// Start the machine
service.start();

// Stop the machine
service.stop();

// Restart the machine
service.start();
```

Services can be started from a specific [state](./states.md) by passing the `state` into `service.start(state)`. This is useful when rehydrating the service from a previously saved state.

```js
// Starts the service from the specified state,
// instead of from the machine's initial state.
service.start(previousState);
```

## Executing Actions

[Actions (side-effects)](./actions.md) are, by default, executed immediately when the state transitions. This is configurable by setting the `{ execute: false }` option (see example). Each action object specified on the `state` might have an `.exec` property, which is called with the state's `context` and `event` object.

Actions can be executed manually by calling `service.execute(state)`. This is useful when you want to control when actions are executed:

```js
const service = interpret(machine, {
  execute: false // do not execute actions on state transitions
});

service.onTransition((state) => {
  // execute actions on next animation frame
  // instead of immediately
  requestAnimationFrame(() => service.execute(state));
});

service.start();
```

## Options

The following options can be passed into the interpreter as the 2nd argument (`interpret(machine, options)`):

- `execute` (boolean) - Signifies whether state actions should be executed upon transition. Defaults to `true`.
  - See [Executing Actions](#executing-actions) for customizing this behavior.
- `deferEvents` (boolean) <Badge text="4.4+"/> - Signifies whether events sent to an uninitialized service (i.e., prior to calling `service.start()`) should be deferred until the service is initialized. Defaults to `true`.
  - If `false`, events sent to an uninitialized service will throw an error.
- `devTools` (boolean) - Signifies whether events should be sent to the [Redux DevTools extension](https://github.com/zalmoxisus/redux-devtools-extension). Defaults to `false`.
- `logger` - Specifies the logger to be used for `log(...)` actions. Defaults to the native `console.log` method.
- `clock` - Specifies the [clock interface for delayed actions](./delays.md#interpretation). Defaults to the native `setTimeout` and `clearTimeout` functions.

## Custom Interpreters

You may use any interpreter (or create your own) to run your state machine/statechart. Here's an example minimal implementation that demonstrates how flexible interpretation can be (despite the amount of boilerplate):

```js
const machine = createMachine(/* machine config */);

// Keep track of the current state, and start
// with the initial state
let currentState = machine.initialState;

// Keep track of the listeners
const listeners = new Set();

// Have a way of sending/dispatching events
function send(event) {
  // Remember: machine.transition() is a pure function
  currentState = machine.transition(currentState, event);

  // Get the side-effect actions to execute
  const { actions } = currentState;

  actions.forEach((action) => {
    // If the action is executable, execute it
    action.exec && action.exec();
  });

  // Notify the listeners
  listeners.forEach((listener) => listener(currentState));
}

function listen(listener) {
  listeners.add(listener);
}

function unlisten(listener) {
  listeners.delete(listener);
}

// Now you can listen and send events to update state
listen((state) => {
  console.log(state.value);
});

send('SOME_EVENT');
```

## Notes

- The `interpret` function is exported directly from `xstate` since 4.3+ (i.e., `import { interpret } from 'xstate'`). For prior versions, it is imported from `'xstate/lib/interpreter'`.
- Most interpreter methods can be chained:

```js
const service = interpret(machine)
  .onTransition((state) => console.log(state))
  .onDone(() => console.log('done'))
  .start(); // returns started service
```

- Do not call `service.send(...)` directly from actions. This impedes testing, visualization, and analysis. Instead, [use `invoke`](./communication.md).
