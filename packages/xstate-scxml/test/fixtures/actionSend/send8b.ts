import { createMachine, actions } from 'xstate';

export default createMachine({
  initial: 'a',
  states: {
    a: {
      id: 'a',
      on: {
        t: {
          target: '#b1',
          actions: actions.raise('s')
        }
      }
    },
    b: {
      initial: 'b1',
      states: {
        b1: {
          id: 'b1',
          on: {
            s: 'b2'
          }
        },
        b2: {
          id: 'b2'
        },
        b3: {
          id: 'b3'
        }
      }
    }
  }
});
