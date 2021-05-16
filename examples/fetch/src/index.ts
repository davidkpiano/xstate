import { createMachine, interpret } from 'xstate';

const fetchMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        FETCH: 'loading'
      }
    },
    loading: {}
  }
});

const fetchService = interpret(fetchMachine)
  .onTransition((state) => {
    console.log(state);
  })
  .start();

fetchService.send('FETCH');
