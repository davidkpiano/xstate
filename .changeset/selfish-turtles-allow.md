---
'@xstate/react': patch
---

Make useSelector() recompute the value if the actor reference changes.
Always use getSnapshot() to extract the state from an actor.
