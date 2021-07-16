import * as React from 'react';
import { useMachine, useService, useActor } from '../src';
import {
  assign,
  Interpreter,
  doneInvoke,
  State,
  createMachine,
  send,
  spawnPromise,
  ActorRefFrom
} from 'xstate';
import { render, fireEvent, waitForElement, act } from '@testing-library/react';
import { useState } from 'react';
import { invokePromise, invokeCallback, invokeMachine } from 'xstate/invoke';
import { asEffect, asLayoutEffect } from '../src/useMachine';
import { DoneEventObject } from 'xstate';

describe('useMachine hook', () => {
  const context = {
    data: undefined
  };
  const fetchMachine = createMachine<
    typeof context,
    { type: 'FETCH' } | DoneEventObject
  >({
    id: 'fetch',
    initial: 'idle',
    context,
    states: {
      idle: {
        on: { FETCH: 'loading' }
      },
      loading: {
        invoke: {
          src: 'fetchData',
          onDone: {
            target: 'success',
            actions: assign({
              data: (_, e) => e.data
            }),
            guard: (_, e) => e.data.length
          }
        }
      },
      success: {
        type: 'final'
      }
    }
  });

  const persistedFetchState = fetchMachine.transition('loading', {
    type: 'done.invoke.fetch.loading:invocation[0]',
    data: 'persisted data'
  });

  const Fetcher: React.FC<{
    onFetch: () => Promise<any>;
    persistedState?: State<any, any>;
  }> = ({
    onFetch = () => new Promise((res) => res('some data')),
    persistedState
  }) => {
    const [current, send] = useMachine(fetchMachine, {
      actors: {
        fetchData: invokePromise(onFetch)
      },
      state: persistedState
    });

    switch (current.value) {
      case 'idle':
        return <button onClick={(_) => send('FETCH')}>Fetch</button>;
      case 'loading':
        return <div>Loading...</div>;
      case 'success':
        return (
          <div>
            Success! Data: <div data-testid="data">{current.context.data}</div>
          </div>
        );
      default:
        return null;
    }
  };

  it('should work with the useMachine hook', async () => {
    const { getByText, getByTestId } = render(
      <Fetcher onFetch={() => new Promise((res) => res('fake data'))} />
    );
    const button = getByText('Fetch');
    fireEvent.click(button);
    getByText('Loading...');
    await waitForElement(() => getByText(/Success/));
    const dataEl = getByTestId('data');
    expect(dataEl.textContent).toBe('fake data');
  });

  it('should work with the useMachine hook (rehydrated state)', async () => {
    const { getByText, getByTestId } = render(
      <Fetcher
        onFetch={() => new Promise((res) => res('fake data'))}
        persistedState={persistedFetchState}
      />
    );

    await waitForElement(() => getByText(/Success/));
    const dataEl = getByTestId('data');
    expect(dataEl.textContent).toBe('persisted data');
  });

  it('should work with the useMachine hook (rehydrated state config)', async () => {
    const persistedFetchStateConfig = JSON.parse(
      JSON.stringify(persistedFetchState)
    );
    const { getByText, getByTestId } = render(
      <Fetcher
        onFetch={() => new Promise((res) => res('fake data'))}
        persistedState={persistedFetchStateConfig}
      />
    );

    await waitForElement(() => getByText(/Success/));
    const dataEl = getByTestId('data');
    expect(dataEl.textContent).toBe('persisted data');
  });

  it('should provide the service', () => {
    const Test = () => {
      const [, , service] = useMachine(fetchMachine);

      if (!(service instanceof Interpreter)) {
        throw new Error('service not instance of Interpreter');
      }

      return null;
    };

    render(<Test />);
  });

  it('should provide options for the service', () => {
    const Test = () => {
      const [, , service] = useMachine(fetchMachine, {
        execute: false
      });

      expect(service.options.execute).toBe(false);

      return null;
    };

    render(<Test />);
  });

  it('should merge machine context with options.context', () => {
    const testMachine = createMachine<{ foo: string; test: boolean }>({
      context: {
        foo: 'bar',
        test: false
      },
      initial: 'idle',
      states: {
        idle: {}
      }
    });

    const Test = () => {
      const [state] = useMachine(testMachine, {
        context: { test: true }
      });

      expect(state.context).toEqual({
        foo: 'bar',
        test: true
      });

      return null;
    };

    render(<Test />);
  });

  it('should not spawn actors until service is started', async (done) => {
    const spawnMachine = createMachine<any>({
      id: 'spawn',
      initial: 'start',
      context: { ref: undefined },
      states: {
        start: {
          entry: assign({
            ref: () =>
              spawnPromise(() => new Promise((res) => res(42)), 'my-promise')
          }),
          on: {
            [doneInvoke('my-promise')]: 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const Spawner = () => {
      const [current] = useMachine(spawnMachine);

      switch (current.value) {
        case 'start':
          return <span data-testid="start" />;
        case 'success':
          return <span data-testid="success" />;
        default:
          return null;
      }
    };

    const { getByTestId } = render(<Spawner />);
    await waitForElement(() => getByTestId('success'));
    done();
  });

  it('actions should not have stale data', async (done) => {
    const toggleMachine = createMachine<any, { type: 'TOGGLE' }>({
      initial: 'inactive',
      states: {
        inactive: {
          on: { TOGGLE: 'active' }
        },
        active: {
          entry: 'doAction'
        }
      }
    });

    const Toggle = () => {
      const [ext, setExt] = useState(false);

      const doAction = React.useCallback(() => {
        expect(ext).toBeTruthy();
        done();
      }, [ext]);

      const [, send] = useMachine(toggleMachine, {
        actions: {
          doAction
        }
      });

      return (
        <>
          <button
            data-testid="extbutton"
            onClick={(_) => {
              setExt(true);
            }}
          />
          <button
            data-testid="button"
            onClick={(_) => {
              send('TOGGLE');
            }}
          />
        </>
      );
    };

    const { getByTestId } = render(<Toggle />);

    const button = getByTestId('button');
    const extButton = getByTestId('extbutton');
    fireEvent.click(extButton);

    fireEvent.click(button);
  });

  it('should compile with typed matches (createMachine)', () => {
    interface TestContext {
      count?: number;
      user?: { name: string };
    }

    type TestState =
      | {
          value: 'loading';
          context: { count: number; user: undefined };
        }
      | {
          value: 'loaded';
          context: { user: { name: string } };
        };

    const machine = createMachine<TestContext, any, TestState>({
      initial: 'loading',
      states: {
        loading: {
          initial: 'one',
          states: {
            one: {},
            two: {}
          }
        },
        loaded: {}
      }
    });

    const ServiceApp: React.FC<{
      service: Interpreter<TestContext, any, TestState>;
    }> = ({ service }) => {
      const [state] = useService(service);

      if (state.matches('loaded')) {
        const name = state.context.user.name;

        // never called - it's okay if the name is undefined
        expect(name).toBeTruthy();
      } else if (state.matches('loading')) {
        // Make sure state isn't "never" - if it is, tests will fail to compile
        expect(state).toBeTruthy();
      }

      return null;
    };

    const App = () => {
      const [state, , service] = useMachine(machine);

      if (state.matches('loaded')) {
        const name = state.context.user.name;

        // never called - it's okay if the name is undefined
        expect(name).toBeTruthy();
      } else if (state.matches('loading')) {
        // Make sure state isn't "never" - if it is, tests will fail to compile
        expect(state).toBeTruthy();
      }

      return <ServiceApp service={service} />;
    };

    // Just testing that it compiles
    render(<App />);
  });

  it('should capture all actions', (done) => {
    let count = 0;

    const machine = createMachine<any, { type: 'EVENT' }>({
      initial: 'active',
      states: {
        active: {
          on: {
            EVENT: {
              actions: asEffect(() => {
                count++;
              })
            }
          }
        }
      }
    });

    const App = () => {
      const [stateCount, setStateCount] = useState(0);
      const [state, send] = useMachine(machine);

      React.useEffect(() => {
        send('EVENT');
        send('EVENT');
        send('EVENT');
        send('EVENT');
      }, []);

      React.useEffect(() => {
        setStateCount((c) => c + 1);
      }, [state]);

      return <div data-testid="count">{stateCount}</div>;
    };

    const { getByTestId } = render(<App />);

    const countEl = getByTestId('count');

    // Component should only rerender twice:
    // - 1 time for the initial state
    // - and 1 time for the four (batched) events
    expect(countEl.textContent).toEqual('2');
    expect(count).toEqual(4);
    done();
  });

  it('should capture initial actions', (done) => {
    let count = 0;

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          entry: asEffect(() => {
            count++;
          })
        }
      }
    });

    const App = () => {
      useMachine(machine);

      return <div />;
    };

    render(<App />);

    expect(count).toEqual(1);
    done();
  });

  it('effects should happen after normal actions', (done) => {
    const order: string[] = [];

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          entry: [
            asEffect(() => {
              order.push('effect');
            }),
            () => {
              order.push('non-effect');
            }
          ]
        }
      }
    });

    const App = () => {
      useMachine(machine);

      return <div />;
    };

    render(<App />);

    expect(order).toEqual(['non-effect', 'effect']);
    done();
  });

  it('layout effects should happen after normal actions', (done) => {
    const order: string[] = [];

    const machine = createMachine(
      {
        initial: 'active',
        states: {
          active: {
            entry: [
              asEffect(() => {
                order.push('effect');
              }),
              () => {
                order.push('non-effect');
              },
              asLayoutEffect(() => {
                order.push('layout effect');
              }),
              'stringEffect',
              'stringLayoutEffect'
            ]
          }
        }
      },
      {
        actions: {
          stringEffect: asEffect(() => {
            order.push('string effect');
          }),
          stringLayoutEffect: asLayoutEffect(() => {
            order.push('string layout effect');
          })
        }
      }
    );

    const App = () => {
      useMachine(machine);

      return <div />;
    };

    render(<App />);

    expect(order).toEqual([
      'non-effect',
      'layout effect',
      'string layout effect',
      'effect',
      'string effect'
    ]);
    done();
  });

  it('initial effect actions should execute during the very first commit phase', (done) => {
    let commitPhaseCounter = 0;

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          entry: [
            asLayoutEffect(() => {
              expect(commitPhaseCounter).toBe(1);
            }),
            asEffect(() => {
              expect(commitPhaseCounter).toBe(1);
            })
          ]
        }
      }
    });

    const App = () => {
      React.useLayoutEffect(() => {
        commitPhaseCounter++;
      });
      useMachine(machine);

      return <div />;
    };

    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    done();
  });

  it('should accept a lazily created machine', () => {
    const App = () => {
      const [state] = useMachine(() =>
        createMachine({
          initial: 'idle',
          states: {
            idle: {}
          }
        })
      );

      expect(state.matches('idle')).toBeTruthy();

      return null;
    };

    render(<App />);
  });

  it('should not miss initial synchronous updates', () => {
    const m = createMachine<{ count: number }>({
      initial: 'idle',
      context: {
        count: 0
      },
      entry: [assign({ count: 1 }), send('INC')],
      on: {
        INC: {
          actions: [assign({ count: (ctx) => ++ctx.count }), send('UNHANDLED')]
        }
      },
      states: {
        idle: {}
      }
    });

    const App = () => {
      const [state] = useMachine(m);
      return <>{state.context.count}</>;
    };

    const { container } = render(<App />);

    expect(container.textContent).toBe('2');
  });

  // TODO
  it.skip('should only render once when initial microsteps are involved', () => {
    let rerenders = 0;

    const m = createMachine<{ stuff: number[] }>(
      {
        initial: 'init',
        context: { stuff: [1, 2, 3] },
        states: {
          init: {
            entry: 'setup',
            always: 'ready'
          },
          ready: {}
        }
      },
      {
        actions: {
          setup: assign({
            stuff: (context) => [...context.stuff, 4]
          })
        }
      }
    );

    const App = () => {
      useMachine(m);
      rerenders++;
      return null;
    };

    render(<App />);

    expect(rerenders).toBe(1);
  });

  // TODO
  it.skip('should maintain the same reference for objects created when resolving initial state', () => {
    let effectsFired = 0;

    const m = createMachine<{ counter: number; stuff: number[] }>(
      {
        initial: 'init',
        context: { counter: 0, stuff: [1, 2, 3] },
        states: {
          init: {
            entry: 'setup'
          }
        },
        on: {
          INC: {
            actions: 'increase'
          }
        }
      },
      {
        actions: {
          setup: assign({
            stuff: (context) => [...context.stuff, 4]
          }),
          increase: assign({
            counter: (context) => ++context.counter
          })
        }
      }
    );

    const App = () => {
      const [state, send] = useMachine(m);

      // this effect should only fire once since `stuff` never changes
      React.useEffect(() => {
        effectsFired++;
      }, [state.context.stuff]);

      return (
        <>
          <div>{`Counter: ${state.context.counter}`}</div>
          <button onClick={() => send('INC')}>Increase</button>
        </>
      );
    };

    const { getByRole } = render(<App />);

    expect(effectsFired).toBe(1);

    const button = getByRole('button');
    fireEvent.click(button);

    expect(effectsFired).toBe(1);
  });
});

