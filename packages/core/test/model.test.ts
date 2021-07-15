import { createMachine } from '../src';
import {
  cancel,
  choose,
  log,
  send,
  sendParent,
  sendUpdate,
  stop
} from '../src/actions';
import { createModel } from '../src/model';

describe('createModel', () => {
  it('model.assign updates context and is typed correctly', () => {
    type UserEvent =
      | {
          type: 'updateName';
          value: string;
        }
      | { type: 'updateAge'; value: number }
      | { type: 'anotherEvent' };

    interface UserContext {
      name: string;
      age: number;
    }

    const userModel = createModel<UserContext, UserEvent>({
      name: 'David',
      age: 30
    });

    // Example of an externally-defined assign action
    const assignName = userModel.assign(
      {
        name: (_, event) => {
          return event.value;
        }
      },
      'updateName'
    );

    const machine = createMachine<UserContext, UserEvent>({
      context: userModel.initialContext,
      initial: 'active',
      states: {
        active: {
          on: {
            updateName: {
              // pre-defined assign action
              actions: assignName
            },
            updateAge: {
              // inline assign action
              actions: userModel.assign((_, e) => {
                return {
                  age: e.value
                };
              })
            }
          }
        }
      }
    });

    const updatedState = machine.transition(undefined, {
      type: 'updateName',
      value: 'Anyone'
    });

    expect(updatedState.context.name).toEqual('Anyone');
  });

  it('model.reset resets the context to its initial value', () => {
    type UserEvent =
      | {
          type: 'updateName';
          value: string;
        }
      | { type: 'updateAge'; value: number }
      | { type: 'reset' };

    interface UserContext {
      name: string;
      age: number;
    }

    const userModel = createModel<UserContext, UserEvent>({
      name: 'David',
      age: 30
    });

    // Example of an externally-defined assign action
    const assignName = userModel.assign(
      {
        name: (_, event) => {
          return event.value;
        }
      },
      'updateName'
    );

    const machine = createMachine<UserContext, UserEvent>({
      context: userModel.initialContext,
      initial: 'active',
      states: {
        active: {
          on: {
            updateName: {
              // pre-defined assign action
              actions: assignName
            },
            updateAge: {
              // inline assign action
              actions: userModel.assign((_, e) => {
                return {
                  age: e.value
                };
              })
            },
            reset: {
              actions: userModel.reset()
            }
          }
        }
      }
    });

    const updatedState = machine.transition(undefined, {
      type: 'updateName',
      value: 'Anyone'
    });

    expect(updatedState.context.name).toEqual('Anyone');

    const resetState = machine.transition(undefined, {
      type: 'reset'
    });

    expect(resetState.context).toEqual(userModel.initialContext);
  });

  it('can model events', () => {
    const userModel = createModel(
      {
        name: 'David',
        age: 30
      },
      {
        events: {
          updateName: (value: string) => ({ value }),
          updateAge: (value: number) => {
            const payload = {
              value
            };
            (payload as any).type = 'this should be overwritten';
            return payload;
          },
          anotherEvent: () => ({})
        }
      }
    );

    // Example of an externally-defined assign action
    const assignName = userModel.assign(
      {
        name: (_, event) => {
          return event.value;
        }
      },
      'updateName'
    );

    const machine = userModel.createMachine({
      initial: 'active',
      states: {
        active: {
          on: {
            updateName: {
              // pre-defined assign action
              actions: [assignName]
            },
            updateAge: {
              // inline assign action
              actions: userModel.assign((_, e) => {
                return {
                  age: e.value
                };
              })
            }
          }
        }
      }
    });

    let updatedState = machine.transition(
      undefined,
      userModel.events.updateName('Anyone')
    );

    expect(updatedState.context.name).toEqual('Anyone');

    updatedState = machine.transition(
      updatedState,
      userModel.events.updateAge(42)
    );

    expect(updatedState.context.age).toEqual(42);
  });

  it('can model actions', () => {
    const userModel = createModel(
      {
        name: 'David',
        age: 30
      },
      {
        actions: {
          greet: (message: string) => ({ message })
        }
      }
    );

    createMachine<typeof userModel>({
      context: userModel.initialContext,
      initial: 'active',
      entry: { type: 'greet', message: 'hello' },
      exit: { type: 'greet', message: 'goodbye' },
      states: {
        active: {
          entry: [userModel.actions.greet('hello')]
        }
      }
    });

    createMachine<typeof userModel>({
      context: userModel.initialContext,
      // @ts-expect-error
      entry: { type: 'greet' } // missing message
    });

    createMachine<typeof userModel>({
      context: userModel.initialContext,
      // @ts-expect-error
      entry: { type: 'fake' } // wrong message
    });
  });

  it('works with built-in actions', () => {
    const model = createModel(
      {},
      {
        events: {
          SAMPLE: () => ({})
        },
        actions: {
          custom: () => ({})
        }
      }
    );

    createMachine<typeof model>({
      context: model.initialContext,
      entry: [
        model.actions.custom(),
        // raise('SAMPLE'),
        send('SAMPLE'),
        sendParent('SOMETHING'),
        sendUpdate(),
        // respond('SOMETHING'),
        log('something'),
        cancel('something'),
        stop('something'),
        model.assign({}),
        choose([])
      ],
      exit: [
        model.actions.custom(),
        // raise('SAMPLE'),
        send('SAMPLE'),
        sendParent('SOMETHING'),
        sendUpdate(),
        // respond('SOMETHING'),
        log('something'),
        cancel('something'),
        stop('something'),
        model.assign({}),
        choose([])
      ],
      on: {
        SAMPLE: {
          actions: [
            model.actions.custom(),
            // raise('SAMPLE'),
            send('SAMPLE'),
            sendParent('SOMETHING'),
            sendUpdate(),
            // respond('SOMETHING'),
            log('something'),
            cancel('something'),
            stop('something'),
            model.assign({}),
            choose([])
          ]
        }
      },
      initial: 'someState',
      states: {
        someState: {
          entry: [
            model.actions.custom(),
            // raise('SAMPLE'),
            send('SAMPLE'),
            sendParent('SOMETHING'),
            sendUpdate(),
            // respond('SOMETHING'),
            log('something'),
            cancel('something'),
            stop('something'),
            model.assign({}),
            choose([])
          ],
          exit: [
            model.actions.custom(),
            // raise('SAMPLE'),
            send('SAMPLE'),
            sendParent('SOMETHING'),
            sendUpdate(),
            // respond('SOMETHING'),
            log('something'),
            cancel('something'),
            stop('something'),
            model.assign({}),
            choose([])
          ]
        }
      }
    });
  });

  it('should strongly type action implementations', () => {
    const model = createModel(
      {},
      {
        events: {
          SAMPLE: () => ({})
        },
        actions: {
          custom: (param: string) => ({ param })
        }
      }
    );

    createMachine<typeof model>(
      {
        context: {}
      },
      {
        actions: {
          custom: (_ctx, _e, { action }) => {
            action.param.toUpperCase();

            // @ts-expect-error
            action.param.whatever();
          }
        }
      }
    );
  });

  it('should typecheck `createMachine` for model without creators', () => {
    const toggleModel = createModel({ count: 0 });

    toggleModel.createMachine({
      id: 'machine',
      initial: 'inactive',
      states: {
        inactive: {
          on: { TOGGLE: 'active' }
        },
        active: {
          on: { TOGGLE: 'inactive' }
        }
      }
    });
  });

  it('model.createMachine(...) should provide the initial context', () => {
    const toggleModel = createModel({ count: 0 });

    const machine = toggleModel.createMachine({});

    expect(machine.initialState.context.count).toBe(0);
  });

  it('should not compile if missing context with plain createMachine(...)', () => {
    const toggleModel = createModel({ count: 0 });

    // @ts-expect-error
    const m = createMachine<typeof toggleModel>({
      id: 'machine',
      initial: 'inactive',
      // missing context:
      // context: toggleModel.initialContext,
      states: {
        inactive: {}
      }
    });
  });
});
