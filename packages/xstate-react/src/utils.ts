export const DIFFERENT_MACHINE_WARNING_MESSAGE =
  'Machine given to `useMachine` has changed between renders. This is not supported and might lead to unexpected results.\n' +
  "Please make sure that you pass the same Machine as argument each time. Also keep in mind that `useMemo` can't be used for this kind of caching as per https://reactjs.org/docs/hooks-reference.html#usememo";
