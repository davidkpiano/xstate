import { createMachine, actions } from 'xstate';

const m = createMachine({
  initial: 'a',
  states: {
    a: {
      id: 'a',
      exit: actions.raise('s'),
      on: {
        t: 'b'
      }
    },
    b: {
      id: 'b',
      on: {
        s: 'c'
      }
    },
    c: {
      id: 'c'
    }
  }
});

export default m;
