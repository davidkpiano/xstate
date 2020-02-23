import { createMachine, sendParent, send, interpret } from '../src';

describe('state context', () => {
  it('should assign context when a state is entered (property value)', () => {
    const machine = createMachine({
      initial: 'inactive',
      context: {
        count: 0,
        message: 'secret'
      },
      states: {
        inactive: {
          on: {
            TRIGGER: 'active'
          }
        },
        active: {
          context: {
            count: 10
          }
        }
      }
    });

    const { initialState } = machine;

    expect(initialState.context).toEqual({
      count: 0,
      message: 'secret'
    });

    const nextState = machine.transition(initialState, 'TRIGGER');

    expect(nextState.context).toEqual({
      count: 10,
      message: 'secret'
    });
  });

  it('should assign context when a state is entered (property assigner)', () => {
    const machine = createMachine({
      initial: 'inactive',
      context: {
        count: 0,
        message: 'secret'
      },
      states: {
        inactive: {
          on: {
            TRIGGER: 'active'
          }
        },
        active: {
          context: {
            // Note: original ctx.message is used here
            count: ctx => ctx.count + ctx.message.length,
            message: ctx => ctx.message.repeat(2)
          }
        }
      }
    });

    const nextState = machine.transition(undefined, 'TRIGGER');

    expect(nextState.context).toEqual({
      count: 6,
      message: 'secretsecret'
    });
  });

  it('should assign context when a state is entered (full assigner)', () => {
    const machine = createMachine({
      initial: 'inactive',
      context: {
        count: 0,
        message: 'secret'
      },
      states: {
        inactive: {
          on: {
            TRIGGER: 'active'
          }
        },
        active: {
          context: ctx => {
            const newMessage = ctx.message.repeat(2);
            const newCount = newMessage.length;

            return {
              message: newMessage,
              count: newCount
            };
          }
        }
      }
    });

    const nextState = machine.transition(undefined, 'TRIGGER');

    expect(nextState.context).toEqual({
      count: 12,
      message: 'secretsecret'
    });
  });
});

describe('transition context', () => {
  interface CounterContext {
    count: number;
    foo: string;
    maybe?: string;
  }

  const counterMachine = createMachine<CounterContext>({
    initial: 'counting',
    context: { count: 0, foo: 'bar' },
    states: {
      counting: {
        on: {
          INC: [
            {
              target: 'counting',
              context: ctx => ({
                count: ctx.count + 1
              })
            }
          ],
          DEC: [
            {
              target: 'counting',
              context: {
                count: ctx => ctx.count - 1
              }
            }
          ],
          WIN_PROP: [
            {
              target: 'counting',
              context: {
                count: () => 100,
                foo: () => 'win'
              }
            }
          ],
          WIN_STATIC: [
            {
              target: 'counting',
              context: {
                count: 100,
                foo: 'win'
              }
            }
          ],
          WIN_MIX: [
            {
              target: 'counting',
              context: {
                count: () => 100,
                foo: 'win'
              }
            }
          ],
          WIN: [
            {
              target: 'counting',
              context: () => ({
                count: 100,
                foo: 'win'
              })
            }
          ],
          SET_MAYBE: [
            {
              context: {
                maybe: 'defined'
              }
            }
          ]
        }
      }
    }
  });

  it('applies the assignment to the external state (property assignment)', () => {
    const oneState = counterMachine.transition(
      counterMachine.initialState,
      'DEC'
    );

    expect(oneState.value).toEqual('counting');
    expect(oneState.context).toEqual({ count: -1, foo: 'bar' });

    const twoState = counterMachine.transition(oneState, 'DEC');

    expect(twoState.value).toEqual('counting');
    expect(twoState.context).toEqual({ count: -2, foo: 'bar' });
  });

  it('applies the assignment to the external state', () => {
    const oneState = counterMachine.transition(
      counterMachine.initialState,
      'INC'
    );

    expect(oneState.value).toEqual('counting');
    expect(oneState.context).toEqual({ count: 1, foo: 'bar' });

    const twoState = counterMachine.transition(oneState, 'INC');

    expect(twoState.value).toEqual('counting');
    expect(twoState.context).toEqual({ count: 2, foo: 'bar' });
  });

  it('applies the assignment to multiple properties (property assignment)', () => {
    const nextState = counterMachine.transition(
      counterMachine.initialState,
      'WIN_PROP'
    );

    expect(nextState.context).toEqual({ count: 100, foo: 'win' });
  });

  it('applies the assignment to multiple properties (static)', () => {
    const nextState = counterMachine.transition(
      counterMachine.initialState,
      'WIN_STATIC'
    );

    expect(nextState.context).toEqual({ count: 100, foo: 'win' });
  });

  it('applies the assignment to multiple properties (static + prop assignment)', () => {
    const nextState = counterMachine.transition(
      counterMachine.initialState,
      'WIN_MIX'
    );

    expect(nextState.context).toEqual({ count: 100, foo: 'win' });
  });

  it('applies the assignment to multiple properties', () => {
    const nextState = counterMachine.transition(
      counterMachine.initialState,
      'WIN'
    );

    expect(nextState.context).toEqual({ count: 100, foo: 'win' });
  });

  it('applies the assignment to the explicit external state (property assignment)', () => {
    const oneState = counterMachine.transition(
      counterMachine.initialState,
      'DEC',
      { count: 50, foo: 'bar' }
    );

    expect(oneState.value).toEqual('counting');
    expect(oneState.context).toEqual({ count: 49, foo: 'bar' });

    const twoState = counterMachine.transition(oneState, 'DEC');

    expect(twoState.value).toEqual('counting');
    expect(twoState.context).toEqual({ count: 48, foo: 'bar' });

    const threeState = counterMachine.transition(twoState, 'DEC', {
      count: 100,
      foo: 'bar'
    });

    expect(threeState.value).toEqual('counting');
    expect(threeState.context).toEqual({ count: 99, foo: 'bar' });
  });

  it('applies the assignment to the explicit external state', () => {
    const oneState = counterMachine.transition(
      counterMachine.initialState,
      'INC',
      { count: 50, foo: 'bar' }
    );

    expect(oneState.value).toEqual('counting');
    expect(oneState.context).toEqual({ count: 51, foo: 'bar' });

    const twoState = counterMachine.transition(oneState, 'INC');

    expect(twoState.value).toEqual('counting');
    expect(twoState.context).toEqual({ count: 52, foo: 'bar' });

    const threeState = counterMachine.transition(twoState, 'INC', {
      count: 102,
      foo: 'bar'
    });

    expect(threeState.value).toEqual('counting');
    expect(threeState.context).toEqual({ count: 103, foo: 'bar' });
  });

  it('should maintain state after unhandled event', () => {
    const { initialState } = counterMachine;

    const nextState = counterMachine.transition(initialState, 'FAKE_EVENT');

    expect(nextState.context).toBeDefined();
    expect(nextState.context).toEqual({ count: 0, foo: 'bar' });
  });

  it('sets undefined properties', () => {
    const { initialState } = counterMachine;

    const nextState = counterMachine.transition(initialState, 'SET_MAYBE');

    expect(nextState.context.maybe).toBeDefined();
    expect(nextState.context).toEqual({
      count: 0,
      foo: 'bar',
      maybe: 'defined'
    });
  });
});

