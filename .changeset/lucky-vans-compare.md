---
'xstate': major
---

The history resolution algorithm has been refactored to closely match the SCXML algorithm, which changes the shape of `state.historyValue` to map history state node IDs to their most recently resolved target state nodes.
