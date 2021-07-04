# History

A history [state node](./statenodes.md) is a special kind of state node that, when reached, tells the machine to go to the last state value of that region. There are two types of history states:

- `'shallow'`, which specifies only the top-level history value, or
- `'deep'`, which specifies the top-level and all child-level history values.

## History State Configuration

The configuration for a history state is the same as an atomic state node, with some extra properties:

- `type: 'history'` to specify that this is a history state node
- `history` ('shallow' | 'deep') - whether the history is shallow or deep. Defaults to 'shallow'.
- `target` (StateValue) - the default target if no history exists. Defaults to the initial state value of the parent node.

Consider the following (contrived) statechart:

```js
const fanMachine = createMachine({
  id: 'fan',
  initial: 'fanOff',
  states: {
    fanOff: {
      on: {
        // transitions to history state
        POWER: { target: 'fanOn.hist' },
        HIGH_POWER: { target: 'fanOn.highPowerHist' }
      }
    },
    fanOn: {
      initial: 'first',
      states: {
        first: {
          on: {
            SWITCH: { target: 'second' }
          }
        },
        second: {
          on: {
            SWITCH: { target: 'third' }
          }
        },
        third: {},

        // shallow history state
        hist: {
          type: 'history',
          history: 'shallow' // optional; default is 'shallow'
        },

        // shallow history state with default
        highPowerHist: {
          type: 'history',
          target: 'third'
        }
      },
      on: {
        POWER: { target: 'fanOff' }
      }
    }
  }
});
```

In the above machine, the transition from `'fanOff'` on the event `'POWER'` goes to the `'fanOn.hist'` state, which is defined as a shallow history state. This means that the machine should transition to the `'fanOn'` state and to whichever the previous substate of `'fanOn'` was. By default, `'fanOn'` will go to its initial state, `'first'`, if there is no history state.

```js
const firstState = fanMachine.transition(fanMachine.initialState, {
  type: 'POWER'
});
console.log(firstState.value);
// transitions to the initial state of 'fanOn' since there is no history
// => {
//   fanOn: 'first'
// }

const secondState = fanMachine.transition(firstState, { type: 'SWITCH' });
console.log(secondState.value);
// => {
//   fanOn: 'second'
// }

const thirdState = fanMachine.transition(secondState, { type: 'POWER' });
console.log(thirdState.value);
// => 'fanOff'

console.log(thirdState.history);
// => State {
//   value: { fanOn: 'second' },
//   actions: []
// }

const fourthState = fanMachine.transition(thirdState, { type: 'POWER' });
console.log(fourthState.value);
// transitions to 'fanOn.second' from history
// => {
//   fanOn: 'second'
// }
```

With a `target` specified, if no history exists for the state region the history state is defined in, it will go to the `target` state by default:

```js
const firstState = fanMachine.transition(fanMachine.initialState, {
  type: 'HIGH_POWER'
});
console.log(firstState.value);
// transitions to the target state of 'fanOn.third' since there is no history
// => {
//   fanOn: 'third'
// }
```

## Notes

- History states can be directly accessed from `State` instances on `state.history`, but this is seldom necessary.
