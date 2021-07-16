---
'xstate': major
---

- The third argument of `machine.transition(state, event)` has been removed. The `context` should always be given as part of the `state`.

- There is a new method: `machine.microstep(state, event)` which returns the resulting intermediate `State` object that represents a single microstep being taken when transitioning from `state` via the `event`. This is the `State` that does not take into account transient transitions nor raised events, and is useful for debugging.

- The `state.events` property has been removed from the `State` object, and is replaced internally by `state._internalQueue`, which represents raised events to be processed in a macrostep loop. The `state._internalQueue` property should be considered internal (not used in normal development).

- The `state.historyValue` property now more closely represents the original SCXML algorithm, and is a mapping of state node IDs to their historic descendent state nodes. This is used for resolving history states, and should be considered internal.

- The `stateNode.isTransient` property is removed from `StateNode`.

- The `.initial` property of a state node config object can now contain executable content (i.e., actions):

```js
// ...
initial: {
  target: 'someTarget',
  actions: [/* initial actions */]
}
```

- Assign actions (via `assign()`) will now be executed "in order", rather than automatically prioritized. They will be evaluated after previously defined actions are evaluated, and actions that read from `context` will have those intermediate values applied, rather than the final resolved value of all `assign()` actions taken, which was the previous behavior.

This shouldn't change the behavior for most state machines. To maintain the previous behavior, ensure that `assign()` actions are defined before any other actions.
