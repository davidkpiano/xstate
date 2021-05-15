import { Machine, interpret } from '../src';

describe('guard conditions', () => {
  type LightMachineCtx = {
    elapsed: number;
  };
  type LightMachineEvents =
    | { type: 'TIMER'; elapsed: number }
    | {
        type: 'EMERGENCY';
        isEmergency?: boolean;
      }
    | { type: 'TIMER_COND_OBJ' }
    | { type: 'BAD_COND' };

  const lightMachine = Machine<LightMachineCtx, LightMachineEvents>(
    {
      key: 'light',
      initial: 'green',
      states: {
        green: {
          on: {
            TIMER: [
              {
                target: 'green',
                cond: ({ elapsed }) => elapsed < 100
              },
              {
                target: 'yellow',
                cond: ({ elapsed }) => elapsed >= 100 && elapsed < 200
              }
            ],
            EMERGENCY: {
              target: 'red',
              cond: (_, event) => !!event.isEmergency
            }
          }
        },
        yellow: {
          on: {
            TIMER: {
              target: 'red',
              cond: 'minTimeElapsed'
            },
            TIMER_COND_OBJ: {
              target: 'red',
              cond: {
                type: 'minTimeElapsed'
              }
            }
          }
        },
        red: {
          on: {
            BAD_COND: {
              target: 'red',
              cond: 'doesNotExist'
            }
          }
        }
      }
    },
    {
      guards: {
        minTimeElapsed: ({ elapsed }) => elapsed >= 100 && elapsed < 200
      }
    }
  );

  it('should transition only if condition is met', () => {
    expect(
      lightMachine.transition('green', 'TIMER', {
        elapsed: 50
      }).value
    ).toEqual('green');

    expect(
      lightMachine.transition('green', 'TIMER', {
        elapsed: 120
      }).value
    ).toEqual('yellow');
  });

  it('should transition if condition based on event is met', () => {
    expect(
      lightMachine.transition('green', {
        type: 'EMERGENCY',
        isEmergency: true
      }).value
    ).toEqual('red');
  });

  it('should not transition if condition based on event is not met', () => {
    expect(
      lightMachine.transition('green', {
        type: 'EMERGENCY'
      }).value
    ).toEqual('green');
  });

  it('should not transition if no condition is met', () => {
    const nextState = lightMachine.transition('green', 'TIMER', {
      elapsed: 9000
    });
    expect(nextState.value).toEqual('green');
    expect(nextState.actions).toEqual([]);
  });

  it('should work with defined string transitions', () => {
    const nextState = lightMachine.transition('yellow', 'TIMER', {
      elapsed: 150
    });
    expect(nextState.value).toEqual('red');
  });

  it('should work with guard objects', () => {
    const nextState = lightMachine.transition('yellow', 'TIMER_COND_OBJ', {
      elapsed: 150
    });
    expect(nextState.value).toEqual('red');
  });

  it('should work with defined string transitions (condition not met)', () => {
    const nextState = lightMachine.transition('yellow', 'TIMER', {
      elapsed: 10
    });
    expect(nextState.value).toEqual('yellow');
  });

  it('should throw if string transition is not defined', () => {
    expect(() => lightMachine.transition('red', 'BAD_COND')).toThrow();
  });

  it('errors from guards in invoke.onError transition should show correct error', (done) => {
    const machine = Machine({
      id: 'machine',
      initial: 'active',
      strict: true,
      states: {
        active: {
          invoke: {
            id: 'willThrow',
            src: () => Promise.reject(),
            onDone: 'complete',
            onError: [
              {
                target: 'active',
                cond: () => {
                  throw new Error('test');
                }
              },
              { target: 'error' }
            ]
          }
        },
        error: {},
        complete: {}
      }
    });

    const service = interpret(machine).onError((err) => {
      expect((err as Error).message).toContain('machine.active');
      expect((err as Error).message).toContain('test');
      done();
    });

    service.start();
  });

  it('errors from guards in invoke.onError transition should be captured in error.execution transition', (done) => {
    const machine = Machine({
      id: 'machine',
      initial: 'active',
      strict: true,
      states: {
        active: {
          invoke: {
            id: 'willThrow',
            src: () => Promise.reject(),
            onDone: 'complete',
            onError: [
              {
                target: 'active',
                cond: () => {
                  throw new Error('test');
                }
              },
              { target: 'error' }
            ]
          },
          on: {
            'error.execution': {
              target: 'success',
              cond: (_, e) => {
                return (
                  // error thrown by XState (failed to evaluate guard) but contains
                  // original error
                  e.data instanceof Error && e.data.message.includes('test')
                );
              }
            }
          }
        },
        error: {},
        complete: {},
        success: { type: 'final' }
      }
    });

    const service = interpret(machine).onDone(() => {
      done();
    });

    service.start();
  });
});

