---
'xstate': patch
---

Added a runtime warning for "unreachable" `onDone` for parallel states. For it to have an effect all of its children states must have a final substate.
