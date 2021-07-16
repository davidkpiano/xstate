---
'xstate': major
---

All generic types containing `TContext` and `TEvent` will now follow the same, consistent order:

1. `TContext`
2. `TEvent`
3. ... All other generic types, including `TStateSchema,`TTypestate`, etc.

```diff
-const service = interpret<SomeCtx, SomeSchema, SomeEvent>(someMachine);
+const service = interpret<SomeCtx, SomeEvent, SomeSchema>(someMachine);
```
