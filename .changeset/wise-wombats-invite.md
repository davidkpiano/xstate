---
'xstate': major
---

`Machine#transition` no longer handles invalid state values such as values containing non-existent state regions. If you rehydrate your machines and change machine's schema then you should migrate your data accordingly on your own.
