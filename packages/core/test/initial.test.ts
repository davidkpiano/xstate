import { interpret, createMachine } from '../src';

const config = {
  initial: 'a',
  states: {
    a: {
      initial: 'b',
      states: {
        b: {
          initial: 'c',
          states: {
            c: {}
          }
        }
      }
    },
    leaf: {}
  }
};

const deepMachine = createMachine(config);

const parallelDeepMachine = createMachine({
  type: 'parallel',
  states: {
    foo: config,
    bar: config
  }
});

const deepParallelMachine = createMachine({
  initial: 'one',
  states: {
    one: parallelDeepMachine.config,
    two: parallelDeepMachine.config
  }
});

describe('Initial states', () => {
  it('should return the correct initial state', () => {
    expect(deepMachine.initialState.value).toEqual({ a: { b: 'c' } });
  });

  it('should return the correct initial state (parallel)', () => {
    expect(parallelDeepMachine.initialState.value).toEqual({
      foo: { a: { b: 'c' } },
      bar: { a: { b: 'c' } }
    });
  });

  it('should return the correct initial state (deep parallel)', () => {
    expect(deepParallelMachine.initialState.value).toEqual({
      one: {
        foo: { a: { b: 'c' } },
        bar: { a: { b: 'c' } }
      }
    });
  });

  it('should resolve deep initial state', () => {
    const machine = createMachine({
      initial: '#deep_id',
      states: {
        foo: {
          initial: 'other',
          states: {
            other: {},
            deep: {
              id: 'deep_id'
            }
          }
        }
      }
    });
    const service = interpret(machine).start();
    expect(service.state.value).toEqual({ foo: 'deep' });
  });

  it('should resolve multiple deep initial states', () => {
    const machine = createMachine({
      initial: ['#foo_deep_id', '#bar_deep_id'],
      states: {
        root: {
          type: 'parallel',
          states: {
            foo: {
              initial: 'foo_other',
              states: {
                foo_other: {},
                foo_deep: {
                  id: 'foo_deep_id'
                }
              }
            },
            bar: {
              initial: 'bar_other',
              states: {
                bar_other: {},
                bar_deep: {
                  id: 'bar_deep_id'
                }
              }
            }
          }
        }
      }
    });
    const service = interpret(machine).start();
    expect(service.state.value).toEqual({
      root: {
        foo: 'foo_deep',
        bar: 'bar_deep'
      }
    });
  });

  it('should not entry default initial state of the parent if deep state is targeted with initial', () => {
    let called = false;

    const machine = createMachine({
      initial: '#deep_id',
      states: {
        foo: {
          initial: 'other',
          states: {
            other: {
              entry: () => {
                called = true;
              }
            },
            deep: {
              id: 'deep_id'
            }
          }
        }
      }
    });
    interpret(machine).start();
    expect(called).toEqual(false);
  });
});
