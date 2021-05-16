---
'xstate': major
---

The `each()` action creator has been added for SCXML compatibility:

```js
// ...
context: {
  todos: [/* ... */],
  todo: null, // will be populated by `each` action
  currentTodo: null // will be populated by `each` action
}
actions: each([
  (context, event) => {
    console.log({
      todo,
      currentTodo
    });
  },
  // ... action objects
], {
  array: 'todos',
  item: 'todo',
  index: 'currentTodo'
})
// ...
```
