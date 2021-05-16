---
'xstate': major
---

Events sent from the `send(...)` action creator will now add the send action's `id` to the `.sendid` property on the sent SCXML event:

```js
// Will send an SCXML event with:
// `{ name: 'SOME_EVENT', data: { ... }, sendid: 'someId' }`
actions: send('SOME_EVENT', {
  id: 'someId'
});
```
