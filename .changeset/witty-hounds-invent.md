---
'xstate': major
---

Removed support for `service.send(type, payload)`. We are using `send` API at multiple places and this was the only one supporting this shape of parameters. Additionally, it had not strict TS types and using it was unsafe (type-wise).
