import { testAll } from './utils';
import { Machine } from '../src';

const idMachine = Machine({
  initial: 'A',
  states: {
    A: {
      initial: 'foo',
      states: {
        foo: {
          initial: 'bar',
          states: {
            bar: {
              on: {
                NEXT: '^dot'
              }
            }
          }
        },
        dot: {
          on: {
            NEXT: '^B'
          }
        }
      }
    },
    B: {
      initial: 'foo',
      states: {
        foo: {
          initial: 'baz',
          states: {
            baz: {
              on: {
                NEXT: '^dot'
              }
            }
          }
        },
        dot: {
          on: {
            NEXT: '^A.foo.bar'
          }
        }
      }
    }
  }
});

describe('Parent sibling state selector', () => {
  const expected = {
    A: {
      NEXT: 'A.dot'
    },
    'A.dot': {
      NEXT: 'B'
    },
    B: {
      NEXT: 'B.dot'
    },
    'B.dot': {
      NEXT: 'A.foo.bar'
    }
  };

  testAll(idMachine, expected);
});
