---
'xstate': major
---

The `internal` property will no longer have effect for transitions on atomic (leaf-node) state nodes. In SCXML, `internal` only applies to complex (compound and parallel) state nodes:

> Determines whether the source state is exited in transitions whose target state is a descendant of the source state. [See 3.13 Selecting and Executing Transitions for details.](https://www.w3.org/TR/scxml/#SelectingTransitions)

```diff
// ...
green: {
  on: {
    NOTHING: {
-     target: 'green',
-     internal: true,
      actions: doSomething
    }
  }
}
```
