import {
  Machine,
  createMachine,
  assign,
  forwardTo,
  interpret,
  spawn
} from '../src/index';
import { pure, sendParent, log, choose } from '../src/actions';

describe('entry/exit actions', () => {
  const pedestrianStates = {
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
            entry: 'enter_a1',
            exit: 'exit_a1'
          },
          a2: { entry: 'enter_a2', exit: 'exit_a2' }
        },
        entry: 'enter_a',
        exit: 'exit_a'
      },
      b: {
        initial: 'b1',
        states: {
          b1: {
            on: { CHANGE: { target: 'b2', actions: 'do_b2' } },
            entry: 'enter_b1',
            exit: 'exit_b1'
          },
          b2: { entry: 'enter_b2', exit: 'exit_b2' }
        },
        entry: 'enter_b',
        exit: 'exit_b'
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
            entry: 'enter_a1',
            exit: 'exit_a1'
          },
          a2: {
            entry: 'enter_a2',
            exit: 'exit_a2'
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
            entry: function enter_a3_fn() {
              return;
            },
            exit: function exit_a3_fn() {
              return;
            }
          }
        },
        entry: 'enter_a',
        exit: ['exit_a', 'another_exit_a'],
        on: { CHANGE: 'b' }
      },
      b: {
        entry: ['enter_b', 'another_enter_b'],
        exit: 'exit_b',
        initial: 'b1',
        states: {
          b1: {
            entry: 'enter_b1',
            exit: 'exit_b1'
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
                entry: ['D2 Entry'],
                exit: ['D2 Exit']
              }
            }
          }
        }
      }
    }
  });

  describe('State.actions', () => {
    it('should return the entry actions of an initial state', () => {
      expect(lightMachine.initialState.actions.map((a) => a.type)).toEqual([
        'enter_green'
      ]);
    });

    it('should return the entry actions of an initial state (deep)', () => {
      expect(deepMachine.initialState.actions.map((a) => a.type)).toEqual([
        'enter_a',
        'enter_a1'
      ]);
    });

    it('should return the entry actions of an initial state (parallel)', () => {
      expect(parallelMachine.initialState.actions.map((a) => a.type)).toEqual([
        'enter_a',
        'enter_a1',
        'enter_b',
        'enter_b1'
      ]);
    });

    it('should return the entry and exit actions of a transition', () => {
      expect(
        lightMachine.transition('green', 'TIMER').actions.map((a) => a.type)
      ).toEqual(['exit_green', 'enter_yellow']);
    });

    it('should return the entry and exit actions of a deep transition', () => {
      expect(
        lightMachine.transition('yellow', 'TIMER').actions.map((a) => a.type)
      ).toEqual(['exit_yellow', 'enter_red', 'enter_walk']);
    });

    it('should return the entry and exit actions of a nested transition', () => {
      expect(
        lightMachine
          .transition('red.walk', 'PED_COUNTDOWN')
          .actions.map((a) => a.type)
      ).toEqual(['exit_walk', 'enter_wait']);
    });

    it('should not have actions for unhandled events (shallow)', () => {
      expect(
        lightMachine.transition('green', 'FAKE').actions.map((a) => a.type)
      ).toEqual([]);
    });

    it('should not have actions for unhandled events (deep)', () => {
      expect(
        lightMachine.transition('red', 'FAKE').actions.map((a) => a.type)
      ).toEqual([]);
    });

    it('should exit and enter the state for self-transitions (shallow)', () => {
      expect(
        lightMachine.transition('green', 'NOTHING').actions.map((a) => a.type)
      ).toEqual(['exit_green', 'enter_green']);
    });

    it('should exit and enter the state for self-transitions (deep)', () => {
      // 'red' state resolves to 'red.walk'
      expect(
        lightMachine.transition('red', 'NOTHING').actions.map((a) => a.type)
      ).toEqual(['exit_walk', 'exit_red', 'enter_red', 'enter_walk']);
    });

    it('should return actions for parallel machines', () => {
      expect(
        parallelMachine
          .transition(parallelMachine.initialState, 'CHANGE')
          .actions.map((a) => a.type)
      ).toEqual([
        'exit_b1', // reverse document order
        'exit_a1',
        'do_a2',
        'another_do_a2',
        'do_b2',
        'enter_a2',
        'enter_b2'
      ]);
    });

    it('should return nested actions in the correct (child to parent) order', () => {
      expect(
        deepMachine.transition('a.a1', 'CHANGE').actions.map((a) => a.type)
      ).toEqual([
        'exit_a1',
        'exit_a',
        'another_exit_a',
        'enter_b',
        'another_enter_b',
        'enter_b1'
      ]);
    });

    it('should ignore parent state actions for same-parent substates', () => {
      expect(
        deepMachine.transition('a.a1', 'NEXT').actions.map((a) => a.type)
      ).toEqual(['exit_a1', 'enter_a2']);
    });

    it('should work with function actions', () => {
      expect(
        deepMachine
          .transition(deepMachine.initialState, 'NEXT_FN')
          .actions.map((action) => action.type)
      ).toEqual(['exit_a1', 'enter_a3_fn']);

      expect(
        deepMachine
          .transition('a.a3', 'NEXT')
          .actions.map((action) => action.type)
      ).toEqual(['exit_a3_fn', 'do_a3_to_a2', 'enter_a2']);
    });

    it('should exit children of parallel state nodes', () => {
      const stateB = parallelMachine2.transition(
        parallelMachine2.initialState,
        'to-B'
      );
      const stateD2 = parallelMachine2.transition(stateB, 'to-D2');
      const stateA = parallelMachine2.transition(stateD2, 'to-A');

      expect(stateA.actions.map((action) => action.type)).toEqual(['D2 Exit']);
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
            entry: ['entryEvent'],
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
        expect(pingPong.transition('ping.foo', 'TACK').actions).toHaveLength(0);
      });

      it('with an absolute transition', () => {
        expect(
          pingPong.transition('ping.foo', 'ABSOLUTE_TACK').actions
        ).toHaveLength(0);
      });
    });
  });

  describe('State.actions (with entry/exit instead of onEntry/onExit)', () => {
    it('should return the entry actions of an initial state', () => {
      expect(newLightMachine.initialState.actions.map((a) => a.type)).toEqual([
        'enter_green'
      ]);
    });

    it('should return the entry and exit actions of a transition', () => {
      expect(
        newLightMachine.transition('green', 'TIMER').actions.map((a) => a.type)
      ).toEqual(['exit_green', 'enter_yellow']);
    });

    it('should return the entry and exit actions of a deep transition', () => {
      expect(
        newLightMachine.transition('yellow', 'TIMER').actions.map((a) => a.type)
      ).toEqual(['exit_yellow', 'enter_red', 'enter_walk']);
    });

    it('should return the entry and exit actions of a nested transition', () => {
      expect(
        newLightMachine
          .transition('red.walk', 'PED_COUNTDOWN')
          .actions.map((a) => a.type)
      ).toEqual(['exit_walk', 'enter_wait']);
    });

    it('should not have actions for unhandled events (shallow)', () => {
      expect(
        newLightMachine.transition('green', 'FAKE').actions.map((a) => a.type)
      ).toEqual([]);
    });

    it('should not have actions for unhandled events (deep)', () => {
      expect(
        newLightMachine.transition('red', 'FAKE').actions.map((a) => a.type)
      ).toEqual([]);
    });

    it('should exit and enter the state for self-transitions (shallow)', () => {
      expect(
        newLightMachine
          .transition('green', 'NOTHING')
          .actions.map((a) => a.type)
      ).toEqual(['exit_green', 'enter_green']);
    });

    it('should exit and enter the state for self-transitions (deep)', () => {
      // 'red' state resolves to 'red.walk'
      expect(
        newLightMachine.transition('red', 'NOTHING').actions.map((a) => a.type)
      ).toEqual(['exit_walk', 'exit_red', 'enter_red', 'enter_walk']);
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
            entry: 'enter_p1',
            states: {
              nested: {
                initial: 'inner',
                states: {
                  inner: {
                    entry: 'enter_inner'
                  }
                }
              }
            }
          }
        }
      });

      expect(
        parallelMachineWithOnEntry
          .transition('start', 'ENTER_PARALLEL')
          .actions.map((a) => a.type)
      ).toEqual(['enter_p1', 'enter_inner']);
    });
  });

  describe('targetless transitions', () => {
    it("shouldn't exit a state on a parent's targetless transition", (done) => {
      const actual: string[] = [];

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
            always: 'two'
          },
          two: {
            exit: () => {
              actual.push('exited two');
            }
          }
        }
      });

      const service = interpret(parent).start();

      Promise.resolve()
        .then(() => {
          service.send('WHATEVER');
        })
        .then(() => {
          expect(actual).toEqual(['entered one', 'got WHATEVER']);
          done();
        })
        .catch(done);
    });

    it("shouldn't exit (and reenter) state on targetless delayed transition", (done) => {
      const actual: string[] = [];

      const machine = Machine({
        initial: 'one',
        states: {
          one: {
            entry: () => {
              actual.push('entered one');
            },
            exit: () => {
              actual.push('exited one');
            },
            after: {
              10: {
                actions: () => {
                  actual.push('got FOO');
                }
              }
            }
          }
        }
      });

      interpret(machine).start();

      setTimeout(() => {
        expect(actual).toEqual(['entered one', 'got FOO']);
        done();
      }, 50);
    });
  });
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
    expect(stopMachine.transition(nextState, 'INVALID').actions).toHaveLength(
      0
    );
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
      initial: 'a',
      context: {
        count: 0
      },
      states: {
        a: {
          entry: [
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
        E: 'a'
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

    expect(nextState.actions.map((a) => a.type)).toEqual(
      expect.arrayContaining(['definedAction', 'undefinedAction'])
    );

    expect(nextState.actions).toEqual([
      { type: 'definedAction', exec: definedAction },
      { type: 'definedAction', exec: definedAction },
      { type: 'undefinedAction', exec: undefined }
    ]);
  });

  it('should reference actions defined in actions parameter of machine options (initial state)', () => {
    const { initialState } = simpleMachine;

    expect(initialState.actions.map((a) => a.type)).toEqual(
      expect.arrayContaining(['definedAction', 'undefinedAction'])
    );
  });

  it('should be able to reference action implementations from action objects', () => {
    const state = simpleMachine.transition('a', 'EVENT');

    expect(state.actions).toEqual([
      { type: 'definedAction', exec: definedAction }
    ]);

    expect(state.context).toEqual({ count: 10 });
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
          entry: () => (onEntryCalled = true),
          exit: () => (onExitCalled = true),
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

    initialState.actions.forEach((action) => {
      if (action.exec) {
        action.exec(
          initialState.context,
          { type: 'any' },
          {
            action,
            state: initialState,
            _event: initialState._event
          }
        );
      }
    });

    expect(onEntryCalled).toBe(true);

    const inactiveState = anonMachine.transition(initialState, 'EVENT');

    expect(inactiveState.actions.length).toBe(2);

    inactiveState.actions.forEach((action) => {
      if (action.exec) {
        action.exec(
          inactiveState.context,
          { type: 'EVENT' },
          {
            action,
            state: initialState,
            _event: initialState._event
          }
        );
      }
    });

    expect(onExitCalled).toBe(true);
    expect(actionCalled).toBe(true);
  });
});

