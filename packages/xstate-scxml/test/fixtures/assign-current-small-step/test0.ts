import { createMachine, assign } from 'xstate';

export default createMachine<any>({
  initial: 'a',
  context: {
    x: undefined
  },
  states: {
    a: {
      id: 'a',
      entry: [assign({ x: -1 }), assign({ x: 99 })],
      on: {
        t: {
          target: 'b',
          guard: (ctx) => {
            return ctx.x === 99;
          },
          actions: assign({
            x: (ctx) => ctx.x + 1
          })
        }
      }
    },
    b: {
      // entry: ctx => {
      //   ctx.x *= 2;
      // },
      entry: assign({
        x: (ctx) => ctx.x * 2
      }),
      on: {
        '': [
          {
            target: 'c',
            guard: (ctx) => ctx.x === 200
          },
          { target: 'f' }
        ]
      }
    },
    c: {
      id: 'c'
    },
    f: {}
  }
});
