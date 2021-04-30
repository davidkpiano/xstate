import { render, fireEvent } from '@testing-library/svelte';
import UseMachine from './UseMachine.svelte';
import UseNoContextMachine from './UseMachine.NoContext.svelte';
import { fetchMachine } from './fetchMachine';
import { doneInvoke } from 'xstate';

const persistedFetchState = fetchMachine.transition(
  'loading',
  doneInvoke('fetchData', 'persisted data')
);

const persistedFetchStateConfig = JSON.parse(
  JSON.stringify(persistedFetchState)
);

describe('useMachine function', () => {
  it('should work with a component', async () => {
    const { getByText, findByText, getByTestId } = render(UseMachine);
    const button = getByText('Fetch');
    await fireEvent.click(button);
    await findByText('Loading...');
    await findByText(/Success/);
    const dataEl = getByTestId('data');
    expect(dataEl.textContent).toBe('some data');
  });

  it('should work with a component with rehydrated state', async () => {
    const { findByText, getByTestId } = render(UseMachine, {
      persistedState: persistedFetchState
    });
    await findByText(/Success/);
    const dataEl = getByTestId('data');
    expect(dataEl.textContent).toBe('persisted data');
  });

  it('should work with a component with rehydrated state config', async () => {
    const { findByText, getByTestId } = render(UseMachine, {
      persistedState: persistedFetchStateConfig
    });
    await findByText(/Success/);
    const dataEl = getByTestId('data');
    expect(dataEl.textContent).toBe('persisted data');
  });

  it('does not set a context object when there was none in the definition', async () => {
    const { findByText, getByTestId } = render(UseNoContextMachine);
    await findByText(/context is/);
    const resultEl = getByTestId('context');
    expect(resultEl.textContent).toBe('context is undefined');
  });
});
