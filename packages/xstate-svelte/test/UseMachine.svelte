<script lang="ts">
  export let persistedState: State<any> | undefined = undefined;

  import { useMachine } from '../src';
  import { fetchMachine } from './fetchMachine';
  import type { State } from 'xstate';
  import { invokePromise } from 'xstate/invoke';

  const onFetch = () =>
    new Promise((res) => setTimeout(() => res('some data'), 50));

  const { state, send } = useMachine(fetchMachine, {
    actors: {
      fetchData: invokePromise(onFetch)
    },
    state: persistedState
  });
</script>

<div>
  {#if $state.matches('idle')}
    <button on:click={() => send('FETCH')}>Fetch</button>
  {:else if $state.matches('loading')}
    <div>Loading...</div>
  {:else if $state.matches('success')}
    <div>
      Success! Data:
      <div data-testid="data">{$state.context.data}</div>
    </div>
  {/if}
</div>
