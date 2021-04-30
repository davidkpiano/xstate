import { render, fireEvent, waitFor } from '@testing-library/vue';
import { defineComponent } from 'vue';
import { createMachine, interpret } from 'xstate';
import { useInterpret } from '../src';
import UseInterpret from './UseInterpret.vue';

describe('useInterpret composable function', () => {
  it('observer should be called with initial state', async () => {
    const { getByTestId } = render(UseInterpret);

    const buttonEl = getByTestId('button');
    await waitFor(() => expect(buttonEl.textContent).toBe('Turn on'));
  });

  it('observer should be called with next state', async () => {
    const { getByTestId } = render(UseInterpret);

    const buttonEl = getByTestId('button');

    await waitFor(() => expect(buttonEl.textContent).toBe('Turn on'));
    await fireEvent.click(buttonEl);
    await waitFor(() => expect(buttonEl.textContent).toBe('Turn off'));
  });

  it('should behave the same as `interpret` when initial context is not defined', (done) => {
    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {}
      }
    });

    const interpretService = interpret(machine);

    const App = defineComponent({
      setup() {
        const useInterpretService = useInterpret(machine);

        expect(useInterpretService.machine.context).toEqual(
          interpretService.machine.context
        );
        done();
      },
      template: 'foo'
    });

    render(App);
  });
});
