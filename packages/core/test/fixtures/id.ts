import { createMachine } from '../../src';

export const machine = createMachine({
  initial: 'A',
  states: {
    A: {
      id: 'A',
      initial: 'foo',
      states: {
        foo: {
          id: 'A_foo',
          on: {
            NEXT: '#A_bar'
          }
        },
        bar: {
          id: 'A_bar',
          on: {
            NEXT: '#B_foo'
          }
        }
      }
    },
    B: {
      id: 'B',
      initial: 'foo',
      states: {
        foo: {
          id: 'B_foo',
          on: {
            NEXT: '#B_bar',
            NEXT_DOT: '#B.dot'
          }
        },
        bar: {
          id: 'B_bar',
          on: {
            NEXT: '#A_foo'
          }
        },
        dot_custom: {
          id: 'B.dot'
        }
      }
    }
  }
});
