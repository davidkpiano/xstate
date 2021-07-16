---
'xstate': major
---

BREAKING: The `cond` property in transition config objects has been renamed to `guard`. This unifies terminology for guarded transitions and guard predicates (previously called "cond", or "conditional", predicates):

```diff
someState: {
  on: {
    EVENT: {
      target: 'anotherState',
-     cond: 'isValid'
+     guard: 'isValid'
    }
  }
}
```
