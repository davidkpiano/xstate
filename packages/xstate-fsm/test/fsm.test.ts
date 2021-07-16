import { createMachine, assign, interpret, StateMachine } from '../src';

describe('@xstate/fsm', () => {
  interface LightContext {
    count: number;
    foo: string | undefined;
    go: boolean;
  }

  type LightEvent =
    | { type: 'TIMER' }
    | { type: 'INC' }
    | { type: 'EMERGENCY'; value: number };

  type LightState =
    | {
        value: 'green';
        context: LightContext & { go: true };
      }
    | {
        value: 'yellow';
        context: LightContext & { go: false };
      }
    | {
        value: 'red';
        context: LightContext & { go: false };
      };

  const lightConfig: StateMachine.Config<
    LightContext,
    LightEvent,
    LightState
  > = {
    id: 'light',
    initial: 'green',
    context: { count: 0, foo: 'bar', go: true },
    states: {
      green: {
        entry: 'enterGreen',
        exit: [
          'exitGreen',
          assign({ count: (ctx) => ctx.count + 1 }),
          assign({ count: (ctx) => ctx.count + 1 }),
          assign<LightContext>({ foo: 'static' }),
          assign({ foo: (ctx) => ctx.foo + '++' })
        ],
        on: {
          TIMER: {
            target: 'yellow',
            actions: ['g-y 1', 'g-y 2']
          }
        }
      },
      yellow: {
        entry: assign<LightContext>({ go: false }),
        on: {
          INC: { actions: assign({ count: (ctx) => ctx.count + 1 }) },
          EMERGENCY: {
            target: 'red',
            guard: (ctx, e) => ctx.count + e.value === 2
          }
        }
      },
      red: {}
    }
  };
  const lightFSM = createMachine<LightContext, LightEvent, LightState>(
    lightConfig
  );
  it('should return back the config object', () => {
    expect(lightFSM.config).toBe(lightConfig);
  });
  it('should have the correct initial state', () => {
    const { initialState } = lightFSM;

    expect(initialState.value).toEqual('green');
    expect(initialState.actions).toEqual([{ type: 'enterGreen' }]);
  });
  it('should have initial context updated by initial assign actions', () => {
    const { initialState } = createMachine({
      initial: 'init',
      context: {
        count: 0
      },
      states: {
        init: {
          entry: assign({
            count: () => 1
          })
        }
      }
    });

    expect(initialState.context).toEqual({ count: 1 });
  });
  it('should have initial actions computed without assign actions', () => {
    const { initialState } = createMachine({
      initial: 'init',
      context: {
        count: 0
      },
      states: {
        init: {
          entry: [
            { type: 'foo' },
            assign({
              count: () => 1
            })
          ]
        }
      }
    });

    expect(initialState.actions).toEqual([{ type: 'foo' }]);
  });
  it('should transition correctly', () => {
    const nextState = lightFSM.transition('green', 'TIMER');
    expect(nextState.value).toEqual('yellow');
    expect(nextState.actions.map((action) => action.type)).toEqual([
      'exitGreen',
      'g-y 1',
      'g-y 2'
    ]);
    expect(nextState.context).toEqual({
      count: 2,
      foo: 'static++',
      go: false
    });
  });

  it('should stay on the same state for undefined transitions', () => {
    const nextState = lightFSM.transition('green', 'FAKE' as any);
    expect(nextState.value).toBe('green');
    expect(nextState.actions).toEqual([]);
  });

  it('should throw an error for undefined states', () => {
    expect(() => {
      lightFSM.transition('unknown', 'TIMER');
    }).toThrow();
  });

  it('should throw an error for undefined next state config', () => {
    const invalidState = 'blue';
    const testConfig = {
      id: 'test',
      initial: 'green',
      states: {
        green: {
          on: {
            TARGET_INVALID: invalidState
          }
        },
        yellow: {}
      }
    };
    const testMachine = createMachine(testConfig);
    expect(() => {
      testMachine.transition('green', 'TARGET_INVALID');
    }).toThrow(
      `State '${invalidState}' not found on machine ${testConfig.id ?? ''}`
    );
  });

  it('should work with guards', () => {
    const yellowState = lightFSM.transition('yellow', 'EMERGENCY');
    expect(yellowState.value).toEqual('yellow');

    const redState = lightFSM.transition('yellow', {
      type: 'EMERGENCY',
      value: 2
    });
    expect(redState.value).toEqual('red');
    expect(redState.context.count).toBe(0);

    const yellowOneState = lightFSM.transition('yellow', 'INC');
    const redOneState = lightFSM.transition(yellowOneState, {
      type: 'EMERGENCY',
      value: 1
    });

    expect(redOneState.value).toBe('red');
    expect(redOneState.context.count).toBe(1);
  });

  it('should be changed if state changes', () => {
    expect(lightFSM.transition('green', 'TIMER').changed).toBe(true);
  });

  it('should be changed if any actions occur', () => {
    expect(lightFSM.transition('yellow', 'INC').changed).toBe(true);
  });

  it('should not be changed on unknown transitions', () => {
    expect(lightFSM.transition('yellow', 'UNKNOWN' as any).changed).toBe(false);
  });

  it('should match initialState', () => {
    const { initialState } = lightFSM;

    expect(initialState.matches('green')).toBeTruthy();

    if (initialState.matches('green')) {
      expect(initialState.context.go).toBeTruthy();
    }
  });

  it('should match transition states', () => {
    const { initialState } = lightFSM;
    const nextState = lightFSM.transition(initialState, 'TIMER');

    expect(nextState.matches('yellow')).toBeTruthy();

    if (nextState.matches('yellow')) {
      expect(nextState.context.go).toBeFalsy();
    }
  });
});

