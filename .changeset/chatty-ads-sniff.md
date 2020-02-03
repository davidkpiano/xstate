---
'@xstate/react': major
---

`useActor` has been removed, it had subscribed to actors' events rather than state which has not been playing OK with React model. If you have been using it then please [open an issue](https://github.com/davidkpiano/xstate/issues/new) so we can discuss your use case and provide replacements.
