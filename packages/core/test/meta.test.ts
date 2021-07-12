import { createMachine, interpret } from '../src/index';

describe('state meta data', () => {
  const pedestrianStates = {
    initial: 'walk',
    states: {
      walk: {
        meta: { walkData: 'walk data' },
        on: {
          PED_COUNTDOWN: 'wait'
        },
        entry: 'enter_walk',
        exit: 'exit_walk'
      },
      wait: {
        meta: { waitData: 'wait data' },
        on: {
          PED_COUNTDOWN: 'stop'
        },
        entry: 'enter_wait',
        exit: 'exit_wait'
      },
      stop: {
        meta: { stopData: 'stop data' },
        entry: 'enter_stop',
        exit: 'exit_stop'
      }
    }
  } as const;

  const lightMachine = createMachine({
    key: 'light',
    initial: 'green',
    states: {
      green: {
        meta: ['green', 'array', 'data'],
        on: {
          TIMER: 'yellow',
          POWER_OUTAGE: 'red',
          NOTHING: 'green'
        },
        entry: 'enter_green',
        exit: 'exit_green'
      },
      yellow: {
        meta: { yellowData: 'yellow data' },
        on: {
          TIMER: 'red',
          POWER_OUTAGE: 'red'
        },
        entry: 'enter_yellow',
        exit: 'exit_yellow'
      },
      red: {
        meta: {
          redData: {
            nested: {
              red: 'data',
              array: [1, 2, 3]
            }
          }
        },
        on: {
          TIMER: 'green',
          POWER_OUTAGE: 'red',
          NOTHING: 'red'
        },
        entry: 'enter_red',
        exit: 'exit_red',
        ...pedestrianStates
      }
    }
  });

  it('states should aggregate meta data', () => {
    const yellowState = lightMachine.transition('green', 'TIMER');
    expect(yellowState.meta).toEqual({
      'light.yellow': {
        yellowData: 'yellow data'
      }
    });
    expect('light.green' in yellowState.meta).toBeFalsy();
    expect('light' in yellowState.meta).toBeFalsy();
  });

  it('states should aggregate meta data (deep)', () => {
    expect(lightMachine.transition('yellow', 'TIMER').meta).toEqual({
      'light.red': {
        redData: {
          nested: {
            array: [1, 2, 3],
            red: 'data'
          }
        }
      },
      'light.red.walk': {
        walkData: 'walk data'
      }
    });
  });

  // https://github.com/davidkpiano/xstate/issues/1105
  it('services started from a persisted state should calculate meta data', (done) => {
    const machine = createMachine({
      id: 'test',
      initial: 'first',
      states: {
        first: {
          meta: {
            name: 'first state'
          }
        },
        second: {
          meta: {
            name: 'second state'
          }
        }
      }
    });

    const service = interpret(machine).onTransition((state) => {
      expect(state.meta).toEqual({
        'test.second': {
          name: 'second state'
        }
      });
      done();
    });
    service.start('second');
  });
});

describe('transition meta data', () => {
  it('should show meta data in transitions', () => {
    const machine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            EVENT: {
              target: 'active',
              meta: {
                description: 'Going from inactive to active'
              }
            }
          }
        },
        active: {}
      }
    });

    const nextState = machine.transition(undefined, 'EVENT');

    expect(nextState.transitions.map((t) => t.meta)).toMatchInlineSnapshot(`
      Array [
        Object {
          "description": "Going from inactive to active",
        },
      ]
    `);
  });
});
