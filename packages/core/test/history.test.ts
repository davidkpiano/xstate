import { interpret, createMachine } from '../src/index';

describe('history states', () => {
  const historyMachine = createMachine({
    key: 'history',
    initial: 'off',
    states: {
      off: {
        on: { POWER: 'on.hist', H_POWER: 'on.H' }
      },
      on: {
        initial: 'first',
        states: {
          first: {
            on: { SWITCH: 'second' }
          },
          second: {
            on: { SWITCH: 'third' }
          },
          third: {},
          H: {
            type: 'history'
          },
          hist: {
            type: 'history',
            history: 'shallow'
          }
        },
        on: {
          POWER: 'off',
          H_POWER: 'off'
        }
      }
    }
  });

  it('should go to the most recently visited state', () => {
    const onSecondState = historyMachine.transition('on', 'SWITCH');
    const offState = historyMachine.transition(onSecondState, 'POWER');

    expect(historyMachine.transition(offState, 'POWER').value).toEqual({
      on: 'second'
    });
  });

  it('should go to the most recently visited state (explicit)', () => {
    const onSecondState = historyMachine.transition('on', 'SWITCH');
    const offState = historyMachine.transition(onSecondState, 'H_POWER');

    expect(historyMachine.transition(offState, 'H_POWER').value).toEqual({
      on: 'second'
    });
  });

  it('should go to the initial state when no history present', () => {
    expect(historyMachine.transition('off', 'POWER').value).toEqual({
      on: 'first'
    });
  });

  it('should go to the initial state when no history present (explicit)', () => {
    expect(historyMachine.transition('off', 'H_POWER').value).toEqual({
      on: 'first'
    });
  });

  it('should dispose of previous histories', () => {
    const onSecondState = historyMachine.transition('on', 'SWITCH');
    const offState = historyMachine.transition(onSecondState, 'H_POWER');
    const onState = historyMachine.transition(offState, 'H_POWER');
    const nextState = historyMachine.transition(onState, 'H_POWER');
    expect(nextState.history!.history).not.toBeDefined();
  });

  it('should go to the most recently visited state by a transient transition', () => {
    const machine = createMachine({
      initial: 'idle',
      states: {
        idle: {
          id: 'idle',
          initial: 'absent',
          states: {
            absent: {
              on: {
                DEPLOY: '#deploy'
              }
            },
            present: {
              on: {
                DEPLOY: '#deploy',
                DESTROY: '#destroy'
              }
            },
            hist: {
              type: 'history'
            }
          }
        },
        deploy: {
          id: 'deploy',
          on: {
            SUCCESS: 'idle.present',
            FAILURE: 'idle.hist'
          }
        },
        destroy: {
          id: 'destroy',
          always: [{ target: 'idle.absent' }]
        }
      }
    });

    const service = interpret(machine).start();

    service.send('DEPLOY');
    service.send('SUCCESS');
    service.send('DESTROY');
    service.send('DEPLOY');
    service.send('FAILURE');

    expect(service.state.value).toEqual({ idle: 'absent' });
  });
});

describe('deep history states', () => {
  const historyMachine = createMachine({
    key: 'history',
    initial: 'off',
    states: {
      off: {
        on: {
          POWER: 'on.history',
          DEEP_POWER: 'on.deepHistory'
        }
      },
      on: {
        initial: 'first',
        states: {
          first: {
            on: { SWITCH: 'second' }
          },
          second: {
            initial: 'A',
            states: {
              A: {
                on: { INNER: 'B' }
              },
              B: {
                initial: 'P',
                states: {
                  P: {
                    on: { INNER: 'Q' }
                  },
                  Q: {}
                }
              }
            }
          },
          history: { history: 'shallow' },
          deepHistory: {
            history: 'deep'
          }
        },
        on: {
          POWER: 'off'
        }
      }
    }
  });

  describe('history', () => {
    // on.first -> on.second.A
    const state2A = historyMachine.transition({ on: 'first' }, 'SWITCH');
    // on.second.A -> on.second.B.P
    const state2BP = historyMachine.transition(state2A, 'INNER');
    // on.second.B.P -> on.second.B.Q
    const state2BQ = historyMachine.transition(state2BP, 'INNER');

    it('should go to the shallow history', () => {
      // on.second.B.P -> off
      const stateOff = historyMachine.transition(state2BP, 'POWER');
      expect(historyMachine.transition(stateOff, 'POWER').value).toEqual({
        on: { second: 'A' }
      });
    });

    it('should go to the deep history (explicit)', () => {
      // on.second.B.P -> off
      const stateOff = historyMachine.transition(state2BP, 'POWER');
      expect(historyMachine.transition(stateOff, 'DEEP_POWER').value).toEqual({
        on: { second: { B: 'P' } }
      });
    });

    it('should go to the deepest history', () => {
      // on.second.B.Q -> off
      const stateOff = historyMachine.transition(state2BQ, 'POWER');
      expect(historyMachine.transition(stateOff, 'DEEP_POWER').value).toEqual({
        on: { second: { B: 'Q' } }
      });
    });
  });
});

