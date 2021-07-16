import { createMachine, assign } from 'xstate';

const context = {
  data: undefined
};

export const fetchMachine = createMachine<typeof context, any>({
  id: 'fetch',
  initial: 'idle',
  context,
  states: {
    idle: {
      on: { FETCH: 'loading' }
    },
    loading: {
      invoke: {
        src: 'fetchData',
        id: 'fetchData',
        onDone: {
          target: 'success',
          actions: assign({
            data: (_, e) => e.data
          }),
          guard: (_, e) => e.data.length
        }
      }
    },
    success: {
      type: 'final'
    }
  }
});
