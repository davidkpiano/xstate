---
'xstate': major
---

Support for getters as a transition target (instead of referencing state nodes by ID or relative key) has been removed.

The `Machine()` and `createMachine()` factory functions no longer support passing in `context` as a third argument.

The `context` property in the machine configuration no longer accepts a function for determining context (which was introduced in 4.7). This might change as the API becomes finalized.

The `activities` property was removed from `State` objects, as activities are now part of `invoke` declarations.

The state nodes will not show the machine's `version` on them - the `version` property is only available on the root machine node.

The `machine.withContext({...})` method now permits providing partial context, instead of the entire machine context.
