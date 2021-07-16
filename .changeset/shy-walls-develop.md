---
'xstate': major
---

Support for compound string state values has been dropped from Machine's transition method. It's no longer allowed to call transition like this - `machine.transition('a.b', 'NEXT')`, instead it's required to use "state value" representation like this - `machine.transition({ a: 'b' }, 'NEXT')`.
