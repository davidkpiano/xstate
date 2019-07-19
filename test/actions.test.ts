import { assert } from 'chai';
import { Machine, assign, interpret } from '../src/index';
import { pure } from '../src/actions';

describe('onEntry/onExit actions', () => {
  const pedestrianStates = {
    initial: 'walk',
    states: {
      walk: {
        on: {
          PED_COUNTDOWN: 'wait'
        },
        onEntry: 'enter_walk',
        onExit: 'exit_walk'
      },
      wait: {
        on: {
          PED_COUNTDOWN: 'stop'
        },
        onEntry: 'enter_wait',
        onExit: 'exit_wait'
      },
      stop: {
        onEntry: ['enter_stop'],
        onExit: ['exit_stop']
      }
    }
  };

  const lightMachine = Machine({
    key: 'light',
    initial: 'green',
    states: {
      green: {
        on: {
          TIMER: 'yellow',
          POWER_OUTAGE: 'red',
          NOTHING: 'green'
        },
        onEntry: 'enter_green',
        onExit: 'exit_green'
      },
      yellow: {
        on: {
          TIMER: 'red',
          POWER_OUTAGE: 'red'
        },
        onEntry: 'enter_yellow',
        onExit: 'exit_yellow'
      },
      red: {
        on: {
          TIMER: 'green',
          POWER_OUTAGE: 'red',
          NOTHING: 'red'
        },
        onEntry: 'enter_red',
        onExit: 'exit_red',
        ...pedestrianStates
      }
    }
  });

  const newPedestrianStates = {
    initial: 'walk',
    states: {
      walk: {
        on: {
          PED_COUNTDOWN: 'wait'
        },
        entry: 'enter_walk',
        exit: 'exit_walk'
      },
      wait: {
        on: {
          PED_COUNTDOWN: 'stop'
        },
        entry: 'enter_wait',
        exit: 'exit_wait'
      },
      stop: {
        entry: ['enter_stop'],
        exit: ['exit_stop']
      }
    }
  };

  const newLightMachine = Machine({
    key: 'light',
    initial: 'green',
    states: {
      green: {
        on: {
          TIMER: 'yellow',
          POWER_OUTAGE: 'red',
          NOTHING: 'green'
        },
        entry: 'enter_green',
        exit: 'exit_green'
      },
      yellow: {
        on: {
          TIMER: 'red',
          POWER_OUTAGE: 'red'
        },
        entry: 'enter_yellow',
        exit: 'exit_yellow'
      },
      red: {
        on: {
          TIMER: 'green',
          POWER_OUTAGE: 'red',
          NOTHING: 'red'
        },
        entry: 'enter_red',
        exit: 'exit_red',
        ...newPedestrianStates
      }
    }
  });

  const parallelMachine = Machine({
    type: 'parallel',
    states: {
      a: {
        initial: 'a1',
        states: {
          a1: {
            on: {
              CHANGE: { target: 'a2', actions: ['do_a2', 'another_do_a2'] }
            },
            onEntry: 'enter_a1',
            onExit: 'exit_a1'
          },
          a2: { onEntry: 'enter_a2', onExit: 'exit_a2' }
        },
        onEntry: 'enter_a',
        onExit: 'exit_a'
      },
      b: {
        initial: 'b1',
        states: {
          b1: {
            on: { CHANGE: { target: 'b2', actions: 'do_b2' } },
            onEntry: 'enter_b1',
            onExit: 'exit_b1'
          },
          b2: { onEntry: 'enter_b2', onExit: 'exit_b2' }
        },
        onEntry: 'enter_b',
        onExit: 'exit_b'
      }
    }
  });

  const deepMachine = Machine({
    initial: 'a',
    states: {
      a: {
        initial: 'a1',
        states: {
          a1: {
            on: {
              NEXT: 'a2',
              NEXT_FN: 'a3'
            },
            onEntry: 'enter_a1',
            onExit: 'exit_a1'
          },
          a2: {
            onEntry: 'enter_a2',
            onExit: 'exit_a2'
          },
          a3: {
            on: {
              NEXT: {
                target: 'a2',
                actions: [
                  function do_a3_to_a2() {
                    return;
                  }
                ]
              }
            },
            onEntry: function enter_a3_fn() {
              return;
            },
            onExit: function exit_a3_fn() {
              return;
            }
          }
        },
        onEntry: 'enter_a',
        onExit: ['exit_a', 'another_exit_a'],
        on: { CHANGE: 'b' }
      },
      b: {
        onEntry: ['enter_b', 'another_enter_b'],
        onExit: 'exit_b',
        initial: 'b1',
        states: {
          b1: {
            onEntry: 'enter_b1',
            onExit: 'exit_b1'
          }
        }
      }
    }
  });

  const parallelMachine2 = Machine({
    initial: 'A',
    states: {
      A: {
        on: {
          'to-B': 'B'
        }
      },
      B: {
        type: 'parallel',
        on: {
          'to-A': 'A'
        },
        states: {
          C: {
            initial: 'C1',
            states: {
              C1: {},
              C2: {}
            }
          },
          D: {
            initial: 'D1',
            states: {
              D1: {
                on: {
                  'to-D2': 'D2'
                }
              },
              D2: {
                onEntry: ['D2 Entry'],
                onExit: ['D2 Exit']
              }
            }
          }
        }
      }
    }
  });

  describe('State.actions', () => {
    it('should return the entry actions of an initial state', () => {
      assert.sameMembers(lightMachine.initialState.actions.map(a => a.type), [
        'enter_green'
      ]);
    });

    it('should return the entry actions of an initial state (deep)', () => {
      assert.sameMembers(deepMachine.initialState.actions.map(a => a.type), [
        'enter_a',
        'enter_a1'
      ]);
    });

    it('should return the entry actions of an initial state (parallel)', () => {
      assert.sameMembers(
        parallelMachine.initialState.actions.map(a => a.type),
        ['enter_a', 'enter_b', 'enter_a1', 'enter_b1']
      );
    });

    it('should return the entry and exit actions of a transition', () => {
      assert.deepEqual(
        lightMachine.transition('green', 'TIMER').actions.map(a => a.type),
        ['exit_green', 'enter_yellow']
      );
    });

    it('should return the entry and exit actions of a deep transition', () => {
      assert.deepEqual(
        lightMachine.transition('yellow', 'TIMER').actions.map(a => a.type),
        ['exit_yellow', 'enter_red', 'enter_walk']
      );
    });

    it('should return the entry and exit actions of a nested transition', () => {
      assert.deepEqual(
        lightMachine
          .transition('red.walk', 'PED_COUNTDOWN')
          .actions.map(a => a.type),
        ['exit_walk', 'enter_wait']
      );
    });

    it('should not have actions for unhandled events (shallow)', () => {
      assert.deepEqual(
        lightMachine.transition('green', 'FAKE').actions.map(a => a.type),
        []
      );
    });

    it('should not have actions for unhandled events (deep)', () => {
      assert.deepEqual(
        lightMachine.transition('red', 'FAKE').actions.map(a => a.type),
        []
      );
    });

    it('should exit and enter the state for self-transitions (shallow)', () => {
      assert.deepEqual(
        lightMachine.transition('green', 'NOTHING').actions.map(a => a.type),
        ['exit_green', 'enter_green']
      );
    });

    it('should exit and enter the state for self-transitions (deep)', () => {
      // 'red' state resolves to 'red.walk'
      assert.deepEqual(
        lightMachine.transition('red', 'NOTHING').actions.map(a => a.type),
        ['exit_walk', 'exit_red', 'enter_red', 'enter_walk']
      );
    });

    it('should return actions for parallel machines', () => {
      assert.deepEqual(
        parallelMachine
          .transition(parallelMachine.initialState, 'CHANGE')
          .actions.map(a => a.type),
        [
          'exit_a1',
          'exit_b1',
          'do_a2',
          'another_do_a2',
          'do_b2',
          'enter_a2',
          'enter_b2'
        ]
      );
    });

    it('should return nested actions in the correct (child to parent) order', () => {
      assert.deepEqual(
        deepMachine.transition('a.a1', 'CHANGE').actions.map(a => a.type),
        [
          'exit_a1',
          'exit_a',
          'another_exit_a',
          'enter_b',
          'another_enter_b',
          'enter_b1'
        ]
      );
    });

    it('should ignore parent state actions for same-parent substates', () => {
      assert.deepEqual(
        deepMachine.transition('a.a1', 'NEXT').actions.map(a => a.type),
        ['exit_a1', 'enter_a2']
      );
    });

    it('should work with function actions', () => {
      assert.deepEqual(
        deepMachine
          .transition(deepMachine.initialState, 'NEXT_FN')
          .actions.map(action => action.type),
        ['exit_a1', 'enter_a3_fn']
      );

      assert.deepEqual(
        deepMachine
          .transition('a.a3', 'NEXT')
          .actions.map(action => action.type),
        ['exit_a3_fn', 'do_a3_to_a2', 'enter_a2']
      );
    });

    it('should exit children of parallel state nodes', () => {
      const stateB = parallelMachine2.transition(
        parallelMachine2.initialState,
        'to-B'
      );
      const stateD2 = parallelMachine2.transition(stateB, 'to-D2');
      const stateA = parallelMachine2.transition(stateD2, 'to-A');

      assert.deepEqual(stateA.actions.map(action => action.type), ['D2 Exit']);
    });

    describe('should ignore same-parent state actions (sparse)', () => {
      const fooBar = {
        initial: 'foo',
        states: {
          foo: {
            on: {
              TACK: 'bar',
              ABSOLUTE_TACK: '#machine.ping.bar'
            }
          },
          bar: {
            on: {
              TACK: 'foo'
            }
          }
        }
      };

      const pingPong = Machine({
        initial: 'ping',
        key: 'machine',
        states: {
          ping: {
            onEntry: ['entryEvent'],
            on: {
              TICK: 'pong'
            },
            ...fooBar
          },
          pong: {
            on: {
              TICK: 'ping'
            }
          }
        }
      });

      it('with a relative transition', () => {
        assert.isEmpty(pingPong.transition('ping.foo', 'TACK').actions);
      });

      it('with an absolute transition', () => {
        assert.isEmpty(
          pingPong.transition('ping.foo', 'ABSOLUTE_TACK').actions
        );
      });
    });
  });

  describe('State.actions (with entry/exit instead of onEntry/onExit)', () => {
    it('should return the entry actions of an initial state', () => {
      assert.sameMembers(
        newLightMachine.initialState.actions.map(a => a.type),
        ['enter_green']
      );
    });

    it('should return the entry and exit actions of a transition', () => {
      assert.deepEqual(
        newLightMachine.transition('green', 'TIMER').actions.map(a => a.type),
        ['exit_green', 'enter_yellow']
      );
    });

    it('should return the entry and exit actions of a deep transition', () => {
      assert.deepEqual(
        newLightMachine.transition('yellow', 'TIMER').actions.map(a => a.type),
        ['exit_yellow', 'enter_red', 'enter_walk']
      );
    });

    it('should return the entry and exit actions of a nested transition', () => {
      assert.deepEqual(
        newLightMachine
          .transition('red.walk', 'PED_COUNTDOWN')
          .actions.map(a => a.type),
        ['exit_walk', 'enter_wait']
      );
    });

    it('should not have actions for unhandled events (shallow)', () => {
      assert.deepEqual(
        newLightMachine.transition('green', 'FAKE').actions.map(a => a.type),
        []
      );
    });

    it('should not have actions for unhandled events (deep)', () => {
      assert.deepEqual(
        newLightMachine.transition('red', 'FAKE').actions.map(a => a.type),
        []
      );
    });

    it('should exit and enter the state for self-transitions (shallow)', () => {
      assert.deepEqual(
        newLightMachine.transition('green', 'NOTHING').actions.map(a => a.type),
        ['exit_green', 'enter_green']
      );
    });

    it('should exit and enter the state for self-transitions (deep)', () => {
      // 'red' state resolves to 'red.walk'
      assert.deepEqual(
        newLightMachine.transition('red', 'NOTHING').actions.map(a => a.type),
        ['exit_walk', 'exit_red', 'enter_red', 'enter_walk']
      );
    });
  });

  describe('parallel states', () => {
    it('should return entry action defined on parallel state', () => {
      const parallelMachineWithOnEntry = Machine({
        id: 'fetch',
        context: { attempts: 0 },
        initial: 'start',
        states: {
          start: {
            on: { ENTER_PARALLEL: 'p1' }
          },
          p1: {
            type: 'parallel',
            onEntry: 'enter_p1',
            states: {
              nested: {
                initial: 'inner',
                states: {
                  inner: {
                    onEntry: 'enter_inner'
                  }
                }
              }
            }
          }
        }
      });

      assert.deepEqual(
        parallelMachineWithOnEntry
          .transition('start', 'ENTER_PARALLEL')
          .actions.map(a => a.type),
        ['enter_p1', 'enter_inner']
      );
    });
  });

  describe('targetless transitions', () => {
    it("shouldn't exit a state on a parent's targetless transition", done => {
      const actual: string[] = []

      const parent = Machine({
        initial: 'one',
        on: {
          WHATEVER: {
            actions: () => {
              actual.push('got WHATEVER');
            }
          }
        },
        states: {
          one: {
            entry: () => {
              actual.push('entered one');
            },
            on: {
              '': 'two'
            }
          },
          two: {
            exit: () => {
              actual.push('exitted two');
            }
          }
        }
      });

      const service = interpret(parent).start();

      Promise.resolve()
        .then(() => {
          service.send("WHATEVER");
        })
        .then(() => {
          assert.deepEqual(actual, ["entered one", "got WHATEVER"]);
          done();
        })
        .catch(done);
    })
  })
});