describe('action meta', () => {
  it('should provide the original action and state to the exec function', (done) => {
    const testMachine = Machine(
      {
        id: 'test',
        initial: 'foo',
        states: {
          foo: {
            entry: {
              type: 'entryAction',
              value: 'something'
            }
          }
        }
      },
      {
        actions: {
          entryAction: (_, __, meta) => {
            expect(meta.state.value).toEqual('foo');
            expect(meta.action.type).toEqual('entryAction');
            expect(meta.action.value).toEqual('something');
            done();
          }
        }
      }
    );

    interpret(testMachine).start();
  });
});

describe('purely defined actions', () => {
  interface Ctx {
    items: Array<{ id: number }>;
  }
  type Events =
    | { type: 'SINGLE'; id: number }
    | { type: 'NONE'; id: number }
    | { type: 'EACH' };

  const dynamicMachine = Machine<Ctx, Events>({
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
            actions: pure<any, any>((ctx) =>
              ctx.items.map((item, index) => ({
                type: 'EVENT',
                item,
                index
              }))
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

    expect(nextState.actions).toEqual([
      {
        type: 'SINGLE_EVENT',
        length: 3,
        id: 3
      }
    ]);
  });

  it('should allow for purely defined lack of actions', () => {
    const nextState = dynamicMachine.transition(dynamicMachine.initialState, {
      type: 'NONE',
      id: 3
    });

    expect(nextState.actions).toEqual([]);
  });

  it('should allow for purely defined dynamic actions', () => {
    const nextState = dynamicMachine.transition(
      dynamicMachine.initialState,
      'EACH'
    );

    expect(nextState.actions).toEqual([
      {
        type: 'EVENT',
        item: { id: 1 },
        index: 0
      },
      {
        type: 'EVENT',
        item: { id: 2 },
        index: 1
      },
      {
        type: 'EVENT',
        item: { id: 3 },
        index: 2
      }
    ]);
  });
});

describe('forwardTo()', () => {
  it('should forward an event to a service', (done) => {
    const child = Machine<void, { type: 'EVENT'; value: number }>({
      id: 'child',
      initial: 'active',
      states: {
        active: {
          on: {
            EVENT: {
              actions: sendParent('SUCCESS'),
              cond: (_, e) => e.value === 42
            }
          }
        }
      }
    });

    const parent = Machine({
      id: 'parent',
      initial: 'first',
      states: {
        first: {
          invoke: { src: child, id: 'myChild' },
          on: {
            EVENT: {
              actions: forwardTo('myChild')
            },
            SUCCESS: 'last'
          }
        },
        last: {
          type: 'final'
        }
      }
    });

    const service = interpret(parent)
      .onDone(() => done())
      .start();

    service.send('EVENT', { value: 42 });
  });

  it('should forward an event to a service (dynamic)', (done) => {
    const child = Machine<void, { type: 'EVENT'; value: number }>({
      id: 'child',
      initial: 'active',
      states: {
        active: {
          on: {
            EVENT: {
              actions: sendParent('SUCCESS'),
              cond: (_, e) => e.value === 42
            }
          }
        }
      }
    });

    const parent = Machine<{ child: any }>({
      id: 'parent',
      initial: 'first',
      context: {
        child: null
      },
      states: {
        first: {
          entry: assign({
            child: () => spawn(child)
          }),
          on: {
            EVENT: {
              actions: forwardTo((ctx) => ctx.child)
            },
            SUCCESS: 'last'
          }
        },
        last: {
          type: 'final'
        }
      }
    });

    const service = interpret(parent)
      .onDone(() => done())
      .start();

    service.send('EVENT', { value: 42 });
  });
});

describe('log()', () => {
  const logMachine = Machine<{ count: number }>({
    id: 'log',
    initial: 'string',
    context: {
      count: 42
    },
    states: {
      string: {
        entry: log('some string', 'string label'),
        on: {
          EXPR: {
            actions: log((ctx) => `expr ${ctx.count}`, 'expr label')
          }
        }
      }
    }
  });

  it('should log a string', () => {
    expect(logMachine.initialState.actions[0]).toMatchInlineSnapshot(`
      Object {
        "expr": "some string",
        "label": "string label",
        "type": "xstate.log",
        "value": "some string",
      }
    `);
  });

  it('should log an expression', () => {
    const nextState = logMachine.transition(logMachine.initialState, 'EXPR');
    expect(nextState.actions[0]).toMatchInlineSnapshot(`
      Object {
        "expr": [Function],
        "label": "expr label",
        "type": "xstate.log",
        "value": "expr 42",
      }
    `);
  });
});

describe('choose', () => {
  it('should execute a single conditional action', () => {
    interface Ctx {
      answer?: number;
    }

    const machine = createMachine<Ctx>({
      context: {},
      initial: 'foo',
      states: {
        foo: {
          entry: choose([
            { cond: () => true, actions: assign<Ctx>({ answer: 42 }) }
          ])
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ answer: 42 });
  });

  it('should execute a multiple conditional actions', () => {
    let executed = false;

    interface Ctx {
      answer?: number;
    }

    const machine = createMachine<Ctx>({
      context: {},
      initial: 'foo',
      states: {
        foo: {
          entry: choose([
            {
              cond: () => true,
              actions: [() => (executed = true), assign<Ctx>({ answer: 42 })]
            }
          ])
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ answer: 42 });
    expect(executed).toBeTruthy();
  });

  it('should only execute matched actions', () => {
    interface Ctx {
      answer?: number;
      shouldNotAppear?: boolean;
    }

    const machine = createMachine<Ctx>({
      context: {},
      initial: 'foo',
      states: {
        foo: {
          entry: choose([
            {
              cond: () => false,
              actions: assign<Ctx>({ shouldNotAppear: true })
            },
            { cond: () => true, actions: assign<Ctx>({ answer: 42 }) }
          ])
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ answer: 42 });
  });

  it('should allow for fallback unguarded actions', () => {
    interface Ctx {
      answer?: number;
      shouldNotAppear?: boolean;
    }

    const machine = createMachine<Ctx>({
      context: {},
      initial: 'foo',
      states: {
        foo: {
          entry: choose([
            {
              cond: () => false,
              actions: assign<Ctx>({ shouldNotAppear: true })
            },
            { actions: assign<Ctx>({ answer: 42 }) }
          ])
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ answer: 42 });
  });

  it('should allow for nested conditional actions', () => {
    interface Ctx {
      firstLevel: boolean;
      secondLevel: boolean;
      thirdLevel: boolean;
    }

    const machine = createMachine<Ctx>({
      context: {
        firstLevel: false,
        secondLevel: false,
        thirdLevel: false
      },
      initial: 'foo',
      states: {
        foo: {
          entry: choose([
            {
              cond: () => true,
              actions: [
                assign<Ctx>({ firstLevel: true }),
                choose([
                  {
                    cond: () => true,
                    actions: [
                      assign<Ctx>({ secondLevel: true }),
                      choose([
                        {
                          cond: () => true,
                          actions: [assign<Ctx>({ thirdLevel: true })]
                        }
                      ])
                    ]
                  }
                ])
              ]
            }
          ])
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({
      firstLevel: true,
      secondLevel: true,
      thirdLevel: true
    });
  });

  it('should provide context to a condition expression', () => {
    interface Ctx {
      counter: number;
      answer?: number;
    }
    const machine = createMachine<Ctx>({
      context: {
        counter: 101
      },
      initial: 'foo',
      states: {
        foo: {
          entry: choose([
            {
              cond: (ctx) => ctx.counter > 100,
              actions: assign<Ctx>({ answer: 42 })
            }
          ])
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ counter: 101, answer: 42 });
  });

  it('should provide event to a condition expression', () => {
    interface Ctx {
      answer?: number;
    }
    interface Events {
      type: 'NEXT';
      counter: number;
    }

    const machine = createMachine<Ctx, Events>({
      context: {},
      initial: 'foo',
      states: {
        foo: {
          on: {
            NEXT: {
              target: 'bar',
              actions: choose<Ctx, Events>([
                {
                  cond: (_, event) => event.counter > 100,
                  actions: assign<Ctx, Events>({ answer: 42 })
                }
              ])
            }
          }
        },
        bar: {}
      }
    });

    const service = interpret(machine).start();
    service.send({ type: 'NEXT', counter: 101 });
    expect(service.state.context).toEqual({ answer: 42 });
  });

  it('should provide stateGuard.state to a condition expression', () => {
    type Ctx = { counter: number; answer?: number };
    const machine = createMachine<Ctx>({
      context: {
        counter: 101
      },
      type: 'parallel',
      states: {
        foo: {
          initial: 'waiting',
          states: {
            waiting: {
              on: {
                GIVE_ANSWER: 'answering'
              }
            },
            answering: {
              entry: choose([
                {
                  cond: (_, __, { state }) => state.matches('bar'),
                  actions: assign<Ctx>({ answer: 42 })
                }
              ])
            }
          }
        },
        bar: {}
      }
    });

    const service = interpret(machine).start();
    service.send('GIVE_ANSWER');

    expect(service.state.context).toEqual({ counter: 101, answer: 42 });
  });

  it('should be able to use actions and guards defined in options', () => {
    interface Ctx {
      answer?: number;
    }

    const machine = createMachine<Ctx>(
      {
        context: {},
        initial: 'foo',
        states: {
          foo: {
            entry: choose([{ cond: 'worstGuard', actions: 'revealAnswer' }])
          }
        }
      },
      {
        guards: {
          worstGuard: () => true
        },
        actions: {
          revealAnswer: assign<Ctx>({ answer: 42 })
        }
      }
    );

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ answer: 42 });
  });

  it('should be able to use choose actions from within options', () => {
    interface Ctx {
      answer?: number;
    }

    const machine = createMachine<Ctx>(
      {
        context: {},
        initial: 'foo',
        states: {
          foo: {
            entry: 'conditionallyRevealAnswer'
          }
        }
      },
      {
        guards: {
          worstGuard: () => true
        },
        actions: {
          revealAnswer: assign<Ctx>({ answer: 42 }),
          conditionallyRevealAnswer: choose([
            { cond: 'worstGuard', actions: 'revealAnswer' }
          ])
        }
      }
    );

    const service = interpret(machine).start();

    expect(service.state.context).toEqual({ answer: 42 });
  });

  // https://github.com/davidkpiano/xstate/issues/1109
  it('exit actions should be called when invoked machine reaches final state', (done) => {
    let exitCalled = false;
    let childExitCalled = false;
    const childMachine = Machine({
      exit: () => {
        exitCalled = true;
      },
      initial: 'a',
      states: {
        a: {
          type: 'final',
          exit: () => {
            childExitCalled = true;
          }
        }
      }
    });

    const parentMachine = Machine({
      initial: 'active',
      states: {
        active: {
          invoke: {
            src: childMachine,
            onDone: 'finished'
          }
        },
        finished: {
          type: 'final'
        }
      }
    });

    interpret(parentMachine)
      .onDone(() => {
        expect(exitCalled).toBeTruthy();
        expect(childExitCalled).toBeTruthy();
        done();
      })
      .start();
  });

  it('exit actions should be called when stopping a machine', () => {
    let exitCalled = false;
    let childExitCalled = false;

    const machine = Machine({
      exit: () => {
        exitCalled = true;
      },
      initial: 'a',
      states: {
        a: {
          exit: () => {
            childExitCalled = true;
          }
        }
      }
    });

    const service = interpret(machine).start();
    service.stop();

    expect(exitCalled).toBeTruthy();
    expect(childExitCalled).toBeTruthy();
  });
});

describe('sendParent', () => {
  // https://github.com/davidkpiano/xstate/issues/711
  it('TS: should compile for any event', () => {
    interface ChildContext {}
    interface ChildEvent {
      type: 'CHILD';
    }

    const child = Machine<ChildContext, any, ChildEvent>({
      id: 'child',
      initial: 'start',
      states: {
        start: {
          // This should not be a TypeScript error
          entry: [sendParent({ type: 'PARENT' })]
        }
      }
    });

    expect(child).toBeTruthy();
  });
});

describe('action errors', () => {
  it('errors from actions should be caught in interpreter.onError()', (done) => {
    const testMachine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            EVENT: {
              actions: () => {
                throw new Error('example action error');
              }
            }
          }
        }
      }
    });

    const service = interpret(testMachine).onError((err) => {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatchInlineSnapshot(
        `"example action error"`
      );
      done();
    });

    service.start();

    service.send('EVENT');
  });

  it('errors from actions should be caught in error.execution', (done) => {
    const testMachine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            EVENT: {
              actions: () => {
                throw new Error('example action error');
              }
            },
            'error.execution': {
              target: 'success',
              cond: (_, e) => {
                return (
                  e.data instanceof Error &&
                  e.data.message === 'example action error'
                );
              }
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const service = interpret(testMachine).onDone(() => {
      // expect(err).toBeInstanceOf(Error);
      // expect((err as Error).message).toMatchInlineSnapshot(
      //   `"example action error"`
      // );
      done();
    });

    service.start();

    service.send('EVENT');
  });
});