describe('interpreter', () => {
  const toggleMachine = createMachine({
    initial: 'active',
    states: {
      active: {
        on: { TOGGLE: 'inactive' }
      },
      inactive: {}
    }
  });

  it('listeners should immediately get the initial state', (done) => {
    const toggleService = interpret(toggleMachine).start();

    toggleService.subscribe((state) => {
      if (state.matches('active')) {
        done();
      }
    });
  });

  it('listeners should subscribe to state changes', (done) => {
    const toggleService = interpret(toggleMachine).start();

    toggleService.subscribe((state) => {
      if (state.matches('inactive')) {
        done();
      }
    });

    toggleService.send('TOGGLE');
  });

  it('should execute actions', (done) => {
    let executed = false;

    const actionMachine = createMachine({
      initial: 'active',
      states: {
        active: {
          on: {
            TOGGLE: {
              target: 'inactive',
              actions: () => {
                executed = true;
              }
            }
          }
        },
        inactive: {}
      }
    });

    const actionService = interpret(actionMachine).start();

    actionService.subscribe(() => {
      if (executed) {
        done();
      }
    });

    actionService.send('TOGGLE');
  });

  describe('`start` method', () => {
    it('should start the service with initial state by default', () => {
      const machine = createMachine({
        initial: 'foo',
        states: {
          foo: {
            on: {
              NEXT: 'bar'
            }
          },
          bar: {}
        }
      });

      const service = interpret(machine).start();

      expect(service.state.value).toBe('foo');
    });

    it('should rehydrate the state if the state if provided', () => {
      const machine = createMachine({
        initial: 'foo',
        states: {
          foo: {
            on: {
              NEXT: 'bar'
            }
          },
          bar: {
            on: {
              NEXT: 'baz'
            }
          },
          baz: {}
        }
      });

      const service = interpret(machine).start('bar');
      expect(service.state.value).toBe('bar');

      service.send('NEXT');
      expect(service.state.matches('baz')).toBe(true);
    });

    it('should rehydrate the state and the context if both are provided', () => {
      const machine = createMachine({
        initial: 'foo',
        states: {
          foo: {
            on: {
              NEXT: 'bar'
            }
          },
          bar: {
            on: {
              NEXT: 'baz'
            }
          },
          baz: {}
        }
      });

      const context = { hello: 'world' };
      const service = interpret(machine).start({ value: 'bar', context });
      expect(service.state.value).toBe('bar');
      expect(service.state.context).toBe(context);

      service.send('NEXT');
      expect(service.state.matches('baz')).toBe(true);
    });
  });

  it('should execute initial entry action', () => {
    let executed = false;

    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {
          entry: () => {
            executed = true;
          }
        }
      }
    });

    interpret(machine).start();
    expect(executed).toBe(true);
  });

  it('should lookup string actions in options', () => {
    let executed = false;

    const machine = createMachine(
      {
        initial: 'foo',
        states: {
          foo: {
            entry: 'testAction'
          }
        }
      },
      {
        actions: {
          testAction: () => {
            executed = true;
          }
        }
      }
    );

    interpret(machine).start();

    expect(executed).toBe(true);
  });

  it('should reveal the current state', () => {
    const machine = createMachine({
      initial: 'test',
      context: { foo: 'bar' },
      states: {
        test: {}
      }
    });
    const service = interpret(machine);

    service.start();

    expect(service.state.value).toEqual('test');
    expect(service.state.context).toEqual({ foo: 'bar' });
  });

  it('should reveal the current state after transition', (done) => {
    const machine = createMachine({
      initial: 'test',
      context: { foo: 'bar' },
      states: {
        test: {
          on: { CHANGE: 'success' }
        },
        success: {}
      }
    });
    const service = interpret(machine);

    service.start();

    service.subscribe(() => {
      if (service.state.value === 'success') {
        done();
      }
    });

    service.send('CHANGE');
  });

  it('should not re-execute exit/entry actions for transitions with undefined targets', () => {
    const machine = createMachine({
      initial: 'test',
      states: {
        test: {
          entry: ['entry'],
          exit: ['exit'],
          on: {
            EVENT: {
              // undefined target
              actions: ['action']
            }
          }
        }
      }
    });

    const { initialState } = machine;

    expect(initialState.actions.map((a) => a.type)).toEqual(['entry']);

    const nextState = machine.transition(initialState, 'EVENT');

    expect(nextState.actions.map((a) => a.type)).toEqual(['action']);
  });
});
