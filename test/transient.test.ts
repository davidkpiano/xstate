import { Machine } from '../src/index';
import { assign } from '../src/actions';

const greetingContext = { hour: 10 };
const greetingMachine = Machine<typeof greetingContext>({
  key: 'greeting',
  initial: 'pending',
  context: greetingContext,
  states: {
    pending: {
      on: {
        '': [
          { target: 'morning', cond: ctx => ctx.hour < 12 },
          { target: 'afternoon', cond: ctx => ctx.hour < 18 },
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
  const updateMachine = Machine<{ data: boolean; status?: string }>({
    initial: 'G',
    context: { data: false },
    states: {
      G: {
        on: { UPDATE_BUTTON_CLICKED: 'E' }
      },
      E: {
        on: {
          // eventless transition
          '': [
            { target: 'D', cond: ({ data }) => !data }, // no data returned
            { target: 'B', cond: ({ status }) => status === 'Y' },
            { target: 'C', cond: ({ status }) => status === 'X' },
            { target: 'F' } // default, or just the string 'F'
          ]
        }
      },
      D: {},
      B: {},
      C: {},
      F: {}
    }
  });

  it('should choose the first candidate target that matches the cond (D)', () => {
    const nextState = updateMachine.transition('G', 'UPDATE_BUTTON_CLICKED', {
      data: false
    });
    expect(nextState.value).toEqual('D');
  });

  it('should choose the first candidate target that matches the cond (B)', () => {
    const nextState = updateMachine.transition('G', 'UPDATE_BUTTON_CLICKED', {
      data: true,
      status: 'Y'
    });
    expect(nextState.value).toEqual('B');
  });

  it('should choose the first candidate target that matches the cond (C)', () => {
    const nextState = updateMachine.transition('G', 'UPDATE_BUTTON_CLICKED', {
      data: true,
      status: 'X'
    });
    expect(nextState.value).toEqual('C');
  });

  it('should choose the final candidate without a cond if none others match', () => {
    const nextState = updateMachine.transition('G', 'UPDATE_BUTTON_CLICKED', {
      data: true,
      status: 'other'
    });
    expect(nextState.value).toEqual('F');
  });

  it('should carry actions from previous transitions within same step', () => {
    const machine = Machine({
      initial: 'A',
      states: {
        A: {
          onExit: 'exit_A',
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
          onEntry: 'enter_B'
        }
      }
    });

    const state = machine.transition('A', 'TIMER');

    expect(state.actions.map(a => a.type)).toEqual([
      'exit_A',
      'timer',
      'enter_B'
    ]);
  });

  it('should execute all internal events one after the other', () => {
    const machine = Machine({
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
              onEntry: {
                type: 'xstate.raise',
                event: 'INT1'
              }
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
              onEntry: {
                type: 'xstate.raise',
                event: 'INT2'
              }
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
    const machine = Machine({
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
                  in: 'B.B3'
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
                  in: 'A.A2'
                }
              }
            },
            B3: {
              on: {
                '': {
                  target: 'B4',
                  in: 'A.A3'
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

  it('should check for automatic transitions even after microsteps are done', () => {
    const machine = Machine({
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
                  cond: (_xs, _e, { state: s }) => s.matches('A.A2')
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
                  in: 'A.A2'
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

  it('should determine the resolved initial state from the transient state', () => {
    expect(greetingMachine.initialState.value).toEqual('morning');
  });

  // TODO: determine proper behavior here -
  // Should an internal transition on the parent node activate the parent node
  // or all previous state nodes?
  xit('should determine the resolved state from a root transient state', () => {
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
});
