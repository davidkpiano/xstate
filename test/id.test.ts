import { testAll } from './utils';
import { Machine } from '../src';
import { assert } from 'chai';

const idMachine = Machine({
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
      },
      on: {
        NEXT_ON_OUTER: '#B_bar'
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
            NEXT_BAZ: '#B_baz'
          }
        },
        bar: {
          id: 'B_bar',
          on: {
            NEXT: '#A_foo'
          }
        },
        baz: {
          id: 'B_baz'
        }
      }
    },
    getter: {
      on: {
        get NEXT() {
          return idMachine.states.A;
        },
        get NEXT_DEEP() {
          return idMachine.states.A.states.foo;
        },
        NEXT_TARGET: {
          get target() {
            return idMachine.states.B;
          }
        },
        NEXT_TARGET_ARRAY: [
          {
            get target() {
              return idMachine.states.B;
            }
          }
        ]
      }
    }
  }
});

describe('State node IDs', () => {
  const expected = {
    A: {
      NEXT: 'A.bar',
      NEXT_ON_OUTER: 'B.bar'
    },
    '#A': {
      NEXT: 'A.bar'
    },
    'A.foo': {
      NEXT: 'A.bar'
    },
    '#A_foo': {
      NEXT: 'A.bar'
    },
    'A.bar': {
      NEXT: 'B.foo'
    },
    '#A_bar': {
      NEXT: 'B.foo'
    },
    'B.foo': {
      'NEXT,NEXT': 'A.foo',
      NEXT_BAZ: 'B.baz'
    },
    '#B_foo': {
      'NEXT,NEXT': 'A.foo'
    },

    // With getters
    getter: {
      NEXT: 'A',
      NEXT_DEEP: 'A.foo',
      NEXT_TARGET: 'B',
      NEXT_TARGET_ARRAY: 'B'
    }
  };

  testAll(idMachine, expected);

  it('should work with referencing a sibling + a relative path from it', () => {
    const brokenMachine = Machine({
      initial: 'foo',
      states: {
        foo: {
          id: 'foo',
          on: {
            ACTION: 'bar.qux.quux'
          }
        },
        bar: {
          id: 'bar',
          states: {
            baz: {},
            qux: {
              states: {
                quux: {},
              },
            }
          }
        }
      }
    });

    assert.deepEqual(brokenMachine.transition('foo', 'ACTION').value, {
      bar: { qux: 'quux' }
    });
  });
});