describe('parallel history states', () => {
  const historyMachine = createMachine({
    key: 'parallelhistory',
    initial: 'off',
    states: {
      off: {
        on: {
          SWITCH: 'on', // go to the initial states
          POWER: 'on.hist',
          DEEP_POWER: 'on.deepHistory',
          PARALLEL_HISTORY: [{ target: ['on.A.hist', 'on.K.hist'] }],
          PARALLEL_SOME_HISTORY: [{ target: ['on.A.C', 'on.K.hist'] }],
          PARALLEL_DEEP_HISTORY: [
            { target: ['on.A.deepHistory', 'on.K.deepHistory'] }
          ]
        }
      },
      on: {
        type: 'parallel',
        states: {
          A: {
            initial: 'B',
            states: {
              B: {
                on: { INNER_A: 'C' }
              },
              C: {
                initial: 'D',
                states: {
                  D: {
                    on: { INNER_A: 'E' }
                  },
                  E: {}
                }
              },
              hist: { history: true },
              deepHistory: {
                history: 'deep'
              }
            }
          },
          K: {
            initial: 'L',
            states: {
              L: {
                on: { INNER_K: 'M' }
              },
              M: {
                initial: 'N',
                states: {
                  N: {
                    on: { INNER_K: 'O' }
                  },
                  O: {}
                }
              },
              hist: { history: true },
              deepHistory: {
                history: 'deep'
              }
            }
          },
          hist: {
            history: true
          },
          shallowHistory: {
            history: 'shallow'
          },
          deepHistory: {
            history: 'deep'
          }
        },
        on: {
          POWER: 'off'
        }
      }
    }
  });

  // on.first -> on.second.A
  const stateABKL = historyMachine.transition(
    historyMachine.initialState,
    'SWITCH'
  );
  // INNER_A twice
  const stateACDKL = historyMachine.transition(stateABKL, 'INNER_A');
  const stateACEKL = historyMachine.transition(stateACDKL, 'INNER_A');

  // INNER_K twice
  const stateACEKMN = historyMachine.transition(stateACEKL, 'INNER_K');
  const stateACEKMO = historyMachine.transition(stateACEKMN, 'INNER_K');

  it('should ignore parallel state history', () => {
    const stateOff = historyMachine.transition(stateACDKL, 'POWER');
    expect(historyMachine.transition(stateOff, 'POWER').value).toEqual({
      on: { A: 'B', K: 'L' }
    });
  });

  it('should remember first level state history', () => {
    const stateOff = historyMachine.transition(stateACDKL, 'POWER');
    expect(historyMachine.transition(stateOff, 'DEEP_POWER').value).toEqual({
      on: { A: { C: 'D' }, K: 'L' }
    });
  });

  it('should re-enter each regions of parallel state correctly', () => {
    const stateOff = historyMachine.transition(stateACEKMO, 'POWER');
    expect(historyMachine.transition(stateOff, 'DEEP_POWER').value).toEqual({
      on: { A: { C: 'E' }, K: { M: 'O' } }
    });
  });

  it('should re-enter multiple history states', () => {
    const stateOff = historyMachine.transition(stateACEKMO, 'POWER');
    expect(
      historyMachine.transition(stateOff, 'PARALLEL_HISTORY').value
    ).toEqual({
      on: { A: { C: 'D' }, K: { M: 'N' } }
    });
  });

  it('should re-enter a parallel with partial history', () => {
    const stateOff = historyMachine.transition(stateACEKMO, 'POWER');
    expect(
      historyMachine.transition(stateOff, 'PARALLEL_SOME_HISTORY').value
    ).toEqual({
      on: { A: { C: 'D' }, K: { M: 'N' } }
    });
  });

  it('should re-enter a parallel with full history', () => {
    const stateOff = historyMachine.transition(stateACEKMO, 'POWER');
    expect(
      historyMachine.transition(stateOff, 'PARALLEL_DEEP_HISTORY').value
    ).toEqual({
      on: { A: { C: 'E' }, K: { M: 'O' } }
    });
  });
});

describe('transient history', () => {
  const transientMachine = createMachine({
    initial: 'A',
    states: {
      A: {
        on: { EVENT: 'B' }
      },
      B: {
        // eventless transition
        always: 'C'
      },
      C: {}
    }
  });

  it('should have history on transient transitions', () => {
    const nextState = transientMachine.transition('A', 'EVENT');
    expect(nextState.value).toEqual('C');
    expect(nextState.history).toBeDefined();
  });
});

it('internal transition to a history state should enter default history state configuration if the containing state has never been exited yet', () => {
  const service = interpret(
    createMachine({
      initial: 'first',
      states: {
        first: {
          on: {
            NEXT: 'second.other'
          }
        },
        second: {
          initial: 'nested',
          states: {
            nested: {},
            other: {},
            hist: {
              history: true
            }
          },
          on: {
            NEXT: {
              target: '.hist'
            }
          }
        }
      }
    })
  ).start();

  service.send('NEXT');
  service.send('NEXT');

  expect(service.state.value).toEqual({
    second: 'nested'
  });
});

describe('multistage history states', () => {
  const pcWithTurboButtonMachine = createMachine({
    key: 'pc-with-turbo-button',
    initial: 'off',
    states: {
      off: {
        on: { POWER: 'starting' }
      },
      starting: {
        on: { STARTED: 'running.H' }
      },
      running: {
        initial: 'normal',
        states: {
          normal: {
            on: { SWITCH_TURBO: 'turbo' }
          },
          turbo: {
            on: { SWITCH_TURBO: 'normal' }
          },
          H: {
            history: true
          }
        },
        on: {
          POWER: 'off'
        }
      }
    }
  });

  it('should go to the most recently visited state', () => {
    const onTurboState = pcWithTurboButtonMachine.transition(
      'running',
      'SWITCH_TURBO'
    );
    const offState = pcWithTurboButtonMachine.transition(onTurboState, 'POWER');
    const loadingState = pcWithTurboButtonMachine.transition(offState, 'POWER');

    expect(
      pcWithTurboButtonMachine.transition(loadingState, 'STARTED').value
    ).toEqual({ running: 'turbo' });
  });
});
