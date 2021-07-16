import { raise, assign } from '../src/actions';
import { createMachine, interpret } from '../src';
import { testMultiTransition } from './utils';

const composerMachine = createMachine({
  strict: true,
  initial: 'ReadOnly',
  states: {
    ReadOnly: {
      id: 'ReadOnly',
      initial: 'StructureEdit',
      entry: ['selectNone'],
      states: {
        StructureEdit: {
          id: 'StructureEditRO',
          type: 'parallel',
          on: {
            switchToProjectManagement: [
              {
                target: 'ProjectManagement'
              }
            ]
          },
          states: {
            SelectionStatus: {
              initial: 'SelectedNone',
              on: {
                singleClickActivity: [
                  {
                    target: '.SelectedActivity',
                    actions: ['selectActivity']
                  }
                ],
                singleClickLink: [
                  {
                    target: '.SelectedLink',
                    actions: ['selectLink']
                  }
                ]
              },
              states: {
                SelectedNone: {
                  entry: ['redraw']
                },
                SelectedActivity: {
                  entry: ['redraw'],
                  on: {
                    singleClickCanvas: [
                      {
                        target: 'SelectedNone',
                        actions: ['selectNone']
                      }
                    ]
                  }
                },
                SelectedLink: {
                  entry: ['redraw'],
                  on: {
                    singleClickCanvas: [
                      {
                        target: 'SelectedNone',
                        actions: ['selectNone']
                      }
                    ]
                  }
                }
              }
            },
            ClipboardStatus: {
              initial: 'Empty',
              states: {
                Empty: {
                  entry: ['emptyClipboard'],
                  on: {
                    cutInClipboardSuccess: [
                      {
                        target: 'FilledByCut'
                      }
                    ],
                    copyInClipboardSuccess: [
                      {
                        target: 'FilledByCopy'
                      }
                    ]
                  }
                },
                FilledByCopy: {
                  on: {
                    cutInClipboardSuccess: [
                      {
                        target: 'FilledByCut'
                      }
                    ],
                    copyInClipboardSuccess: [
                      {
                        target: 'FilledByCopy'
                      }
                    ],
                    pasteFromClipboardSuccess: [
                      {
                        target: 'FilledByCopy'
                      }
                    ]
                  }
                },
                FilledByCut: {
                  on: {
                    cutInClipboardSuccess: [
                      {
                        target: 'FilledByCut'
                      }
                    ],
                    copyInClipboardSuccess: [
                      {
                        target: 'FilledByCopy'
                      }
                    ],
                    pasteFromClipboardSuccess: [
                      {
                        target: 'Empty'
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        ProjectManagement: {
          id: 'ProjectManagementRO',
          type: 'parallel',
          on: {
            switchToStructureEdit: [
              {
                target: 'StructureEdit'
              }
            ]
          },
          states: {
            SelectionStatus: {
              initial: 'SelectedNone',
              on: {
                singleClickActivity: [
                  {
                    target: '.SelectedActivity',
                    actions: ['selectActivity']
                  }
                ],
                singleClickLink: [
                  {
                    target: '.SelectedLink',
                    actions: ['selectLink']
                  }
                ]
              },
              states: {
                SelectedNone: {
                  entry: ['redraw']
                },
                SelectedActivity: {
                  entry: ['redraw'],
                  on: {
                    singleClickCanvas: [
                      {
                        target: 'SelectedNone',
                        actions: ['selectNone']
                      }
                    ]
                  }
                },
                SelectedLink: {
                  entry: ['redraw'],
                  on: {
                    singleClickCanvas: [
                      {
                        target: 'SelectedNone',
                        actions: ['selectNone']
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});

const wakMachine = createMachine({
  id: 'wakMachine',
  type: 'parallel',
  strict: true,
  states: {
    wak1: {
      initial: 'wak1sonA',
      states: {
        wak1sonA: {
          entry: 'wak1sonAenter',
          exit: 'wak1sonAexit'
        },
        wak1sonB: {
          entry: 'wak1sonBenter',
          exit: 'wak1sonBexit'
        }
      },
      on: {
        WAK1: '.wak1sonB'
      },
      entry: 'wak1enter',
      exit: 'wak1exit'
    },
    wak2: {
      initial: 'wak2sonA',
      states: {
        wak2sonA: {
          entry: 'wak2sonAenter',
          exit: 'wak2sonAexit'
        },
        wak2sonB: {
          entry: 'wak2sonBenter',
          exit: 'wak2sonBexit'
        }
      },
      on: {
        WAK2: '.wak2sonB'
      },
      entry: 'wak2enter',
      exit: 'wak2exit'
    }
  }
});

const wordMachine = createMachine({
  id: 'word',
  type: 'parallel',
  states: {
    bold: {
      initial: 'off',
      states: {
        on: {
          on: { TOGGLE_BOLD: 'off' }
        },
        off: {
          on: { TOGGLE_BOLD: 'on' }
        }
      }
    },
    underline: {
      initial: 'off',
      states: {
        on: {
          on: { TOGGLE_UNDERLINE: 'off' }
        },
        off: {
          on: { TOGGLE_UNDERLINE: 'on' }
        }
      }
    },
    italics: {
      initial: 'off',
      states: {
        on: {
          on: { TOGGLE_ITALICS: 'off' }
        },
        off: {
          on: { TOGGLE_ITALICS: 'on' }
        }
      }
    },
    list: {
      initial: 'none',
      states: {
        none: {
          on: { BULLETS: 'bullets', NUMBERS: 'numbers' }
        },
        bullets: {
          on: { NONE: 'none', NUMBERS: 'numbers' }
        },
        numbers: {
          on: { BULLETS: 'bullets', NONE: 'none' }
        }
      }
    }
  },
  on: {
    RESET: '#word' // TODO: this should be 'word' or [{ internal: false }]
  }
});

const flatParallelMachine = createMachine({
  type: 'parallel',
  states: {
    foo: {},
    bar: {},
    baz: {
      initial: 'one',
      states: {
        one: { on: { E: 'two' } },
        two: {}
      }
    }
  }
});

const raisingParallelMachine = createMachine({
  strict: true,
  type: 'parallel',
  states: {
    OUTER1: {
      initial: 'C',
      states: {
        A: {
          entry: [raise('TURN_OFF')],
          on: {
            EVENT_OUTER1_B: 'B',
            EVENT_OUTER1_C: 'C'
          }
        },
        B: {
          entry: [raise('TURN_ON')],
          on: {
            EVENT_OUTER1_A: 'A',
            EVENT_OUTER1_C: 'C'
          }
        },
        C: {
          entry: [raise('CLEAR')],
          on: {
            EVENT_OUTER1_A: 'A',
            EVENT_OUTER1_B: 'B'
          }
        }
      }
    },
    OUTER2: {
      type: 'parallel',
      states: {
        INNER1: {
          initial: 'ON',
          states: {
            OFF: {
              on: {
                TURN_ON: 'ON'
              }
            },
            ON: {
              on: {
                CLEAR: 'OFF'
              }
            }
          }
        },
        INNER2: {
          initial: 'OFF',
          states: {
            OFF: {
              on: {
                TURN_ON: 'ON'
              }
            },
            ON: {
              on: {
                TURN_OFF: 'OFF'
              }
            }
          }
        }
      }
    }
  }
});

const nestedParallelState = createMachine({
  type: 'parallel',
  states: {
    OUTER1: {
      initial: 'STATE_OFF',
      states: {
        STATE_OFF: {
          on: {
            EVENT_COMPLEX: 'STATE_ON',
            EVENT_SIMPLE: 'STATE_ON'
          }
        },
        STATE_ON: {
          type: 'parallel',
          states: {
            STATE_NTJ0: {
              initial: 'STATE_IDLE_0',
              states: {
                STATE_IDLE_0: {
                  on: {
                    EVENT_STATE_NTJ0_WORK: 'STATE_WORKING_0'
                  }
                },
                STATE_WORKING_0: {
                  on: {
                    EVENT_STATE_NTJ0_IDLE: 'STATE_IDLE_0'
                  }
                }
              }
            },
            STATE_NTJ1: {
              initial: 'STATE_IDLE_1',
              states: {
                STATE_IDLE_1: {
                  on: {
                    EVENT_STATE_NTJ1_WORK: 'STATE_WORKING_1'
                  }
                },
                STATE_WORKING_1: {
                  on: {
                    EVENT_STATE_NTJ1_IDLE: 'STATE_IDLE_1'
                  }
                }
              }
            }
          }
        }
      }
    },
    OUTER2: {
      initial: 'STATE_OFF',
      states: {
        STATE_OFF: {
          on: {
            EVENT_COMPLEX: 'STATE_ON_COMPLEX',
            EVENT_SIMPLE: 'STATE_ON_SIMPLE'
          }
        },
        STATE_ON_SIMPLE: {},
        STATE_ON_COMPLEX: {
          type: 'parallel',
          states: {
            STATE_INNER1: {
              initial: 'STATE_OFF',
              states: {
                STATE_OFF: {},
                STATE_ON: {}
              }
            },
            STATE_INNER2: {
              initial: 'STATE_OFF',
              states: {
                STATE_OFF: {},
                STATE_ON: {}
              }
            }
          }
        }
      }
    }
  }
});

const deepFlatParallelMachine = createMachine({
  type: 'parallel',
  states: {
    X: {},
    V: {
      initial: 'A',
      on: {
        a: {
          target: 'V.A'
        },
        b: {
          target: 'V.B'
        },
        c: {
          target: 'V.C'
        }
      },
      states: {
        A: {},
        B: {
          initial: 'BB',
          states: {
            BB: {
              type: 'parallel',
              states: {
                BBB_A: {},
                BBB_B: {}
              }
            }
          }
        },
        C: {}
      }
    }
  }
});

describe('parallel states', () => {
  it('should have initial parallel states', () => {
    const { initialState } = wordMachine;

    expect(initialState.value).toEqual({
      bold: 'off',
      italics: 'off',
      underline: 'off',
      list: 'none'
    });
  });

  const expected = {
    '{"bold": "off"}': {
      TOGGLE_BOLD: {
        bold: 'on',
        italics: 'off',
        underline: 'off',
        list: 'none'
      }
    },
    '{"bold": "on"}': {
      TOGGLE_BOLD: {
        bold: 'off',
        italics: 'off',
        underline: 'off',
        list: 'none'
      }
    },
    [JSON.stringify({
      bold: 'off',
      italics: 'off',
      underline: 'on',
      list: 'bullets'
    })]: {
      'TOGGLE_BOLD, TOGGLE_ITALICS': {
        bold: 'on',
        italics: 'on',
        underline: 'on',
        list: 'bullets'
      },
      RESET: {
        bold: 'off',
        italics: 'off',
        underline: 'off',
        list: 'none'
      }
    }
  };

  Object.keys(expected).forEach((fromState) => {
    Object.keys(expected[fromState]).forEach((eventTypes) => {
      const toState = expected[fromState][eventTypes];

      it(`should go from ${fromState} to ${JSON.stringify(
        toState
      )} on ${eventTypes}`, () => {
        const resultState = testMultiTransition(
          wordMachine,
          fromState,
          eventTypes
        );

        expect(resultState.value).toEqual(toState);
      });
    });
  });

  it('should have all parallel states represented in the state value', () => {
    const nextState = wakMachine.transition(wakMachine.initialState, 'WAK1');

    expect(nextState.value).toEqual({ wak1: 'wak1sonB', wak2: 'wak2sonA' });
  });

  it('should have all parallel states represented in the state value (2)', () => {
    const nextState = wakMachine.transition(wakMachine.initialState, 'WAK2');

    expect(nextState.value).toEqual({ wak1: 'wak1sonA', wak2: 'wak2sonB' });
  });

  it('should work with regions without states', () => {
    expect(flatParallelMachine.initialState.value).toEqual({
      foo: {},
      bar: {},
      baz: 'one'
    });
  });

  it('should work with regions without states', () => {
    const nextState = flatParallelMachine.transition(
      flatParallelMachine.initialState,
      'E'
    );
    expect(nextState.value).toEqual({
      foo: {},
      bar: {},
      baz: 'two'
    });
  });

  it('should properly transition to relative substate', () => {
    const nextState = composerMachine.transition(
      composerMachine.initialState,
      'singleClickActivity'
    );

    expect(nextState.value).toEqual({
      ReadOnly: {
        StructureEdit: {
          SelectionStatus: 'SelectedActivity',
          ClipboardStatus: 'Empty'
        }
      }
    });
  });

  it('should properly transition according to entry events on an initial state', () => {
    expect(raisingParallelMachine.initialState.value).toEqual({
      OUTER1: 'C',
      OUTER2: {
        INNER1: 'OFF',
        INNER2: 'OFF'
      }
    });
  });

  it('should properly transition when raising events for a parallel state', () => {
    const nextState = raisingParallelMachine.transition(
      raisingParallelMachine.initialState,
      'EVENT_OUTER1_B'
    );

    expect(nextState.value).toEqual({
      OUTER1: 'B',
      OUTER2: {
        INNER1: 'ON',
        INNER2: 'ON'
      }
    });
  });

  it('should handle simultaneous orthogonal transitions', () => {
    type Events = { type: 'CHANGE'; value: string } | { type: 'SAVE' };
    const simultaneousMachine = createMachine<{ value: string }, Events>({
      id: 'yamlEditor',
      type: 'parallel',
      context: {
        value: ''
      },
      states: {
        editing: {
          on: {
            CHANGE: {
              actions: assign({
                value: (_, e) => e.value
              })
            }
          }
        },
        status: {
          initial: 'unsaved',
          states: {
            unsaved: {
              on: {
                SAVE: {
                  target: 'saved',
                  actions: 'save'
                }
              }
            },
            saved: {
              on: {
                CHANGE: 'unsaved'
              }
            }
          }
        }
      }
    });

    const savedState = simultaneousMachine.transition(
      simultaneousMachine.initialState,
      'SAVE'
    );
    const unsavedState = simultaneousMachine.transition(savedState, {
      type: 'CHANGE',
      value: 'something'
    });

    expect(unsavedState.value).toEqual({
      editing: {},
      status: 'unsaved'
    });

    expect(unsavedState.context).toEqual({
      value: 'something'
    });
  });

  describe('transitions with nested parallel states', () => {
    const initialState = nestedParallelState.initialState;
    const simpleNextState = nestedParallelState.transition(
      initialState,
      'EVENT_SIMPLE'
    );
    const complexNextState = nestedParallelState.transition(
      initialState,
      'EVENT_COMPLEX'
    );

    it('should properly transition when in a simple nested state', () => {
      const nextState = nestedParallelState.transition(
        simpleNextState,
        'EVENT_STATE_NTJ0_WORK'
      );

      expect(nextState.value).toEqual({
        OUTER1: {
          STATE_ON: {
            STATE_NTJ0: 'STATE_WORKING_0',
            STATE_NTJ1: 'STATE_IDLE_1'
          }
        },
        OUTER2: 'STATE_ON_SIMPLE'
      });
    });

    it('should properly transition when in a complex nested state', () => {
      const nextState = nestedParallelState.transition(
        complexNextState,
        'EVENT_STATE_NTJ0_WORK'
      );

      expect(nextState.value).toEqual({
        OUTER1: {
          STATE_ON: {
            STATE_NTJ0: 'STATE_WORKING_0',
            STATE_NTJ1: 'STATE_IDLE_1'
          }
        },
        OUTER2: {
          STATE_ON_COMPLEX: {
            STATE_INNER1: 'STATE_OFF',
            STATE_INNER2: 'STATE_OFF'
          }
        }
      });
    });
  });

  // https://github.com/davidkpiano/xstate/issues/191
  describe('nested flat parallel states', () => {
    const machine = createMachine({
      initial: 'A',
      states: {
        A: {
          on: {
            'to-B': 'B'
          }
        },
        B: {
          type: 'parallel',
          states: {
            C: {},
            D: {}
          }
        }
      },
      on: {
        'to-A': 'A'
      }
    });

    it('should represent the flat nested parallel states in the state value', () => {
      const result = machine.transition(machine.initialState, 'to-B');

      expect(result.value).toEqual({
        B: {
          C: {},
          D: {}
        }
      });
    });
  });

  describe('deep flat parallel states', () => {
    it('should properly evaluate deep flat parallel states', () => {
      const state1 = deepFlatParallelMachine.transition(
        deepFlatParallelMachine.initialState,
        'a'
      );
      const state2 = deepFlatParallelMachine.transition(state1, 'c');
      const state3 = deepFlatParallelMachine.transition(state2, 'b');
      expect(state3.value).toEqual({
        V: {
          B: {
            BB: {
              BBB_A: {},
              BBB_B: {}
            }
          }
        },
        X: {}
      });
    });

    it('should not overlap resolved state configuration in state resolution', () => {
      const machine = createMachine({
        id: 'pipeline',
        type: 'parallel',
        states: {
          foo: {
            on: {
              UPDATE: {
                actions: () => {
                  /* do nothing */
                }
              }
            }
          },
          bar: {
            on: {
              UPDATE: '.baz'
            },
            initial: 'idle',
            states: {
              idle: {},
              baz: {}
            }
          }
        }
      });

      expect(() => {
        machine.transition(machine.initialState, 'UPDATE');
      }).not.toThrow();
    });
  });

  describe('other', () => {
    // https://github.com/davidkpiano/xstate/issues/518
    it('regions should be able to transition to orthogonal regions', () => {
      const testMachine = createMachine({
        id: 'app',
        type: 'parallel',
        states: {
          Pages: {
            id: 'Pages',
            initial: 'About',
            states: {
              About: {
                id: 'About',
                on: {
                  dashboard: '#Dashboard'
                }
              },
              Dashboard: {
                id: 'Dashboard',
                on: {
                  about: '#About'
                }
              }
            }
          },
          Menu: {
            id: 'Menu',
            initial: 'Closed',
            states: {
              Closed: {
                id: 'Closed',
                on: {
                  toggle: '#Opened'
                }
              },
              Opened: {
                id: 'Opened',
                on: {
                  toggle: '#Closed',
                  'go to dashboard': {
                    // TODO: see if just '#Dashboard' conforms to SCXML spec
                    target: ['#Dashboard', '#Opened']
                  }
                }
              }
            }
          }
        }
      });

      const openMenuState = testMachine.transition(
        testMachine.initialState,
        'toggle'
      );

      const dashboardState = testMachine.transition(
        openMenuState,
        'go to dashboard'
      );

      expect(
        dashboardState.matches({ Menu: 'Opened', Pages: 'Dashboard' })
      ).toBe(true);
    });

    // https://github.com/davidkpiano/xstate/issues/531
    it('should calculate the entry set for external transitions in parallel states', () => {
      const testMachine = createMachine<{ log: string[] }>({
        id: 'test',
        context: { log: [] },
        type: 'parallel',
        states: {
          foo: {
            initial: 'foobar',
            states: {
              foobar: {
                on: {
                  GOTO_FOOBAZ: 'foobaz'
                }
              },
              foobaz: {
                entry: assign({ log: (ctx) => [...ctx.log, 'entered foobaz'] }),
                on: {
                  GOTO_FOOBAZ: 'foobaz'
                }
              }
            }
          },
          bar: {}
        }
      });

      const run1 = testMachine.transition(
        testMachine.initialState,
        'GOTO_FOOBAZ'
      );
      const run2 = testMachine.transition(run1, 'GOTO_FOOBAZ');

      expect(run2.context.log.length).toBe(2);
    });
  });

  it('should raise a "done.state.*" event when all child states reach final state', (done) => {
    const machine = createMachine({
      id: 'test',
      initial: 'p',
      states: {
        p: {
          type: 'parallel',
          states: {
            a: {
              initial: 'idle',
              states: {
                idle: {
                  on: {
                    FINISH: 'finished'
                  }
                },
                finished: {
                  type: 'final'
                }
              }
            },
            b: {
              initial: 'idle',
              states: {
                idle: {
                  on: {
                    FINISH: 'finished'
                  }
                },
                finished: {
                  type: 'final'
                }
              }
            },
            c: {
              initial: 'idle',
              states: {
                idle: {
                  on: {
                    FINISH: 'finished'
                  }
                },
                finished: {
                  type: 'final'
                }
              }
            }
          },
          onDone: 'success'
        },
        success: {
          type: 'final'
        }
      }
    });

    const service = interpret(machine)
      .onDone(() => {
        done();
      })
      .start();

    service.send('FINISH');
  });
});