describe('actions on invalid transition', () => {
  const stopMachine = Machine({
    initial: 'idle',
    states: {
      idle: {
        on: {
          STOP: {
            target: 'stop',
            actions: ['action1']
          }
        }
      },
      stop: {}
    }
  });

  it('should not recall previous actions', () => {
    const nextState = stopMachine.transition('idle', 'STOP');
    assert.isEmpty(stopMachine.transition(nextState, 'INVALID').actions);
  });
});

describe('actions config', () => {
  type EventType =
    | { type: 'definedAction' }
    | { type: 'updateContext' }
    | { type: 'EVENT' }
    | { type: 'E' };
  interface Context {
    count: number;
  }
  interface State {
    states: {
      a: {};
      b: {};
    };
  }

  // tslint:disable-next-line:no-empty
  const definedAction = () => {};
  const simpleMachine = Machine<Context, State, EventType>(
    {
      id: 'simple',
      initial: 'a',
      context: {
        count: 0
      },
      states: {
        a: {
          onEntry: [
            'definedAction',
            { type: 'definedAction' },
            'undefinedAction'
          ],
          on: {
            EVENT: {
              target: 'b',
              actions: [{ type: 'definedAction' }, { type: 'updateContext' }]
            }
          }
        },
        b: {}
      },
      on: {
        E: '#simple.a'
      }
    },
    {
      actions: {
        definedAction,
        updateContext: assign({ count: 10 })
      }
    }
  );
  it('should reference actions defined in actions parameter of machine options', () => {
    const { initialState } = simpleMachine;
    const nextState = simpleMachine.transition(initialState, 'E');

    assert.includeMembers(nextState.actions.map(a => a.type), [
      'definedAction',
      'undefinedAction'
    ]);

    assert.deepEqual(nextState.actions, [
      { type: 'definedAction', exec: definedAction },
      { type: 'definedAction', exec: definedAction },
      { type: 'undefinedAction', exec: undefined }
    ]);
  });

  it('should reference actions defined in actions parameter of machine options (initial state)', () => {
    const { initialState } = simpleMachine;

    assert.includeMembers(initialState.actions.map(a => a.type), [
      'definedAction',
      'undefinedAction'
    ]);
  });

  it('should be able to reference action implementations from action objects', () => {
    const state = simpleMachine.transition('a', 'EVENT');

    assert.deepEqual(state.actions, [
      { type: 'definedAction', exec: definedAction }
    ]);

    assert.deepEqual(state.context, { count: 10 });
  });

  it('should work with anonymous functions (with warning)', () => {
    let onEntryCalled = false;
    let actionCalled = false;
    let onExitCalled = false;

    const anonMachine = Machine({
      id: 'anon',
      initial: 'active',
      states: {
        active: {
          onEntry: () => (onEntryCalled = true),
          onExit: () => (onExitCalled = true),
          on: {
            EVENT: {
              target: 'inactive',
              actions: [() => (actionCalled = true)]
            }
          }
        },
        inactive: {}
      }
    });

    const { initialState } = anonMachine;

    initialState.actions.forEach(action => {
      if (action.exec) {
        action.exec(
          initialState.context,
          { type: 'any' },
          {
            action,
            state: initialState
          }
        );
      }
    });

    assert.isTrue(onEntryCalled);

    const inactiveState = anonMachine.transition(initialState, 'EVENT');

    assert.lengthOf(inactiveState.actions, 2);

    inactiveState.actions.forEach(action => {
      if (action.exec) {
        action.exec(
          inactiveState.context,
          { type: 'EVENT' },
          {
            action,
            state: initialState
          }
        );
      }
    });

    assert.isTrue(onExitCalled, 'onExit should be called');
    assert.isTrue(actionCalled, 'action should be called');
  });
});

