import { createMachine, actions } from 'xstate';

const m = createMachine({
  initial: 'a',
  states: {
    a: {
      id: 'a',
      on: { t: 'b' }
    },
    b: {
      entry: actions.raise('s'),
      on: {
        '': 'f1',
        s: 'c'
      }
    },
    c: {
      on: {
        '': 'd',
        s: 'f2'
      }
    },
    f1: {
      id: 'f1'
    },
    d: {},
    f2: {}
  }
});

export default m;
