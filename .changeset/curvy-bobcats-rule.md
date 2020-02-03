---
'@xstate/react': patch
---

Added dev-only warning to `useMachine` about receiving different machines between renders. Used machine is tied to a component for its entire lifetime and swapping machines between renders is not supported. Keep in mind that if you create a machine in render it might not be enough to wrap it in `useMemo` because "You may rely on useMemo as a performance optimization, not as a semantic guarantee." as per [React docs](https://reactjs.org/docs/hooks-reference.html#usememo).
