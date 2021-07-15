# State Nodes

A state machine contains state nodes (explained below) that collectively describe the [overall state](./states.md) a machine can be in. In the `fetchMachine` described in the next section, there are **state nodes**, such as:

```js
// ...
{
  states: {
    // state node
    idle: {
      on: {
        FETCH: {
          target: 'pending';
        }
      }
    }
  }
}
```

And the overall **state**, which is the return value of the `machine.transition()` function or the callback value of `service.onTransition()`:

```js
const nextState = fetchMachine.transition('pending', { type: 'FULFILL' });
// State {
//   value: { success: 'items' },
//   actions: [],
//   context: undefined,
//   ...
// }
```

## State nodes

In XState, a **state node** specifies a state configuration. They are defined on the machine's `states` property. Likewise, sub-state nodes are hierarchically defined on the `states` property of a state node.

The state determined from `machine.transition(state, event)` represents a combination of state nodes. For example, in the machine below, there's a `success` state node and an `items` substate node. The state value `{ success: 'items' }` represents the combination of those state nodes.

```js
const fetchMachine = createMachine({
  id: 'fetch',

  // Initial state
  initial: 'idle',

  // States
  states: {
    idle: {
      on: {
        FETCH: { target: 'pending' }
      }
    },
    pending: {
      on: {
        FULFILL: { target: 'success' },
        REJECT: { target: 'failure' }
      }
    },
    success: {
      // Initial child state
      initial: { target: 'items' },

      // Child states
      states: {
        items: {
          on: {
            'ITEM.CLICK': { target: 'item' }
          }
        },
        item: {
          on: {
            BACK: { target: 'items' }
          }
        }
      }
    },
    failure: {
      on: {
        RETRY: { target: 'pending' }
      }
    }
  }
});
```

<iframe src="https://xstate.js.org/viz/?gist=932f6d193fa9d51afe31b236acf291c9&embed=1"></iframe>

## State Node Types

There are five different kinds of state nodes:

- An **atomic** state node has no child states. (I.e., it is a leaf node.)
- A **compound** state node contains one or more child `states`, and has an `initial` state, which is the key of one of those child states.
- A **parallel** state node contains two or more child `states`, and has no initial state, since it represents being in all of its child states at the same time.
- A **final** state node is a leaf node that represents an abstract "terminal" state.
- A **history** state node is an abstract node that represents resolving to its parent node's most recent shallow or deep history state.

The state node type can be explicitly defined on the state node:

```js
const machine = createMachine({
  id: 'fetch',
  initial: 'idle',
  states: {
    idle: {
      type: 'atomic',
      on: {
        FETCH: { target: 'pending' }
      }
    },
    pending: {
      type: 'parallel',
      states: {
        resource1: {
          type: 'compound',
          initial: 'pending',
          states: {
            pending: {
              on: {
                'FULFILL.resource1': { target: 'success' }
              }
            },
            success: {
              type: 'final'
            }
          }
        },
        resource2: {
          type: 'compound',
          initial: 'pending',
          states: {
            pending: {
              on: {
                'FULFILL.resource2': { target: 'success' }
              }
            },
            success: {
              type: 'final'
            }
          }
        }
      },
      onDone: 'success'
    },
    success: {
      type: 'compound',
      initial: 'items',
      states: {
        items: {
          on: {
            'ITEM.CLICK': { target: 'item' }
          }
        },
        item: {
          on: {
            BACK: { target: 'items' }
          }
        },
        hist: {
          type: 'history',
          history: 'shallow'
        }
      }
    }
  }
});
```

<iframe src="https://xstate.js.org/viz/?gist=75cc77b35e98744e8d10902147feb313&embed=1"></iframe>

Explicitly specifying the `type` as `'atomic'`, `'compound'`, `'parallel'`, `'history'`, or `'final'` is helpful with regard to analysis and type-checking in TypeScript. However, it is only required for parallel, history, and final states.

## Transient State Nodes

A transient state node is a "pass-through" state node that immediately transitions to another state node; that is, a machine does not stay in a transient state. Transient state nodes are useful for determining which state the machine should really go to from a previous state based on conditions. They are most similar to [choice pseudostates](https://www.uml-diagrams.org/state-machine-diagrams.html#choice-pseudostate) in UML.

The best way to define a transient state node is as an eventless state, and an `always` transition. This is a transition where the first condition that evaluates to true is immediately taken.

For example, this machine's initial transient state resolves to `'morning'`, `'afternoon'`, or `'evening'`, depending on what time it is (implementation details hidden):

```js{9-15}
const timeOfDayMachine = createMachine({
  id: 'timeOfDay',
  initial: 'unknown',
  context: {
    time: undefined
  },
  states: {
    // Transient state
    unknown: {
      always: [
        { target: 'morning', cond: 'isBeforeNoon' },
        { target: 'afternoon', cond: 'isBeforeSix' },
        { target: 'evening' }
      ]
    },
    morning: {},
    afternoon: {},
    evening: {}
  }
}, {
  guards: {
    isBeforeNoon: // ...
    isBeforeSix: // ...
  }
});

const timeOfDayService = interpret(timeOfDayMachine.withContext({ time: Date.now() }))
  .onTransition(state => console.log(state.value))
  .start();

// => 'morning' (assuming the time is before noon)
```

<iframe src="https://xstate.js.org/viz/?gist=ca6a3f84f585c3e9cd6aadc3ae00b886&embed=1"></iframe>

::: warning
The event object of a transition to a transient state is not available in the conditions or actions
defined under the null event. In the example above, `isBeforeNoon` and `isBeforeSix` would receive `{ type: '' }` as the
second parameter, not the initial event type and data that transitioned to `unknown`.
:::

## State Node Meta Data

Meta data, which is static data that describes relevant properties of any [state node](./statenodes.md), can be specified on the `.meta` property of the state node:

```js {19-21,24-26,32-34,37-39,42-44}
const fetchMachine = createMachine({
  id: 'fetch',
  initial: 'idle',
  states: {
    idle: {
      on: {
        FETCH: { target: 'loading' }
      }
    },
    loading: {
      after: {
        3000: { target: 'failure.timeout' }
      },
      on: {
        RESOLVE: { target: 'success' },
        REJECT: { target: 'failure' },
        TIMEOUT: { target: 'failure.timeout' } // manual timeout
      },
      meta: {
        message: 'Loading...'
      }
    },
    success: {
      meta: {
        message: 'The request succeeded!'
      }
    },
    failure: {
      initial: 'rejection',
      states: {
        rejection: {
          meta: {
            message: 'The request failed.'
          }
        },
        timeout: {
          meta: {
            message: 'The request timed out.'
          }
        }
      },
      meta: {
        alert: 'Uh oh.'
      }
    }
  }
});
```

The current state of the machine collects the `.meta` data of all of the state nodes represented by the state value, and places them on an object where:

- The keys are the [state node IDs](./ids.md)
- The values are the state node `.meta` values

See [state meta data](./states.md#state-meta-data) for usage and more information.
