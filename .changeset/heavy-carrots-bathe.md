---
'xstate': patch
---

The `context` property has been removed from `StateNodeConfig`, as it has never been allowed, nor has it ever done anything. The previous typing was unsafe and allowed `context` to be specified on nested state nodes:

```ts
createMachine({
  context: {
    /* ... */
  }, // ✅ This is allowed
  initial: 'inner',
  states: {
    inner: {
      context: {
        /* ... */
      } // ❌ This will no longer compile
    }
  }
});
```
