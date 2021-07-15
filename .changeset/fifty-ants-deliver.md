---
'@xstate/graph': minor
'@xstate/test': patch
---

Adding event meta to the arguments for a test event execution. This should allow more flexibility for reusing the same event execution logic with a different config. For example, filling out multiple fields with random text where the only thing that changes is the input selector.
