import { useState } from 'react';
import * as React from 'react';
import { useService, useMachine } from '../src';
import {
  assign,
  interpret,
  Interpreter,
  createMachine,
  sendParent,
  ActorRef
} from 'xstate';
import { render, fireEvent, act } from '@testing-library/react';
import { useActor } from '../src/useActor';
import { invokeMachine } from 'xstate/invoke';

describe('useService hook', () => {
  const counterMachine = createMachine<
    { count: number },
    { type: 'INC' } | { type: 'SOMETHING' }
  >(
    {
      id: 'counter',
      initial: 'active',
      context: { count: 0 },
      states: {
        active: {
          on: {
            INC: { actions: assign({ count: (ctx) => ctx.count + 1 }) },
            SOMETHING: { actions: 'doSomething' }
          }
        }
      }
    },
    {
      actions: {
        doSomething: () => {
          /* do nothing */
        }
      }
    }
  );

  it('should share a single service instance', () => {
    const counterService = interpret(counterMachine).start();

    const Counter = () => {
      const [state] = useService(counterService);

      return <div data-testid="count">{state.context.count}</div>;
    };

    const { getAllByTestId } = render(
      <>
        <Counter />
        <Counter />
      </>
    );

    const countEls = getAllByTestId('count');

    expect(countEls.length).toBe(2);

    countEls.forEach((countEl) => {
      expect(countEl.textContent).toBe('0');
    });

    act(() => {
      counterService.send('INC');
    });

    countEls.forEach((countEl) => {
      expect(countEl.textContent).toBe('1');
    });
  });

  it('service should be updated when it changes', () => {
    const counterService1 = interpret(counterMachine).start();
    const counterService2 = interpret(counterMachine).start();

    const Counter = ({ counterRef }) => {
      const [state, send] = useService<{ count: number }, any>(counterRef);

      return (
        <>
          <button data-testid="inc" onClick={(_) => send('INC')} />
          <div data-testid="count">{state.context.count}</div>
        </>
      );
    };
    const CounterParent = () => {
      const [service, setService] = useState(counterService1);

      return (
        <>
          <button
            data-testid="change-service"
            onClick={() => setService(counterService2)}
          />
          <Counter counterRef={service} />
        </>
      );
    };

    const { getByTestId } = render(<CounterParent />);

    const changeServiceButton = getByTestId('change-service');
    const incButton = getByTestId('inc');
    const countEl = getByTestId('count');

    expect(countEl.textContent).toBe('0');
    fireEvent.click(incButton);
    expect(countEl.textContent).toBe('1');
    fireEvent.click(changeServiceButton);
    expect(countEl.textContent).toBe('0');
  });

  it('service should be able to be used from useMachine', () => {
    const CounterDisplay: React.FC<{
      service: Interpreter<any>;
    }> = ({ service }) => {
      const [state] = useService(service);

      return <div data-testid="count">{state.context.count}</div>;
    };

    const Counter = () => {
      const [, send, service] = useMachine(counterMachine);

      return (
        <>
          <button data-testid="inc" onClick={(_) => send('INC')} />
          <CounterDisplay service={service} />
        </>
      );
    };

    const { getByTestId } = render(<Counter />);

    const incButton = getByTestId('inc');
    const countEl = getByTestId('count');

    expect(countEl.textContent).toBe('0');
    fireEvent.click(incButton);
    expect(countEl.textContent).toBe('1');
  });

  it('initial invoked actor should be immediately available', (done) => {
    const childMachine = createMachine({
      id: 'childMachine',
      initial: 'active',
      states: {
        active: {}
      }
    });
    const machine = createMachine({
      initial: 'active',
      invoke: {
        id: 'child',
        src: invokeMachine(childMachine)
      },
      states: {
        active: {}
      }
    });

    const ChildTest: React.FC<{ actor: ActorRef<any> }> = ({ actor }) => {
      const [state] = useActor(actor);

      expect(state.value).toEqual('active');
      done();
      return null;
    };

    const Test = () => {
      const [state] = useMachine(machine);

      return <ChildTest actor={state.children.child} />;
    };

    render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );
  });

  it('should throw if provided an actor instead of a service', (done) => {
    const Test = () => {
      expect(() => {
        useService({
          send: () => {
            /* ... */
          }
        } as any);
      }).toThrowErrorMatchingInlineSnapshot(
        `"Attempted to use an actor-like object instead of a service in the useService() hook. Please use the useActor() hook instead."`
      );
      done();

      return null;
    };

    render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );
  });

  it('invoked actor should be able to receive (deferred) events that it replays when active', (done) => {
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

    const ChildTest: React.FC<{ actor: ActorRef<any> }> = ({ actor }) => {
      const [state, send] = useActor(actor);

      expect(state.value).toEqual('active');

      React.useEffect(() => {
        send({ type: 'FINISH' });
      }, []);

      return null;
    };

    const Test = () => {
      const [state] = useMachine(machine);

      if (state.matches('success')) {
        done();
      }

      return <ChildTest actor={state.children.child} />;
    };

    render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );
    render(<Test />);
  });

  it('should render the final state', () => {
    const service = interpret(
      createMachine<any, { type: 'NEXT' }>({
        initial: 'first',
        states: {
          first: {
            on: {
              NEXT: {
                target: 'last'
              }
            }
          },
          last: {
            type: 'final'
          }
        }
      })
    ).start();

    service.send('NEXT');

    const Test = () => {
      const [state] = useService(service);
      return <>{state.value}</>;
    };

    const { container } = render(<Test />);

    expect(container.textContent).toBe('last');
  });

  it('service should accept the 2-argument variant', () => {
    const service = interpret(
      createMachine<{ value: number }, { type: 'EVENT'; value: number }>({
        initial: 'first',
        states: {
          first: {
            on: {
              EVENT: {
                target: 'second',
                guard: (_, e) => e.value === 42
              }
            }
          },
          second: {}
        }
      })
    ).start();

    const Test = () => {
      const [state, send] = useService(service);

      return (
        <>
          <div data-testid="value">{state.value}</div>
          <button
            data-testid="button"
            onClick={() => send('EVENT', { value: 42 })}
          ></button>
        </>
      );
    };

    const { getByTestId } = render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );

    const button = getByTestId('button');
    const value = getByTestId('value');

    fireEvent.click(button);

    expect(value.textContent).toBe('second');
  });
});
