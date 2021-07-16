import { createMachine, interpret } from '../src/index';

describe('event descriptors', () => {
  it('should fallback to using wildcard transition definition (if specified)', () => {
    const machine = createMachine({
      initial: 'A',
      states: {
        A: {
          on: {
            FOO: 'B',
            '*': 'C'
          }
        },
        B: {},
        C: {}
      }
    });

    const service = interpret(machine).start();
    service.send('BAR');
    expect(service.state.value).toBe('C');
  });

  it('should not use wildcard transition over explicit one when using object `.on` config - even if wildcard comes first', () => {
    const machine = createMachine({
      initial: 'A',
      states: {
        A: {
          on: {
            '*': 'fail',
            NEXT: 'pass'
          }
        },
        fail: {},
        pass: {}
      }
    });

    const service = interpret(machine).start();
    service.send('NEXT');
    expect(service.state.value).toBe('pass');
  });

  it('should select wildcard over explicit event type for array `.on` config (according to document order)', () => {
    const machine = createMachine({
      initial: 'A',
      states: {
        A: {
          on: [
            { event: '*', target: 'pass' },
            { event: 'NEXT', target: 'fail' }
          ]
        },
        fail: {},
        pass: {}
      }
    });

    const service = interpret(machine).start();
    service.send('NEXT');
    expect(service.state.value).toBe('pass');
  });

  it('should NOT support non-tokenized wildcards', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine.transition(undefined, 'event').matches('success')
    ).toBeFalsy();
    expect(
      machine.transition(undefined, 'eventually').matches('success')
    ).toBeFalsy();
  });

  it('should support prefix matching with wildcards (+0)', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event.*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine.transition(undefined, 'event').matches('success')
    ).toBeTruthy();
    expect(
      machine.transition(undefined, 'eventually').matches('success')
    ).toBeFalsy();
  });

  it('should support prefix matching with wildcards (+1)', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event.*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine.transition(undefined, 'event.whatever').matches('success')
    ).toBeTruthy();
    expect(
      machine.transition(undefined, 'eventually').matches('success')
    ).toBeFalsy();
    expect(
      machine.transition(undefined, 'eventually.event').matches('success')
    ).toBeFalsy();
  });

  it('should support prefix matching with wildcards (+n)', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event.*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine.transition(undefined, 'event.first.second').matches('success')
    ).toBeTruthy();
  });

  it('should support prefix matching with wildcards (+n, multi-prefix)', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event.foo.bar.*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine
        .transition(undefined, 'event.foo.bar.first.second')
        .matches('success')
    ).toBeTruthy();
  });

  it('should only allow non-wildcard prefix matching for SCXML machines', () => {
    const nonSCXMLMachine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            event: 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const SCXMLMachine = createMachine({
      scxml: true,
      initial: 'start',
      states: {
        start: {
          on: {
            event: 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      nonSCXMLMachine.transition(undefined, 'event.whatever').matches('start')
    ).toBeTruthy();

    expect(
      SCXMLMachine.transition(undefined, 'event.whatever').matches('success')
    ).toBeTruthy();

    expect(
      SCXMLMachine.transition(undefined, 'eventually').matches('start')
    ).toBeTruthy();
  });

  it('should not match infix wildcards', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event.*.bar.*': 'success',
            '*.event.*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine
        .transition(undefined, 'event.foo.bar.first.second')
        .matches('success')
    ).toBeFalsy();
    expect(
      machine.transition(undefined, 'whatever.event').matches('success')
    ).toBeFalsy();
  });

  it('should not match wildcards as part of tokens', () => {
    const machine = createMachine({
      initial: 'start',
      states: {
        start: {
          on: {
            'event*.bar.*': 'success',
            '*event.*': 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    expect(
      machine.transition(undefined, 'eventually.bar.baz').matches('success')
    ).toBeFalsy();
    expect(
      machine.transition(undefined, 'prevent.whatever').matches('success')
    ).toBeFalsy();
  });
});
