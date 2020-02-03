---
'@xstate/react': patch
---

Revert using `useLayoutEffect` in hooks as it isn't available on servers and wasn't that much needed for our use case.
