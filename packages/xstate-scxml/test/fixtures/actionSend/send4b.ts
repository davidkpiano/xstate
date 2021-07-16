import { createMachine, actions } from 'xstate';

export default createMachine({
  initial: 'a',
  states: {
    a: {
      id: 'a',
      on: { t: 'b' }
    },
    b: {
      entry: actions.raise('s'),
      on: {
        s: 'c'
      }
    },
    c: {
      id: 'c'
    }
  }
});