describe('assign meta', () => {
  const machine = createMachine<{ count: number }>({
    id: 'assign',
    initial: 'start',
    context: { count: 0 },
    states: {
      start: {
        context: {
          count: (_, __, { state }) => {
            return state === undefined ? 1 : -1;
          }
        },
        meta: { test: 3 },
        on: {
          NEXT: {
            target: 'two',
            context: {
              count: (_, __, { state }) => {
                return state ? state.meta['assign.start'].test : -1;
              }
            }
          },
          NEXT_FN: {
            target: 'two',
            context: (_, __, { state }) => ({
              count: state ? state.meta['assign.start'].test : -1
            })
          },
          NEXT_ASSIGNER: {
            target: 'two',
            context: (_, __, { action }) => ({
              count: action.assignment ? 5 : -1
            })
          }
        }
      },
      two: {}
    }
  });

  it('should provide the state in regular transitions (prop assigner)', () => {
    const { initialState } = machine;

    const nextState = machine.transition(initialState, 'NEXT');

    expect(nextState.context).toEqual({ count: 3 });
  });

  it('should provide the state in regular transitions (assigner)', () => {
    const { initialState } = machine;

    const nextState = machine.transition(initialState, 'NEXT_FN');

    expect(nextState.context).toEqual({ count: 3 });
  });

  it('should provide the assign action', () => {
    const { initialState } = machine;

    const nextState = machine.transition(initialState, 'NEXT_ASSIGNER');

    expect(nextState.context).toEqual({ count: 5 });
  });

  it('should not provide the state from initial state', () => {
    const { initialState } = machine;

    expect(initialState.context).toEqual({ count: 1 });
  });

  it('should provide meta._event to assigner', () => {
    interface Ctx {
      eventLog: Array<{ event: string; origin: string | undefined }>;
    }

    const assignEventLog = (ctx, event, meta) => ({
      eventLog: ctx.eventLog.concat({
        event: event.type,
        origin: meta._event.origin
      })
    });

    const childMachine = createMachine({
      initial: 'bar',
      states: {
        bar: {}
      },
      on: {
        PING: {
          actions: [sendParent('PONG')]
        }
      }
    });

    const parentMachine = createMachine<Ctx>({
      initial: 'foo',
      context: {
        eventLog: []
      },
      states: {
        foo: {
          invoke: {
            id: 'child',
            src: childMachine
          }
        }
      },
      on: {
        PING_CHILD: {
          context: assignEventLog,
          actions: send('PING', { to: 'child' })
        },
        '*': {
          context: assignEventLog
        }
      }
    });

    let state: any;

    const service = interpret(parentMachine)
      .onTransition(s => {
        state = s;
      })
      .start();

    service.send('PING_CHILD');
    service.send('PING_CHILD');

    expect(state.context).toEqual({
      eventLog: [
        { event: 'PING_CHILD', origin: undefined },
        { event: 'PONG', origin: expect.stringMatching(/.+/) },
        { event: 'PING_CHILD', origin: undefined },
        { event: 'PONG', origin: expect.stringMatching(/.+/) }
      ]
    });
  });
});