describe('action meta', () => {
  it('should provide the original action and state to the exec function', done => {
    const testMachine = Machine(
      {
        id: 'test',
        initial: 'foo',
        states: {
          foo: {
            onEntry: {
              type: 'entryAction',
              value: 'something'
            }
          }
        }
      },
      {
        actions: {
          entryAction: (_, __, meta) => {
            assert.equal(meta.state.value, 'foo');
            assert.equal(meta.action.type, 'entryAction');
            assert.equal(meta.action.value, 'something');
            done();
          }
        }
      }
    );

    interpret(testMachine).start();
  });
});

describe('purely defined actions', () => {
  const dynamicMachine = Machine({
    id: 'dynamic',
    initial: 'idle',
    context: {
      items: [{ id: 1 }, { id: 2 }, { id: 3 }]
    },
    states: {
      idle: {
        on: {
          SINGLE: {
            actions: pure<any, any>((ctx, e) => {
              if (ctx.items.length > 0) {
                return {
                  type: 'SINGLE_EVENT',
                  length: ctx.items.length,
                  id: e.id
                };
              }
            })
          },
          NONE: {
            actions: pure<any, any>((ctx, e) => {
              if (ctx.items.length > 5) {
                return {
                  type: 'SINGLE_EVENT',
                  length: ctx.items.length,
                  id: e.id
                };
              }
            })
          },
          EACH: {
            actions: pure<any, any>(ctx =>
              ctx.items.map((item, index) => ({ type: 'EVENT', item, index }))
            )
          }
        }
      }
    }
  });

  it('should allow for a purely defined dynamic action', () => {
    const nextState = dynamicMachine.transition(dynamicMachine.initialState, {
      type: 'SINGLE',
      id: 3
    });

    assert.deepEqual(nextState.actions, [
      { type: 'SINGLE_EVENT', length: 3, id: 3 }
    ]);
  });

  it('should allow for purely defined lack of actions', () => {
    const nextState = dynamicMachine.transition(dynamicMachine.initialState, {
      type: 'NONE',
      id: 3
    });

    assert.deepEqual(nextState.actions, []);
  });

  it('should allow for purely defined dynamic actions', () => {
    const nextState = dynamicMachine.transition(
      dynamicMachine.initialState,
      'EACH'
    );

    assert.deepEqual(nextState.actions, [
      { type: 'EVENT', item: { id: 1 }, index: 0 },
      { type: 'EVENT', item: { id: 2 }, index: 1 },
      { type: 'EVENT', item: { id: 3 }, index: 2 }
    ]);
  });
});
