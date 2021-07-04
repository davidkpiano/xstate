# Hierarchical State Nodes

Statecharts, by definition, are hierarchical - that is to say, they:

- enable refinement of state
- can group similar transitions
- allow isolation
- encourage composability
- and prevent state explosion, which frequently occurs in normal finite state machines.

In XState, state and machine configuration share a common schema, allowing machines to be _substates_ and for states to be infinitely nested.

Here's an example of a traffic light machine with nested states:

```js
const pedestrianStates = {
  initial: 'walk',
  states: {
    walk: {
      on: {
        PED_COUNTDOWN: { target: 'wait' }
      }
    },
    wait: {
      on: {
        PED_COUNTDOWN: { target: 'stop' }
      }
    },
    stop: {},
    blinking: {}
  }
};

const lightMachine = createMachine({
  key: 'light',
  initial: 'green',
  states: {
    green: {
      on: {
        TIMER: { target: 'yellow' }
      }
    },
    yellow: {
      on: {
        TIMER: { target: 'red' }
      }
    },
    red: {
      on: {
        TIMER: { target: 'green' }
      },
      ...pedestrianStates
    }
  },
  on: {
    POWER_OUTAGE: { target: '.red.blinking' },
    POWER_RESTORED: { target: '.red' }
  }
});
```

<iframe src="https://xstate.js.org/viz/?gist=e8af8924afe9352bf7d1e06f06407061&embed=1"></iframe>

The `'green'` and `'yellow'` states are **simple states** - they have no child states. In contrast, the `'red'` state is a **composite state** since it is composed of **substates** (the `pedestrianStates`).

To transition from an initial state, use `machine.initialState`:

```js
console.log(
  lightMachine.transition(lightMachine.initialState, { type: 'TIMER' }).value
);
// => 'yellow'
```

When a composite state is entered, its initial state is immediately entered as well. In the following example:

- the `'red'` state is entered
- since `'red'` has an initial state of `'walk'`, the `{ red: 'walk' }` state is ultimately entered.

```js
console.log(lightMachine.transition('yellow', { type: 'TIMER' }).value);
// => {
//   red: 'walk'
// }
```

When a simple state does not handle an `event`, that `event` is propagated up to its parent state to be handled. In the following example:

- the `{ red: 'stop' }` state does _not_ handle the `'TIMER'` event
- the `'TIMER'` event is sent to the `'red'` parent state, which does handle it.

```js
console.log(lightMachine.transition({ red: 'stop' }, { type: 'TIMER' }).value);
// => 'green'
```

If neither a state nor any of its ancestor (parent) states handle an event, no transition happens. In `strict` mode (specified in the [machine configuration](./machines.md#configuration)), this will throw an error.

```js
console.log(lightMachine.transition('green', { type: 'UNKNOWN' }).value);
// => 'green'
```
