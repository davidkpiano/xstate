---
'xstate': major
---

- Breaking: activities removed (can be invoked)

Since activities can be considered invoked services, they can be implemented as such. Activities are services that do not send any events back to the parent machine, nor do they receive any events, other than a "stop" signal when the parent changes to a state where the activity is no longer active. This is modeled the same way as a callback service is modeled.
