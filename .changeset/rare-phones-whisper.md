---
'xstate': minor
---

Support for specifying states deep in the hierarchy has been added for the `initial` property. It's also now possible to specify multiple states as initial ones - so you can enter multiple descandants which have to be **parallel** to each other. Keep also in mind that you can only target descendant states with the `initial` property - it's not possible to target states from another regions.

Those are now possible:

```js
{
  initial: '#some_id',
  initial: ['#some_id', '#another_id'],
  initial: { target: '#some_id' },
  initial: { target: ['#some_id', '#another_id'] },
}
```
