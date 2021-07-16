import { createMachine, interpret, State } from '../src/index';
import { assign, raise } from '../src/actions';
import { invokeMachine } from '../src/invoke';
import { stateIn } from '../src/guards';

const greetingContext = { hour: 10 };
const greetingMachine = createMachine<typeof greetingContext>({
  key: 'greeting',
  initial: 'pending',
  context: greetingContext,
  states: {
    pending: {
      on: {
        '': [
          { target: 'morning', guard: (ctx) => ctx.hour < 12 },
          { target: 'afternoon', guard: (ctx) => ctx.hour < 18 },
          { target: 'evening' }
        ]
      }
    },
    morning: {},
    afternoon: {},
    evening: {}
  },
  on: {
    CHANGE: { actions: assign({ hour: 20 }) },
    RECHECK: '#greeting'
  }
});

describe('transient states (eventless transitions)', () => {
  const updateMachine = createMachine<{ data: boolean; status?: string }>({
    initial: 'G',
    states: {
      G: {
        on: { UPDATE_BUTTON_CLICKED: 'E' }
      },
      E: {
        always: [
          { target: 'D', guard: ({ data }) => !data }, // no data returned
          { target: 'B', guard: ({ status }) => status === 'Y' },
          { target: 'C', guard: ({ status }) => status === 'X' },
          { target: 'F' } // default, or just the string 'F'
        ]
      },
      D: {},
      B: {},
      C: {},
      F: {}
    }
  });

  it('should choose the first candidate target that matches the guard (D)', () => {
    const nextState = updateMachine.transition(
      State.from<any>('G', {
        data: false
      }),
      'UPDATE_BUTTON_CLICKED'
    );
    expect(nextState.value).toEqual('D');
  });

  it('should choose the first candidate target that matches the guard (B)', () => {
    const nextState = updateMachine.transition(
      State.from<any>('G', {
        data: true,
        status: 'Y'
      }),
      'UPDATE_BUTTON_CLICKED'
    );
    expect(nextState.value).toEqual('B');
  });

  it('should choose the first candidate target that matches the guard (C)', () => {
    const nextState = updateMachine.transition(
      State.from('G', {
        data: true,
        status: 'X'
      }),
      'UPDATE_BUTTON_CLICKED'
    );
    expect(nextState.value).toEqual('C');
  });

  it('should choose the final candidate without a guard if none others match', () => {
    const nextState = updateMachine.transition(
      State.from('G', {
        data: true,
        status: 'other'
      }),
      'UPDATE_BUTTON_CLICKED'
    );
    expect(nextState.value).toEqual('F');
  });

  it('should carry actions from previous transitions within same step', () => {
    const machine = createMachine({
      initial: 'A',
      states: {
        A: {
          exit: 'exit_A',
          on: {
            TIMER: {
              target: 'T',
              actions: ['timer']
            }
          }
        },
        T: {
          on: {
            '': [{ target: 'B' }]
          }
        },
        B: {
          entry: 'enter_B'
        }
      }
    });

    const state = machine.transition('A', 'TIMER');

    expect(state.actions.map((a) => a.type)).toEqual([
      'exit_A',
      'timer',
      'enter_B'
    ]);
  });

  it('should execute all internal events one after the other', () => {
    const machine = createMachine({
      type: 'parallel',
      states: {
        A: {
          initial: 'A1',
          states: {
            A1: {
              on: {
                E: 'A2'
              }
            },
            A2: {
              entry: raise('INT1')
            }
          }
        },

        B: {
          initial: 'B1',
          states: {
            B1: {
              on: {
                E: 'B2'
              }
            },
            B2: {
              entry: raise('INT2')
            }
          }
        },

        C: {
          initial: 'C1',
          states: {
            C1: {
              on: {
                INT1: 'C2',
                INT2: 'C3'
              }
            },
            C2: {
              on: {
                INT2: 'C4'
              }
            },
            C3: {
              on: {
                INT1: 'C4'
              }
            },
            C4: {}
          }
        }
      }
    });

    const state = machine.transition(machine.initialState, 'E');

    expect(state.value).toEqual({ A: 'A2', B: 'B2', C: 'C4' });
  });

  it('should execute all eventless transitions in the same microstep', () => {
    const machine = createMachine({
      type: 'parallel',
      states: {
        A: {
          initial: 'A1',
          states: {
            A1: {
              on: {
                E: 'A2' // the external event
              }
            },
            A2: {
              on: {
                '': 'A3'
              }
            },
            A3: {
              on: {
                '': {
                  target: 'A4',
                  guard: stateIn({ B: 'B3' })
                }
              }
            },
            A4: {}
          }
        },

        B: {
          initial: 'B1',
          states: {
            B1: {
              on: {
                E: 'B2'
              }
            },
            B2: {
              on: {
                '': {
                  target: 'B3',
                  guard: stateIn({ A: 'A2' })
                }
              }
            },
            B3: {
              on: {
                '': {
                  target: 'B4',
                  guard: stateIn({ A: 'A3' })
                }
              }
            },
            B4: {}
          }
        }
      }
    });

    const state = machine.transition(machine.initialState, 'E');

    expect(state.value).toEqual({ A: 'A4', B: 'B4' });
  });

  it('should execute all eventless transitions in the same microstep (with `always`)', () => {
    const machine = createMachine({
      type: 'parallel',
      states: {
        A: {
          initial: 'A1',
          states: {
            A1: {
              on: {
                E: 'A2' // the external event
              }
            },
            A2: {
              always: 'A3'
            },
            A3: {
              always: {
                target: 'A4',
                guard: stateIn({ B: 'B3' })
              }
            },
            A4: {}
          }
        },

        B: {
          initial: 'B1',
          states: {
            B1: {
              on: {
                E: 'B2'
              }
            },
            B2: {
              always: {
                target: 'B3',
                guard: stateIn({ A: 'A2' })
              }
            },
            B3: {
              always: {
                target: 'B4',
                guard: stateIn({ A: 'A3' })
              }
            },
            B4: {}
          }
        }
      }
    });

    const state = machine.transition(machine.initialState, 'E');

    expect(state.value).toEqual({ A: 'A4', B: 'B4' });
  });

  it('should check for automatic transitions even after microsteps are done', () => {
    const machine = createMachine({
      type: 'parallel',
      states: {
        A: {
          initial: 'A1',
          states: {
            A1: {
              on: {
                A: 'A2'
              }
            },
            A2: {}
          }
        },
        B: {
          initial: 'B1',
          states: {
            B1: {
              on: {
                '': {
                  target: 'B2',
                  guard: stateIn({ A: 'A2' })
                }
              }
            },
            B2: {}
          }
        },
        C: {
          initial: 'C1',
          states: {
            C1: {
              on: {
                '': {
                  target: 'C2',
                  guard: stateIn({ A: 'A2' })
                }
              }
            },
            C2: {}
          }
        }
      }
    });

    let state = machine.initialState; // A1, B1, C1
    state = machine.transition(state, 'A'); // A2, B2, C2
    expect(state.value).toEqual({ A: 'A2', B: 'B2', C: 'C2' });
  });

  it('should check for automatic transitions even after microsteps are done (with `always`)', () => {
    const machine = createMachine({
      type: 'parallel',
      states: {
        A: {
          initial: 'A1',
          states: {
            A1: {
              on: {
                A: 'A2'
              }
            },
            A2: { id: 'A2' }
          }
        },
        B: {
          initial: 'B1',
          states: {
            B1: {
              always: {
                target: 'B2',
                guard: stateIn({ A: 'A2' })
              }
            },
            B2: {}
          }
        },
        C: {
          initial: 'C1',
          states: {
            C1: {
              always: {
                target: 'C2',
                guard: stateIn('#A2')
              }
            },
            C2: {}
          }
        }
      }
    });

    let state = machine.initialState; // A1, B1, C1
    state = machine.transition(state, 'A'); // A2, B2, C2
    expect(state.value).toEqual({ A: 'A2', B: 'B2', C: 'C2' });
  });

  it('should determine the resolved initial state from the transient state', () => {
    expect(greetingMachine.initialState.value).toEqual('morning');
  });

  it('should determine the resolved state from an initial transient state', () => {
    const morningState = greetingMachine.initialState;
    expect(morningState.value).toEqual('morning');
    const stillMorningState = greetingMachine.transition(
      morningState,
      'CHANGE'
    );
    expect(stillMorningState.value).toEqual('morning');
    const eveningState = greetingMachine.transition(
      stillMorningState,
      'RECHECK'
    );
    expect(eveningState.value).toEqual('evening');
  });

  it('should select eventless transition before processing raised events', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: {
            FOO: 'b'
          }
        },
        b: {
          entry: raise('BAR'),
          on: {
            '': 'c',
            BAR: 'd'
          }
        },
        c: {
          on: {
            BAR: 'e'
          }
        },
        d: {},
        e: {}
      }
    });

    const state = machine.transition('a', 'FOO');
    expect(state.value).toBe('e');
  });

  it('should select eventless transition before processing raised events (with `always`)', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: {
            FOO: 'b'
          }
        },
        b: {
          entry: raise('BAR'),
          always: 'c',
          on: {
            BAR: 'd'
          }
        },
        c: {
          on: {
            BAR: 'e'
          }
        },
        d: {},
        e: {}
      }
    });

    const state = machine.transition('a', 'FOO');
    expect(state.value).toBe('e');
  });

  it('should select eventless transition for array `.on` config', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: { FOO: 'b' }
        },
        b: {
          on: [{ event: '', target: 'pass' }]
        },
        pass: {}
      }
    });

    const state = machine.transition('a', 'FOO');
    expect(state.value).toBe('pass');
  });

  it('should not select wildcard for eventless transition', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: { FOO: 'b' }
        },
        b: {
          on: { '*': 'fail' }
        },
        fail: {}
      }
    });

    const state = machine.transition('a', 'FOO');
    expect(state.value).toBe('b');
  });

  it('should not select wildcard for eventless transition (array `.on`)', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: { FOO: 'b' }
        },
        b: {
          on: [
            { event: '*', target: 'fail' },
            { event: '', target: 'pass' }
          ]
        },
        fail: {},
        pass: {}
      }
    });

    const state = machine.transition('a', 'FOO');
    expect(state.value).toBe('pass');
  });

  it('should not select wildcard for eventless transition (with `always`)', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          on: { FOO: 'b' }
        },
        b: {
          always: 'pass',
          on: [{ event: '*', target: 'fail' }]
        },
        fail: {},
        pass: {}
      }
    });

    const state = machine.transition('a', 'FOO');
    expect(state.value).toBe('pass');
  });

  it('should work with transient transition on root', (done) => {
    const machine = createMachine<any, any>({
      id: 'machine',
      initial: 'first',
      context: { count: 0 },
      states: {
        first: {
          on: {
            ADD: {
              actions: assign({ count: (ctx) => ctx.count + 1 })
            }
          }
        },
        success: {
          type: 'final'
        }
      },
      on: {
        '': [
          {
            target: '.success',
            guard: (ctx) => {
              return ctx.count > 0;
            }
          }
        ]
      }
    });

    const service = interpret(machine).onDone(() => {
      done();
    });

    service.start();

    service.send('ADD');
  });

  it('should work with transient transition on root (with `always`)', (done) => {
    const machine = createMachine<any, any>({
      id: 'machine',
      initial: 'first',
      context: { count: 0 },
      states: {
        first: {
          on: {
            ADD: {
              actions: assign({ count: (ctx) => ctx.count + 1 })
            }
          }
        },
        success: {
          type: 'final'
        }
      },

      always: [
        {
          target: '.success',
          guard: (ctx) => {
            return ctx.count > 0;
          }
        }
      ]
    });

    const service = interpret(machine).onDone(() => {
      done();
    });

    service.start();

    service.send('ADD');
  });

  it("shouldn't crash when invoking a machine with initial transient transition depending on custom data", () => {
    const timerMachine = createMachine({
      initial: 'initial',
      context: {
        duration: 0
      },
      states: {
        initial: {
          always: [
            {
              target: `finished`,
              guard: (ctx) => ctx.duration < 1000
            },
            {
              target: `active`
            }
          ]
        },
        active: {},
        finished: { type: 'final' }
      }
    });

    const machine = createMachine({
      initial: 'active',
      context: {
        customDuration: 3000
      },
      states: {
        active: {
          invoke: {
            src: invokeMachine(timerMachine),
            data: {
              duration: (context) => context.customDuration
            }
          }
        }
      }
    });

    const service = interpret(machine);
    expect(() => service.start()).not.toThrow();
  });

  it('should be taken even in absence of other transitions', () => {
    let shouldMatch = false;

    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          always: {
            target: 'b',
            // TODO: in v5 remove `shouldMatch` and replace this guard with:
            // guard: (ctx, ev) => ev.type === 'WHATEVER'
            guard: () => shouldMatch
          }
        },
        b: {}
      }
    });
    const service = interpret(machine).start();

    shouldMatch = true;
    service.send({ type: 'WHATEVER' });

    expect(service.state.value).toBe('b');
  });

  it('should select subsequent transient transitions even in absence of other transitions', () => {
    let shouldMatch = false;

    const machine = createMachine({
      initial: 'a',
      states: {
        a: {
          always: {
            target: 'b',
            // TODO: in v5 remove `shouldMatch` and replace this guard with:
            // guard: (ctx, ev) => ev.type === 'WHATEVER'
            guard: () => shouldMatch
          }
        },
        b: {
          always: {
            target: 'c',
            guard: () => true
          }
        },
        c: {}
      }
    });

    const service = interpret(machine).start();

    shouldMatch = true;
    service.send({ type: 'WHATEVER' });

    expect(service.state.value).toBe('c');
  });
});
