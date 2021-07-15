import * as React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { fromReducer } from 'xstate/lib/fst';
import { useActor } from '../src/useActor';
import { useFST } from '../src/useFST';

describe('useFST', () => {
  it('should work with an FST', () => {
    const fst = fromReducer((count, _event: any) => {
      return count + 1;
    }, 0);

    const App = () => {
      const actor = useFST(fst);
      const [count, send] = useActor(actor);

      return (
        <>
          <button data-testid="button" onClick={() => send({ type: 'INC' })}>
            INC
          </button>
          <div data-testid="count">{count}</div>
        </>
      );
    };

    const { getByTestId } = render(<App />);

    const button = getByTestId('button');
    const countDiv = getByTestId('count');

    expect(countDiv.textContent).toEqual('0');

    fireEvent.click(button);

    expect(countDiv.textContent).toEqual('1');
  });
});
