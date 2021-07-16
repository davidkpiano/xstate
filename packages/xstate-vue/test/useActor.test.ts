import { render, fireEvent, waitFor } from '@testing-library/vue';
import UseActor from './UseActor.vue';
import UseActorSimple from './UseActorSimple.vue';
import UseActorCreateSimple from './UseActorCreateSimple.vue';
import UseActorComponentProp from './UseActorComponentProp.vue';

import { createMachine, interpret, sendParent } from 'xstate';
import { invokeMachine } from 'xstate/invoke';

describe('useActor composable function', () => {
  it('initial invoked actor should be immediately available', async () => {
    const { getByTestId } = render(UseActor);

    const machineStateEl = getByTestId('machine-state');
    const actorStateEl = getByTestId('actor-state');

    expect(machineStateEl.textContent).toBe('active');
    expect(actorStateEl.textContent).toBe('active');
  });

  it('invoked actor in a standalone component should be able to receive events', async () => {
    const childMachine = createMachine({
      id: 'childMachine',
      initial: 'active',
      states: {
        active: {
          on: {
            FINISH: { actions: sendParent('FINISH') }
          }
        }
      }
    });
    const machine = createMachine({
      initial: 'active',
      invoke: {
        id: 'child',
        src: invokeMachine(childMachine)
      },
      states: {
        active: {
          on: { FINISH: 'success' }
        },
        success: {}
      }
    });

    const serviceMachine = interpret(machine).start();

    const { getByTestId } = render(UseActorComponentProp, {
      props: { actor: serviceMachine.state.children.child }
    });

    const actorStateEl = getByTestId('actor-state');
    expect(actorStateEl.textContent).toBe('active');

    await waitFor(() => expect(serviceMachine.state.value).toBe('success'));
  });

  it('actor should provide snapshot value immediately', () => {
    const { getByTestId } = render(UseActorSimple);

    const stateEl = getByTestId('state');
    expect(stateEl.textContent).toEqual('42');
  });

  it('should update snapshot value when actor changes', async () => {
    const { getByTestId } = render(UseActorCreateSimple);

    const stateEl = getByTestId('state');
    const button = getByTestId('button');

    expect(stateEl.textContent).toEqual('42');
    await fireEvent.click(button);
    expect(stateEl.textContent).toEqual('100');
  });
});
