---
'xstate': major
---

Simplified invoke definition: the `invoke` property of a state definition will now only accept an `InvokeCreator`, which is a function that takes in context, event, and meta (parent, id, etc.) and returns an `Actor`.

```diff
- invoke: someMachine
+ invoke: spawnMachine(someMachine)

- invoke: (ctx, e) => somePromise
+ invoke: spawnPromise((ctx, e) => somePromise)

- invoke: (ctx, e) => (cb, receive) => { ... }
+ invoke: spawnCallback((ctx, e) => (cb, receive) => { ... })

- invoke: (ctx, e) => someObservable$
+ invoke: spawnObservable((ctx, e) => someObservable$)
```

This also includes a helper function for spawning activities:

```diff
- activity: (ctx, e) => { ... }
+ invoke: spawnActivity((ctx, e) => { ... })
```
