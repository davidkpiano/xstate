import { createMachine, actions } from '../../src';
const { assign } = actions;

// @ts-ignore
const factorialMachine = createMachine<{ n: number; fac: number }>({
  initial: 'iteration',
  context: { n: 5, fac: 1 },
  states: {
    iteration: {
      on: {
        ITERATE: [
          {
            target: 'iteration',
            guard: (xs) => xs.n > 0,
            actions: [
              assign({
                fac: (xs) => xs.n * xs.fac,
                n: (xs) => xs.n - 1
              })
            ]
          },
          { target: 'done' }
        ]
      }
    },
    done: {
      entry: [(xs) => console.log(`The answer is ${xs.fac}`)]
    }
  }
});

// @ts-ignore
const testMachine = createMachine<{ count: number }>({
  context: { count: 11 },
  initial: 'init',
  states: {
    init: {
      on: {
        ADD: [
          {
            target: 'one',
            guard: (xs) => xs.count === 1
          },
          {
            target: 'init',
            guard: (xs) => xs.count % 2 === 0,
            actions: [
              assign({
                count: (xs) => xs.count / 2
              })
            ]
          },
          {
            target: 'init',
            actions: [
              assign({
                count: (xs) => xs.count * 3 + 1
              })
            ]
          }
        ]
      }
    },
    one: {}
  }
});
