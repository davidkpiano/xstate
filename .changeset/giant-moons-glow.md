---
'xstate': major
---

There is now support for higher-level guards, which are guards that can compose other guards:

- `and([guard1, guard2, /* ... */])` returns `true` if _all_ guards evaluate to truthy, otherwise `false`
- `or([guard1, guard2, /* ... */])` returns `true` if _any_ guard evaluates to truthy, otherwise `false`
- `not(guard1)` returns `true` if a single guard evaluates to `false`, otherwise `true`

```js
import { and, or, not } from 'xstate/guards';

const someMachine = createMachine({
  // ...
  on: {
    EVENT: {
      target: 'somewhere',
      guard: and([
        'stringGuard',
        or([{ type: 'anotherGuard' }, not(() => false)])
      ])
    }
  }
});
```
