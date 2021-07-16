---
'xstate': major
---

The interface for guard objects has changed. Notably, all guard parameters should be placed in the `params` property of the guard object:

Example taken from [Custom Guards](https://xstate.js.org/docs/guides/guards.html#custom-guards):

```diff
-cond: {
+guard: {
- name: 'searchValid', // `name` property no longer used
  type: 'searchValid',
- minQueryLength: 3
+ params: {
+   minQueryLength: 3
+ }
}
```
