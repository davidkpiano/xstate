---
'xstate': patch
---

Fixed an issue with TypeScript types that has caused `MachineConfig` parametrized with a subset of events not being accepted as part of the `MachineConfig` accepting the whole set of those events.
