import { createMachine } from '../../src';

const omniMachine = createMachine({
  id: 'omni',
  initial: 'compound',
  context: {
    count: 0
  },
  states: {
    compound: {
      type: 'compound',
      initial: 'deep',
      states: {
        deep: {
          type: 'compound',
          initial: 'first',
          states: {
            first: {
              type: 'compound',
              initial: 'one',
              states: {
                one: {},
                two: {},
                three: {
                  type: 'final'
                }
              }
            },
            second: {
              type: 'final'
            },
            shallowHist: {
              type: 'history',
              history: 'shallow'
            },
            deepHist: {
              type: 'history',
              history: 'deep'
            }
          }
        }
      }
    },
    parallel: {
      type: 'parallel',
      states: {
        left: {
          type: 'compound',
          states: {
            one: {},
            two: {},
            three: { type: 'final' }
          }
        },
        middle: {
          type: 'compound',
          states: {
            one: {
              after: {
                1000: 'two'
              }
            },
            two: {
              after: {
                2000: [
                  { target: 'three', guard: (ctx) => ctx.count === 3 },
                  { target: 'four', guard: (ctx) => ctx.count === 4 },
                  { target: 'one' }
                ]
              }
            },
            three: {
              after: {
                1000: [{ target: 'one', guard: (ctx) => ctx.count === -1 }],
                2000: 'four'
              }
            },
            four: { type: 'final' }
          }
        },
        right: {
          type: 'compound',
          states: {
            transient: {
              always: 'one'
            },
            transientCond: {
              always: [
                { target: 'two', guard: (ctx) => ctx.count === 2 },
                { target: 'three', guard: (ctx) => ctx.count === 3 },
                { target: 'one' }
              ]
            },
            one: {},
            two: {},
            three: {},
            four: { type: 'final' }
          }
        }
      }
    }
  }
});

export { omniMachine };
