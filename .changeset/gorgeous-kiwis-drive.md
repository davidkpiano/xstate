---
'xstate': patch
---

This update restricts invoked `Subscribable`s to `EventObject`s,
so that type inference can be done on which `Subscribable`s are
allowed to be invoked. Existing `MachineConfig`s that invoke
`Subscribable<any>`s that are not `Subscribable<EventObject>`s
should be updated accordingly.
