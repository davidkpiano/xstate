---
'@xstate/react': minor
---

Required version of `@xstate/fsm` has been changed to `^1.3.0` which introduced a way to define actions as strings that can be looked up in an `options` object passed to it. You can now provide this `options` object (which currently only supports `actions` map) as a second argument to `useMachine` hook. This is a recommended way of providing actions which need to reference a component's props (or other closure variables) to a used machine.