describe('useMachine (strict mode)', () => {
  it('should not invoke initial services more than once', () => {
    let activatedCount = 0;
    const machine = createMachine({
      initial: 'active',
      invoke: {
        src: invokeCallback(() => {
          activatedCount++;
          return () => {
            /* empty */
          };
        })
      },
      states: {
        active: {}
      }
    });

    const Test = () => {
      useMachine(machine);

      return null;
    };

    render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );

    expect(activatedCount).toEqual(1);
  });

  it('child component should be able to send an event to a parent immediately in an effect', (done) => {
    const machine = createMachine<any, { type: 'FINISH' }>({
      initial: 'active',
      states: {
        active: {
          on: { FINISH: 'success' }
        },
        success: {}
      }
    });

    const ChildTest: React.FC<{ send: any }> = ({ send }) => {
      // This will send an event to the parent service
      // BEFORE the service is ready.
      React.useLayoutEffect(() => {
        send({ type: 'FINISH' });
      }, []);

      return null;
    };

    const Test = () => {
      const [state, send] = useMachine(machine);

      if (state.matches('success')) {
        done();
      }

      return <ChildTest send={send} />;
    };

    render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );
  });

  it('custom data should be available right away for the invoked actor', (done) => {
    const childMachine = createMachine({
      initial: 'intitial',
      context: {
        value: 100
      },
      states: {
        intitial: {}
      }
    });

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          invoke: {
            id: 'test',
            src: invokeMachine(childMachine),
            data: {
              value: () => 42
            }
          }
        }
      }
    });

    const Test = () => {
      const [state] = useMachine(machine);
      const [childState] = useActor(
        state.children.test as ActorRefFrom<typeof childMachine> // TODO: introduce typing for this in machine schema
      );

      expect(childState.context.value).toBe(42);

      return null;
    };

    render(
      <React.StrictMode>
        <Test />
      </React.StrictMode>
    );
    done();
  });

  // https://github.com/davidkpiano/xstate/issues/1334
  it('delayed transitions should work when initializing from a rehydrated state', () => {
    jest.useFakeTimers();
    try {
      const testMachine = createMachine<any, { type: 'START' }>({
        id: 'app',
        initial: 'idle',
        states: {
          idle: {
            on: {
              START: 'doingStuff'
            }
          },
          doingStuff: {
            id: 'doingStuff',
            after: {
              100: 'idle'
            }
          }
        }
      });

      const persistedState = JSON.stringify(testMachine.initialState);

      let currentState;

      const Test = () => {
        const [state, send] = useMachine(testMachine, {
          state: State.create(JSON.parse(persistedState))
        });

        currentState = state;

        return (
          <button onClick={() => send('START')} data-testid="button"></button>
        );
      };

      const { getByTestId } = render(
        <React.StrictMode>
          <Test />
        </React.StrictMode>
      );

      const button = getByTestId('button');

      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(110);
      });

      expect(currentState.matches('idle')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
