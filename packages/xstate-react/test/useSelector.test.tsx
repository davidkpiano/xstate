import * as React from 'react';
import {
  AnyEventObject,
  assign,
  createMachine,
  interpret,
  Interpreter
} from 'xstate';
import { act, render, cleanup, fireEvent } from '@testing-library/react';
import { useInterpret, useSelector } from '../src';

afterEach(cleanup);

describe('useSelector', () => {
  it('only rerenders for selected values', () => {
    const machine = createMachine<{ count: number; other: number }>({
      initial: 'active',
      context: {
        other: 0,
        count: 0
      },
      states: {
        active: {}
      },
      on: {
        OTHER: {
          actions: assign({ other: (ctx) => ctx.other + 1 })
        },
        INCREMENT: {
          actions: assign({ count: (ctx) => ctx.count + 1 })
        }
      }
    });

    let rerenders = 0;

    const App = () => {
      const service = useInterpret(machine);
      const count = useSelector(service, (state) => state.context.count);

      rerenders++;

      return (
        <>
          <div data-testid="count">{count}</div>
          <button
            data-testid="other"
            onClick={() => service.send('OTHER')}
          ></button>
          <button
            data-testid="increment"
            onClick={() => service.send('INCREMENT')}
          ></button>
        </>
      );
    };

    const { getByTestId } = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    const countButton = getByTestId('count');
    const otherButton = getByTestId('other');
    const incrementEl = getByTestId('increment');

    fireEvent.click(incrementEl);

    rerenders = 0;

    fireEvent.click(otherButton);
    fireEvent.click(otherButton);
    fireEvent.click(otherButton);
    fireEvent.click(otherButton);

    expect(rerenders).toEqual(0);

    fireEvent.click(incrementEl);

    expect(countButton.textContent).toBe('2');
  });

  it('should work with a custom comparison function', () => {
    const machine = createMachine<{ name: string }>({
      initial: 'active',
      context: {
        name: 'david'
      },
      states: {
        active: {}
      },
      on: {
        CHANGE: {
          actions: assign({ name: (_, e) => e.value })
        }
      }
    });

    const App = () => {
      const service = useInterpret(machine);
      const name = useSelector(
        service,
        (state) => state.context.name,
        (a, b) => a.toUpperCase() === b.toUpperCase()
      );

      return (
        <>
          <div data-testid="name">{name}</div>
          <button
            data-testid="sendUpper"
            onClick={() => service.send({ type: 'CHANGE', value: 'DAVID' })}
          ></button>
          <button
            data-testid="sendOther"
            onClick={() => service.send({ type: 'CHANGE', value: 'other' })}
          ></button>
        </>
      );
    };

    const { getByTestId } = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    const nameEl = getByTestId('name');
    const sendUpperButton = getByTestId('sendUpper');
    const sendOtherButton = getByTestId('sendOther');

    expect(nameEl.textContent).toEqual('david');

    fireEvent.click(sendUpperButton);

    // unchanged due to comparison function
    expect(nameEl.textContent).toEqual('david');

    fireEvent.click(sendOtherButton);

    expect(nameEl.textContent).toEqual('other');

    fireEvent.click(sendUpperButton);

    expect(nameEl.textContent).toEqual('DAVID');
  });

  it('should recompute on actor changes ', () => {
    const machine = createMachine<{ count: number; other: number }>({
      initial: 'active',
      context: {
        other: 0,
        count: 0
      },
      states: {
        active: {}
      },
      on: {
        OTHER: {
          actions: assign({ other: (ctx) => ctx.other + 1 })
        },
        INCREMENT: {
          actions: assign({ count: (ctx) => ctx.count + 1 })
        }
      }
    });

    let rerenders = 0;

    const App = () => {
      const service1 = useInterpret(machine);
      const service2 = useInterpret(machine);
      const [service, setService] = React.useState(service1);

      const count = useSelector(service, (state) => state.context.count);

      rerenders++;

      return (
        <>
          <div data-testid="count">{count}</div>
          <button
            data-testid="toggle-service"
            onClick={() => {
              setService((service) =>
                service === service1 ? service2 : service1
              );
            }}
          ></button>
          <button
            data-testid="other"
            onClick={() => service.send('OTHER')}
          ></button>
          <button
            data-testid="increment"
            onClick={() => service.send('INCREMENT')}
          ></button>
        </>
      );
    };

    const { getByTestId } = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    const countButton = getByTestId('count');
    const otherButton = getByTestId('other');
    const incrementEl = getByTestId('increment');
    const toggleServiceButton = getByTestId('toggle-service');

    fireEvent.click(incrementEl);

    rerenders = 0;

    fireEvent.click(otherButton);
    fireEvent.click(otherButton);
    fireEvent.click(otherButton);
    fireEvent.click(otherButton);

    expect(rerenders).toEqual(0);

    fireEvent.click(incrementEl);

    expect(countButton.textContent).toBe('2');

    fireEvent.click(toggleServiceButton);

    expect(rerenders).not.toEqual(0);
    expect(countButton.textContent).toBe('0');
  });

  describe('deep behavior assertions', () => {
    type Context = { count: number; other: number };
    const machine = createMachine<Context>({
      initial: 'active',
      context: {
        other: 0,
        count: 0
      },
      states: {
        active: {}
      },
      on: {
        OTHER: {
          actions: assign({ other: (ctx) => ctx.other + 1 })
        },
        INCREMENT: {
          actions: assign({ count: (ctx) => ctx.count + 1 })
        }
      }
    });
    let service: Interpreter<
      Context,
      any,
      AnyEventObject,
      { value: any; context: Context }
    >;
    let returned: number[] = [];
    beforeEach(() => {
      returned = [];
    });

    test('events that do not change our selected value do not result in a rerender', () => {
      function App() {
        service = useInterpret(machine);
        returned.push(useSelector(service, (state) => state.context.count));
        return null;
      }

      render(<App />);
      expect(returned).toEqual([0]);

      act(() => {
        service.send({ type: 'OTHER' });
      });
      expect(returned).toEqual([0]);
    });

    test('events that change our selected value result in a single rerender', () => {
      function App() {
        service = useInterpret(machine);
        returned.push(
          useSelector(
            service,
            React.useCallback((state) => state.context.count, [])
          )
        );
        return null;
      }

      render(<App />);
      expect(returned).toEqual([0]);

      act(() => {
        service.send({ type: 'INCREMENT' });
      });
      expect(returned).toEqual([0, 1]);
    });

    test('changing the selector results in a rerender', () => {
      function App({ offset = 0 }) {
        service = useInterpret(machine);
        returned.push(
          useSelector(
            service,
            React.useCallback((state) => state.context.count + offset, [offset])
          )
        );
        return null;
      }

      const { rerender } = render(<App />);
      expect(returned).toEqual([0]);

      rerender(<App offset={2} />);
      expect(returned).toEqual([
        0,
        2, // new value is immediately recalculated and returned
        2 //  a rerender is executed because of useEffect()
      ]);
    });

    test('changing the actor results in a rerender', () => {
      let service: Interpreter<any, any, any, any>;
      function App({ use = 'one' }) {
        let one = useInterpret(machine);
        let two = useInterpret(machine);
        service = use === 'one' ? one : two;

        returned.push(
          useSelector(
            service,
            React.useCallback((state) => state.context.count, [])
          )
        );
        return null;
      }

      const { rerender } = render(<App use="one" />);
      expect(returned).toEqual([0]);

      act(() => {
        service.send({ type: 'INCREMENT' });
      });
      expect(returned).toEqual([0, 1]);

      service = interpret(machine);
      rerender(<App use="two" />);
      expect(returned).toEqual([
        0,
        1,
        0, // new value is immediately recalculated and returned
        0 //  a rerender is executed because of useEffect()
      ]);
    });

    test('changing the comparator results in a rerender', () => {
      function App({ epsilon = 0.1 }) {
        service = useInterpret(machine);
        returned.push(
          useSelector(
            service,
            React.useCallback((state) => state.context.count, []),
            React.useCallback((a, b) => Math.abs(a - b) < epsilon, [epsilon])
          )
        );
        return null;
      }

      const { rerender } = render(<App />);
      expect(returned).toEqual([0]);

      act(() => {
        service.send({ type: 'INCREMENT' });
      });
      expect(returned).toEqual([0, 1]);

      rerender(<App epsilon={2} />);
      expect(returned).toEqual([
        0,
        1,
        1 // rerender because of rerender()
      ]);

      act(() => {
        service.send({ type: 'INCREMENT' });
      });
      // no rerender, because now compare(1,2) === true
      expect(returned).toEqual([0, 1, 1]);
    });
  });
});
