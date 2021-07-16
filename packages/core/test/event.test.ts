import { createMachine, sendParent, interpret, assign } from '../src';
import { respond, send } from '../src/actions';
import { invokeCallback, invokeMachine } from '../src/invoke';

describe('SCXML events', () => {
  it('should have the origin (id) from the sending machine service', (done) => {
    const childMachine = createMachine({
      initial: 'active',
      states: {
        active: {
          entry: sendParent('EVENT')
        }
      }
    });

    const parentMachine = createMachine({
      initial: 'active',
      states: {
        active: {
          invoke: {
            id: 'child',
            src: invokeMachine(childMachine)
          },
          on: {
            EVENT: {
              target: 'success',
              guard: (_, __, { _event }) => {
                return !!_event.origin;
              }
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    interpret(parentMachine)
      .onDone(() => done())
      .start();
  });

  it('should have the origin (id) from the sending callback service', () => {
    const machine = createMachine<{ childOrigin?: string }>({
      initial: 'active',
      context: {},
      states: {
        active: {
          invoke: {
            id: 'callback_child',
            src: invokeCallback(() => (sendBack) => sendBack({ type: 'EVENT' }))
          },
          on: {
            EVENT: {
              target: 'success',
              actions: assign({
                childOrigin: (_, __, { _event }) => _event.origin?.name
              })
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const service = interpret(machine).start();

    expect(service.state.context.childOrigin).toBe('callback_child');
  });

  it('respond() should be able to respond to sender', (done) => {
    const authServerMachine = createMachine({
      initial: 'waitingForCode',
      states: {
        waitingForCode: {
          on: {
            CODE: {
              actions: respond('TOKEN', {
                delay: 10
              })
            }
          }
        }
      }
    });

    const authClientMachine = createMachine({
      initial: 'idle',
      states: {
        idle: {
          on: { AUTH: 'authorizing' }
        },
        authorizing: {
          invoke: {
            id: 'auth-server',
            src: invokeMachine(authServerMachine)
          },
          entry: send('CODE', {
            to: 'auth-server'
          }),
          on: {
            TOKEN: 'authorized'
          }
        },
        authorized: {
          type: 'final'
        }
      }
    });

    const service = interpret(authClientMachine)
      .onDone(() => done())
      .start();

    service.send('AUTH');
  });
});

interface SignInContext {
  email: string;
  password: string;
}

interface ChangePassword {
  type: 'changePassword';
  password: string;
}

const authMachine = createMachine<SignInContext, ChangePassword>(
  {
    context: { email: '', password: '' },
    initial: 'passwordField',
    states: {
      passwordField: {
        initial: 'hidden',
        states: {
          hidden: {
            on: {
              // We want to assign the new password but remain in the hidden
              // state
              changePassword: {
                actions: 'assignPassword'
              }
            }
          },
          valid: {},
          invalid: {}
        },
        on: {
          changePassword: [
            {
              guard: (_, event) => event.password.length >= 10,
              target: '.invalid',
              actions: ['assignPassword']
            },
            {
              target: '.valid',
              actions: ['assignPassword']
            }
          ]
        }
      }
    }
  },
  {
    actions: {
      assignPassword: assign<SignInContext, ChangePassword>({
        password: (_, event) => event.password
      })
    }
  }
);

describe('nested transitions', () => {
  it('only take the transition of the most inner matching event', () => {
    const password = 'xstate123';
    const state = authMachine.transition(authMachine.initialState, {
      type: 'changePassword',
      password
    });

    expect(state.value).toEqual({ passwordField: 'hidden' });
    expect(state.context).toEqual({ password, email: '' });
  });
});
