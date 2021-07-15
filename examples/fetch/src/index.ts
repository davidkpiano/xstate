import { assign, createMachine, interpret } from 'xstate';

function fetchRandomDog(): Promise<{ message: string; status: string }> {
  return fetch('https://dog.ceo/api/breeds/image/random').then((response) =>
    response.json()
  );
}

interface FetchContext {
  image: string | null;
}

const fetchMachine = createMachine({
  initial: 'idle',
  context: {
    image: null
  },
  states: {
    idle: {
      on: {
        FETCH: 'loading'
      }
    },
    loading: {
      invoke: {
        id: 'dogFetch',
        src: (context, event) => fetchRandomDog(),
        onDone: {
          target: 'success',
          actions: assign({
            image: (_, event) => event.data.message
          })
        },
        onError: {
          target: 'failure'
        }
      }
    },
    success: {
      on: {
        RETRY: 'loading'
      }
    },
    failure: {
      on: {
        RETRY: 'loading'
      }
    }
  }
});

const fetchService = interpret(fetchMachine)
  .onTransition((state) => {
    console.log(state.value, state.context);
  })
  .start();

fetchService.send('FETCH');
