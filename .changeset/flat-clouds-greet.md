---
'xstate': major
---

The `in: ...` property for transitions is removed and replaced with guards. It is recommended to use `stateIn()` and `stateNotIn()` guard creators instead:

```diff
+ import { stateIn } from 'xstate/guards';

// ...
on: {
  SOME_EVENT: {
    target: 'somewhere',
-   in: '#someState'
+   cond: stateIn('#someState')
  }
}
// ...
```
