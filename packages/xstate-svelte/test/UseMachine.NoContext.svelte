<script lang="ts">
  import { useMachine } from '../src';
  import { noContextMachine } from './noContextMachine';

  const { state } = useMachine(noContextMachine);
</script>

<div data-testid="context">
  {#if $state.context === undefined}context is undefined{:else}context is defined{/if}
</div>
