---
'xstate': major
---

The machine's `context` is now restricted to an `object`. This was the most common usage, but now the typings prevent `context` from being anything but an object:

```ts
const machine = createMachine({
  // This will produce the TS error:
  // "Type 'string' is not assignable to type 'object | undefined'"
  context: 'some string'
});
```

If `context` is `undefined`, it will now default to an empty object `{}`:

```ts
const machine = createMachine({
  // No context
});

machine.initialState.context;
// => {}
```
