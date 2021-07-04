# Events

An event is what causes a state machine to [transition](./transitions.md) from its current [state](./states.md) to its next state. All state transitions in a state machine are due to these events; a state cannot change unless some stimulus (the event) causes it to change.

An event is an object with a `type` property, signifying what type of event it is:

```js
const timerEvent = {
  type: 'TIMER' // the convention is to use CONST_CASE for event names
};
```

As shorthand, in XState, events that only have a `type` can be represented just by their string type:

```js
// equivalent to { type: 'TIMER' }
const timerEvent = 'TIMER';
```

Event objects can also have other properties, which represent data associated with the event:

```js
const keyDownEvent = {
  type: 'keydown',
  key: 'Enter'
};
```

## Sending Events

As explained in the [transitions guide](./transitions.md), a transition defines what the next state will be given the current state and the event, defined on its `on: { ... }` property. This can be observed by passing an event into the [transition method](./transitions.md#machine-transition-method):

```js
import { createMachine } from 'xstate';

const lightMachine = createMachine({
  /* ... */
});

const { initialState } = lightMachine;

let nextState = lightMachine.transition(initialState, 'TIMER'); // string event
console.log(nextState.value);
// => 'yellow'

nextState = lightMachine.transition(nextState, { type: 'TIMER' }); // event object
console.log(nextState.value);
// => 'red'
```

By specifying the event type on the `type` property, many native events, such as DOM events, are compatible and can be used directly with XState:

```js
import { createMachine, interpret } from 'xstate';

const mouseMachine = createMachine({
  on: {
    mousemove: {
      actions: [
        (context, event) => {
          const { offsetX, offsetY } = event;
          console.log({ offsetX, offsetY });
        }
      ]
    }
  }
});
const mouseService = interpret(mouseMachine).start();

window.addEventListener('mousemove', (event) => {
  // event can be sent directly to service
  mouseService.send(event);
});
```

## Null Events

::: warning
The null event syntax `({ on: { '': ... } })` will be deprecated in version 5. The new [always](./transitions.md#eventless-always-transitions) syntax should be used instead.
:::

A null event is an event that has no type, and occurs immediately once a state is entered. In transitions, it is represented by an empty string (`''`):

```js
// contrived example
const skipMachine = createMachine({
  id: 'skip',
  initial: 'one',
  states: {
    one: {
      on: { CLICK: 'two' }
    },
    two: {
      // null event '' always occurs once state is entered
      // immediately take the transition to 'three'
      on: { '': 'three' }
    },
    three: {
      type: 'final'
    }
  }
});

const { initialState } = skipMachine;
const nextState = skipMachine.transition(initialState, 'CLICK');

console.log(nextState.value);
// => 'three'
```

<iframe src="https://xstate.js.org/viz/?gist=f8b1c6470371b13eb2838b84194ca428&embed=1"></iframe>

There are many use cases for null events, especially when defining [transient transitions](./transitions.md#transient-transitions), where a (potentially [transient](./statenodes.md#transient-state-nodes)) state immediately determines what the next state should be based on [conditions](./guards.md):

```js
const isAdult = ({ age }) => age >= 18;
const isMinor = ({ age }) => age < 18;

const ageMachine = createMachine({
  id: 'age',
  context: { age: undefined }, // age unknown
  initial: 'unknown',
  states: {
    unknown: {
      on: {
        // immediately take transition that satisfies conditional guard.
        // otherwise, no transition occurs
        '': [
          { target: 'adult', cond: isAdult },
          { target: 'child', cond: isMinor }
        ]
      }
    },
    adult: { type: 'final' },
    child: { type: 'final' }
  }
});

console.log(ageMachine.initialState.value);
// => 'unknown'

const personData = { age: 28 };

const personMachine = ageMachine.withContext(personData);

console.log(personMachine.initialState.value);
// => 'adult'
```

<iframe src="https://xstate.js.org/viz/?gist=2f9f2f4bd5dcd5ff262c7f2a7e9199aa&embed=1"></iframe>

## SCXML

Events in SCXML contain information relevant to the source of the event and have a different schema than event objects in XState. Internally, event objects are converted to SCXML events for compatibility.

SCXML events include:

- `name` - a character string giving the name of the event. This is equivalent to the `.type` property of an XState event.
- `type` - the event type: `'platform'`, `'external'`, or `'internal'`.
  - `platform` events are raised by the platform itself, such as error events.
  - `internal` events are raised by `raise(...)` actions or by `send(...)` actions with `target: '_internal'`.
  - `external` events describe all other events.
- `sendid` - the send ID of the triggering `send(...)` action.
- `origin` - a string that allows the receiver of this event to `send(...)` a response event back to the origin.
- `origintype` - used with `origin`
- `invokeid` - the invoke ID of the invocation that triggered the child service.
- `data` - any data that the sending entity chose to include with this event. This is equivalent to an XState event object.

The SCXML event form of all XState events is present in the `_event` property of action and guard meta objects (third argument):

```js {4-5,9-10}
// ...
{
  actions: {
    someAction: (context, event, { _event }) => {
      console.log(_event); // SCXML event
    };
  },
  guards: {
    someGuard: (context, event, { _event }) => {
      console.log(_event); // SCXML event
    }
  }
}
// ..
```
