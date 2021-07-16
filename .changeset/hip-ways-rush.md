---
'xstate': major
---

The `in: '...'` transition property can now be replaced with `stateIn(...)` and `stateNotIn(...)` guards, imported from `xstate/guards`:

```diff
import {
  createMachine,
+ stateIn
} from 'xstate/guards';

const machine = createMachine({
  // ...
  on: {
    SOME_EVENT: {
      target: 'anotherState',
-     in: '#someState',
+     cond: stateIn('#someState')
    }
  }
})
```

The `stateIn(...)` and `stateNotIn(...)` guards also can be used the same way as `state.matches(...)`:

```js
// ...
SOME_EVENT: {
  target: 'anotherState',
  cond: stateNotIn({ red: 'stop' })
}
```

---

An error will now be thrown if the `assign(...)` action is executed when the `context` is `undefined`. Previously, there was only a warning.

---

The SCXML event `error.execution` will be raised if assignment in an `assign(...)` action fails.

---

Error events raised by the machine will be _thrown_ if there are no error listeners registered on a service via `service.onError(...)`.
