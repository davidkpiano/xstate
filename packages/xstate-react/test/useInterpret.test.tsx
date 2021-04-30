import * as React from 'react';
import { createMachine, interpret } from 'xstate';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { useInterpret } from '../src';

afterEach(cleanup);

describe('useInterpret', () => {
  it('observer should be called with initial state', (done) => {
    const machine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            ACTIVATE: 'active'
          }
        },
        active: {}
      }
    });

    const App = () => {
      const service = useInterpret(machine);

      React.useEffect(() => {
        service.subscribe((state) => {
          expect(state.matches('inactive')).toBeTruthy();
          done();
        });
      }, [service]);

      return null;
    };

    render(<App />);
  });

  it('observer should be called with next state', (done) => {
    const machine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            ACTIVATE: 'active'
          }
        },
        active: {}
      }
    });

    const App = () => {
      const service = useInterpret(machine);

      React.useEffect(() => {
        service.subscribe((state) => {
          if (state.matches('active')) {
            done();
          }
        });
      }, [service]);

      return (
        <button
          data-testid="button"
          onClick={() => {
            service.send('ACTIVATE');
          }}
        ></button>
      );
    };

    const { getByTestId } = render(<App />);
    const button = getByTestId('button');

    fireEvent.click(button);
  });

  it('actions created by a layout effect should access the latest closure values', () => {
    const actual: number[] = [];

    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {
          on: {
            EXEC_ACTION: {
              actions: 'recordProp'
            }
          }
        }
      }
    });

    const App = ({ value }: { value: number }) => {
      const service = useInterpret(machine, {
        actions: {
          recordProp: () => actual.push(value)
        }
      });

      React.useLayoutEffect(() => {
        service.send('EXEC_ACTION');
      });

      return null;
    };

    const { rerender } = render(<App value={1} />);

    rerender(<App value={42} />);

    expect(actual).toEqual([1, 42]);
  });

  it('should behave the same as `interpret` when initial context is not defined', (done) => {
    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {}
      }
    });

    const interpretService = interpret(machine);

    const App = () => {
      const useInterpretService = useInterpret(machine);

      expect(useInterpretService.machine.context).toEqual(
        interpretService.machine.context
      );
      done();

      return null;
    };

    render(<App />);
  });

  it('does not set a context object when there was none in the definition', () => {
    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {}
      }
    });

    const { result } = renderHook(() => useInterpret(machine));
    expect(result.current.machine.context).toBeUndefined();
  });

  it('does set context object when provided as a config param, even when there was none in the definition', () => {
    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {}
      }
    });

    const { result } = renderHook(() => useInterpret(machine, { context: {} }));
    expect(result.current.machine.context).not.toBeUndefined();
  });

  it('can extend the default context object', () => {
    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {}
      },
      context: {
        num: 1
      }
    });

    const { result } = renderHook(() =>
      useInterpret(machine, { context: { num: 2 } })
    );
    expect(result.current.machine.context).toEqual({ num: 2 });
  });
});
