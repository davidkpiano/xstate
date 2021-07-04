# Final States

A final state node indicates the completion of a part of the statechart, or the entire statechart. Specifically, it indicates that its parent compound state node is "done." If the parent is the root statechart, then the entire statechart is "done," and any further execution is stopped.

This has many useful use-cases. To indicate that a state node is final, set its `type` property to `'final'`:

```js
const lightMachine = createMachine({
  id: 'light',
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
      type: 'parallel',
      states: {
        crosswalkNorth: {
          initial: 'walk',
          states: {
            walk: {
              on: {
                PED_WAIT: { target: 'wait' }
              }
            },
            wait: {
              on: {
                PED_STOP: { target: 'stop' }
              }
            },
            stop: {
              // 'stop' is a final state node for 'crosswalkNorth'
              type: 'final'
            }
          },
          onDone: {
            actions: 'stopCrosswalkNorth'
          }
        },
        crosswalkEast: {
          initial: 'walk',
          states: {
            walk: {
              on: {
                PED_WAIT: { target: 'wait' }
              }
            },
            wait: {
              on: {
                PED_STOP: { target: 'stop' }
              }
            },
            stop: {
              type: 'final'
            }
          },
          onDone: {
            // 'stop' is a final state node for 'crosswalkEast'
            actions: 'stopCrosswalkEast'
          }
        }
      },
      onDone: 'green'
    }
  }
});
```

In a compound state, reaching a final child state node (with `{ type: 'final' }`) will internally raise a `done(...)` event for that compound state node (e.g., `"done.state.light.crosswalkEast"`). Using `onDone` is equivalent to defining a transition for this event.

## Parallel states

When every child state node in a parallel state node is _done_, the parent parallel state node is also _done_. That is, when every final state node in every child compound node is reached, the `done(...)` event will be raised for the parallel state node.

This is very useful in modeling parallel tasks. For example, suppose `user` and `items` represent two parallel tasks of the `cart` state:

```js
const shoppingMachine = createMachine({
  id: 'shopping',
  initial: 'cart',
  states: {
    cart: {
      type: 'parallel',
      states: {
        user: {
          initial: 'pending',
          states: {
            pending: {
              entry: 'getUser',
              on: {
                RESOLVE_USER: { target: 'success' },
                REJECT_USER: { target: 'failure' }
              }
            },
            success: { type: 'final' },
            failure: {}
          }
        },
        items: {
          initial: 'pending',
          states: {
            pending: {
              entry: 'getItems',
              on: {
                RESOLVE_ITEMS: { target: 'success' },
                REJECT_ITEMS: { target: 'failure' }
              }
            },
            success: { type: 'final' },
            failure: {}
          }
        }
      },
      onDone: 'confirm'
    },
    confirm: {
      // ...
    }
  }
});
```

Only when all of the child states of `'cart'` (e.g., `'user'` and `'items'`) are in their final states will the `onDone` transition take place. In this case, once the `'shopping.cart.user.success'` and `'shopping.cart.items.success'` state nodes are reached, the machine will transition from the `'cart'` to the `'confirm'` state.

::: warning

The `onDone` transition cannot be defined on the root node of the machine. This is because `onDone` is a transition on a `'done.state.*'` event, and when a machine reaches its final state, it can no longer accept any event.

:::

## SCXML

Final states correspond to the SCXML spec: [https://www.w3.org/TR/scxml/#final](https://www.w3.org/TR/scxml/#final)

## Notes

- A final state node only indicates that its immediate parent is _done_. It does not affect the _done_ status of any higher parents, except with parallel state nodes, which are _done_ when all of its child compound state nodes are _done_.
- A parallel state that reaches a final substate does not stop receiving events until all its siblings are done. The final substate can still be exited with an event.
- Final state nodes cannot have any children. They are atomic state nodes.
- You can specify `entry` and `exit` actions on final state nodes.
