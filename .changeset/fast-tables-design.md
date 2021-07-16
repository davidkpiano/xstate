---
'xstate': major
---

- The `execute` option for an interpreted service has been removed. If you don't want to execute actions, it's recommended that you don't hardcode implementation details into the base `machine` that will be interpreted, and extend the machine's `options.actions` instead. By default, the interpreter will execute all actions according to SCXML semantics (immediately upon transition).

- Dev tools integration has been simplified, and Redux dev tools support is no longer the default. It can be included from `xstate/devTools/redux`:

```js
import { interpret } from 'xstate';
import { createReduxDevTools } from 'xstate/devTools/redux';

const service = interpret(someMachine, {
  devTools: createReduxDevTools({
    // Redux Dev Tools options
  })
});
```

By default, dev tools are attached to the global `window.__xstate__` object:

```js
const service = interpret(someMachine, {
  devTools: true // attaches via window.__xstate__.register(service)
});
```

And creating your own custom dev tools adapter is a function that takes in the `service`:

```js
const myCustomDevTools = (service) => {
  console.log('Got a service!');

  service.subscribe((state) => {
    // ...
  });
};

const service = interpret(someMachine, {
  devTools: myCustomDevTools
});
```

- These handlers have been removed, as they are redundant and can all be accomplished with `.onTransition(...)` and/or `.subscribe(...)`:

  - `service.onEvent()`
  - `service.onSend()`
  - `service.onChange()`

- The `service.send(...)` method no longer returns the next state. It is a `void` function (fire-and-forget).

- The `service.sender(...)` method has been removed as redundant. Use `service.send(...)` instead.
