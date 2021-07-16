---
'xstate': major
---

The `Machine()` function has been removed. Use the `createMachine()` function instead.

```diff
-import { Machine } from 'xstate';
+import { createMachine } from 'xstate';

-const machine = Machine({
+const machine = createMachine({
  // ...
});
```
