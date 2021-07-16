---
'xstate': major
---

An error will be thrown if an `initial` state key is not specified for compound state nodes. For example:

```js
const lightMachine = createMachine({
  id: 'light',
  initial: 'green',
  states: {
    green: {},
    yellow: {},
    red: {
      // Forgotten initial state:
      // initial: 'walk',
      states: {
        walk: {},
        wait: {}
      }
    }
  }
});
```

You will get the error:

```
No initial state specified for state node "#light.red". Try adding { initial: "walk" } to the state config.
```
