---
'xstate': major
---

Prefix wildcard event descriptors are now supported. These are event descriptors ending with `".*"` which will match all events that start with the prefix (the partial event type before `".*"`):

```js
// ...
on: {
  'mouse.click': {/* ... */},
  // Matches events such as:
  // "pointer.move"
  // "pointer.move.out"
  // "pointer"
  'pointer.*': {/* ... */}
}
// ...
```

Note: wildcards are only valid as the entire event type (`"*"`) or at the end of an event type, preceded by a period (`".*"`):

- ✅ `"*"`
- ✅ `"event.*"`
- ✅ `"event.something.*"`
- ❌ ~`"event.*.something"`~
- ❌ ~`"event*"`~
- ❌ ~`"event*.some*thing"`~
- ❌ ~`"*.something"`~