describe('guard conditions', () => {
  const machine = Machine({
    key: 'microsteps',
    type: 'parallel',
    states: {
      A: {
        initial: 'A0',
        states: {
          A0: {
            on: {
              A: 'A1'
            }
          },
          A1: {
            on: {
              A: 'A2'
            }
          },
          A2: {
            on: {
              A: 'A3'
            }
          },
          A3: {
            always: 'A4'
          },
          A4: {
            always: 'A5'
          },
          A5: {}
        }
      },
      B: {
        initial: 'B0',
        states: {
          B0: {
            always: [
              {
                target: 'B4',
                cond: (_state, _event, { state: s }) => s.matches('A.A4')
              }
            ],
            on: {
              T1: [
                {
                  target: 'B1',
                  cond: (_state, _event, { state: s }) => s.matches('A.A1')
                }
              ],
              T2: [
                {
                  target: 'B2',
                  cond: (_state, _event, { state: s }) => s.matches('A.A2')
                }
              ],
              T3: [
                {
                  target: 'B3',
                  cond: (_state, _event, { state: s }) => s.matches('A.A3')
                }
              ]
            }
          },
          B1: {},
          B2: {},
          B3: {},
          B4: {}
        }
      }
    }
  });

  it('should guard against transition', () => {
    expect(machine.transition({ A: 'A2', B: 'B0' }, 'T1').value).toEqual({
      A: 'A2',
      B: 'B0'
    });
  });

  it('should allow a matching transition', () => {
    expect(machine.transition({ A: 'A2', B: 'B0' }, 'T2').value).toEqual({
      A: 'A2',
      B: 'B2'
    });
  });

  it('should check guards with interim states', () => {
    expect(machine.transition({ A: 'A2', B: 'B0' }, 'A').value).toEqual({
      A: 'A5',
      B: 'B4'
    });
  });
});

describe('custom guards', () => {
  type Ctx = { count: number };
  type Events = { type: 'EVENT'; value: number };
  const machine = Machine<Ctx, Events>(
    {
      id: 'custom',
      initial: 'inactive',
      context: {
        count: 0
      },
      states: {
        inactive: {
          on: {
            EVENT: {
              target: 'active',
              cond: {
                type: 'custom',
                prop: 'count',
                op: 'greaterThan',
                compare: 3
              }
            }
          }
        },
        active: {}
      }
    },
    {
      guards: {
        custom: (ctx, e: Extract<Events, { type: 'EVENT' }>, meta) => {
          const { prop, compare, op } = meta.cond as any; // TODO: fix
          if (op === 'greaterThan') {
            return ctx[prop] + e.value > compare;
          }

          return false;
        }
      }
    }
  );

  it('should evaluate custom guards', () => {
    const passState = machine.transition(machine.initialState, {
      type: 'EVENT',
      value: 4
    });

    expect(passState.value).toEqual('active');

    const failState = machine.transition(machine.initialState, {
      type: 'EVENT',
      value: 3
    });

    expect(failState.value).toEqual('inactive');
  });
});

describe('referencing guards', () => {
  const stringGuardFn = () => true;
  const guardsMachine = Machine(
    {
      id: 'guards',
      initial: 'active',
      states: {
        active: {
          on: {
            EVENT: [
              { cond: 'string' },
              {
                cond: function guardFn() {
                  return true;
                }
              },
              {
                cond: {
                  type: 'object',
                  foo: 'bar'
                }
              }
            ]
          }
        }
      }
    },
    {
      guards: {
        string: stringGuardFn
      }
    }
  );

  const def = guardsMachine.definition;
  const [stringGuard, functionGuard, objectGuard] = def.states.active.on.EVENT;

  it('guard predicates should be able to be referenced from a string', () => {
    expect(stringGuard.cond!.predicate).toBeDefined();
    expect(stringGuard.cond!.name).toEqual('string');
  });

  it('guard predicates should be able to be referenced from a function', () => {
    expect(functionGuard.cond!.predicate).toBeDefined();
    expect(functionGuard.cond!.name).toEqual('guardFn');
  });

  it('guard predicates should be able to be referenced from an object', () => {
    expect(objectGuard.cond).toBeDefined();
    expect(objectGuard.cond).toEqual({
      type: 'object',
      foo: 'bar'
    });
  });

  it('should throw for guards with missing predicates', () => {
    const machine = Machine({
      id: 'invalid-predicate',
      initial: 'active',
      states: {
        active: {
          on: {
            EVENT: { target: 'inactive', cond: 'missing-predicate' }
          }
        },
        inactive: {}
      }
    });

    expect(() => {
      machine.transition(machine.initialState, 'EVENT');
    }).toThrow();
  });
});

describe('guards - other', () => {
  it('should allow for a fallback target to be a simple string', () => {
    const machine = Machine({
      initial: 'a',
      states: {
        a: {
          on: {
            EVENT: [{ target: 'b', cond: () => false }, 'c']
          }
        },
        b: {},
        c: {}
      }
    });

    const service = interpret(machine).start();
    service.send('EVENT');

    expect(service.state.value).toBe('c');
  });
});
