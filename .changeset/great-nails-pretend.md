---
'@xstate/react': major
---

Machines passed to `useMachine` are now always started **immediately** so it's possible to read their whole state and send events to them right away. If you have relied on them being started after mount (in `useEffect`) then you must adjust your logic.

When creating machines to be used in combination with `useMachine` you should still consider React rules and avoid side effects from happening before mount.
