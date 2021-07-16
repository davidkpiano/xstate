import { createMachine } from '../src/index';
import { stateIn } from '../src/guards';

const machine = createMachine({
  type: 'parallel',
  states: {
    a: {
      initial: 'a1',
      states: {
        a1: {
          on: {
            EVENT2: {
              target: 'a2',
              guard: stateIn({ b: 'b2' })
            },
            EVENT3: {
              target: 'a2',
              guard: stateIn('#b_b2')
            }
          }
        },
        a2: {
          id: 'a_a2'
        }
      }
    },
    b: {
      initial: 'b1',
      states: {
        b1: {
          on: {
            EVENT: {
              target: 'b2',
              guard: stateIn('#a_a2')
            }
          }
        },
        b2: {
          id: 'b_b2',
          type: 'parallel',
          states: {
            foo: {
              initial: 'foo1',
              states: {
                foo1: {
                  on: {
                    EVENT_DEEP: { target: 'foo2', guard: stateIn('#bar1') }
                  }
                },
                foo2: {}
              }
            },
            bar: {
              initial: 'bar1',
              states: {
                bar1: {
                  id: 'bar1'
                },
                bar2: {}
              }
            }
          }
        }
      }
    }
  }
});

const lightMachine = createMachine({
  id: 'light',
  initial: 'green',
  states: {
    green: { on: { TIMER: 'yellow' } },
    yellow: { on: { TIMER: 'red' } },
    red: {
      initial: 'walk',
      states: {
        walk: {},
        wait: {},
        stop: {}
      },
      on: {
        TIMER: [
          {
            target: 'green',
            guard: stateIn({ red: 'stop' })
          }
        ]
      }
    }
  }
});

describe('transition "in" check', () => {
  it('should transition if string state path matches current state value', () => {
    expect(
      machine.transition(
        {
          a: 'a1',
          b: {
            b2: {
              foo: 'foo2',
              bar: 'bar1'
            }
          }
        },
        'EVENT2'
      ).value
    ).toEqual({
      a: 'a2',
      b: {
        b2: {
          foo: 'foo2',
          bar: 'bar1'
        }
      }
    });
  });

  it('should transition if state node ID matches current state value', () => {
    expect(
      machine.transition(
        {
          a: 'a1',
          b: {
            b2: {
              foo: 'foo2',
              bar: 'bar1'
            }
          }
        },
        'EVENT3'
      ).value
    ).toEqual({
      a: 'a2',
      b: {
        b2: {
          foo: 'foo2',
          bar: 'bar1'
        }
      }
    });
  });

  it('should not transition if string state path does not match current state value', () => {
    expect(machine.transition({ a: 'a1', b: 'b1' }, 'EVENT1').value).toEqual({
      a: 'a1',
      b: 'b1'
    });
  });

  it('should not transition if state value matches current state value', () => {
    expect(
      machine.transition(
        {
          a: 'a1',
          b: {
            b2: {
              foo: 'foo2',
              bar: 'bar1'
            }
          }
        },
        'EVENT2'
      ).value
    ).toEqual({
      a: 'a2',
      b: {
        b2: {
          foo: 'foo2',
          bar: 'bar1'
        }
      }
    });
  });

  it('matching should be relative to grandparent (match)', () => {
    expect(
      machine.transition(
        { a: 'a1', b: { b2: { foo: 'foo1', bar: 'bar1' } } },
        'EVENT_DEEP'
      ).value
    ).toEqual({
      a: 'a1',
      b: {
        b2: {
          foo: 'foo2',
          bar: 'bar1'
        }
      }
    });
  });

  it('matching should be relative to grandparent (no match)', () => {
    expect(
      machine.transition(
        { a: 'a1', b: { b2: { foo: 'foo1', bar: 'bar2' } } },
        'EVENT_DEEP'
      ).value
    ).toEqual({
      a: 'a1',
      b: {
        b2: {
          foo: 'foo1',
          bar: 'bar2'
        }
      }
    });
  });

  it('should work to forbid events', () => {
    const walkState = lightMachine.transition({ red: 'walk' }, 'TIMER');

    expect(walkState.value).toEqual({ red: 'walk' });

    const waitState = lightMachine.transition({ red: 'wait' }, 'TIMER');

    expect(waitState.value).toEqual({ red: 'wait' });

    const stopState = lightMachine.transition({ red: 'stop' }, 'TIMER');

    expect(stopState.value).toEqual('green');
  });
});
