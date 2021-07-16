import { createMachine, assign } from '../src/index';
import * as machineSchema from '../src/machine.schema.json';

import Ajv from 'ajv';

const ajv = new Ajv();
const validate = ajv.compile(machineSchema);

describe('json', () => {
  it('should serialize the machine', () => {
    interface Context {
      [key: string]: any;
    }

    const machine = createMachine<Context>({
      initial: 'foo',
      version: '1.0.0',
      context: {
        number: 0,
        string: 'hello'
      },
      invoke: [{ id: 'invokeId', src: 'invokeSrc', autoForward: true }],
      states: {
        testActions: {
          invoke: [{ id: 'invokeId', src: 'invokeSrc', autoForward: true }],
          entry: [
            'stringActionType',
            {
              type: 'objectActionType'
            },
            {
              type: 'objectActionTypeWithExec',
              exec: () => {
                return true;
              },
              other: 'any'
            },
            function actionFunction() {
              return true;
            },
            // TODO: investigate why this had to be casted to any to satisfy TS
            assign({
              number: 10,
              string: 'test',
              evalNumber: () => 42
            }) as any,
            assign((ctx) => ({
              ...ctx
            }))
          ],
          on: {
            TO_FOO: {
              target: ['foo', 'bar'],
              guard: (ctx) => !!ctx.string
            }
          },
          after: {
            1000: 'bar'
          }
        },
        foo: {},
        bar: {},
        testHistory: {
          type: 'history',
          history: 'deep'
        },
        testFinal: {
          type: 'final',
          data: {
            something: 'else'
          }
        },
        testParallel: {
          type: 'parallel',
          states: {
            one: {
              initial: 'inactive',
              states: {
                inactive: {}
              }
            },
            two: {
              initial: 'inactive',
              states: {
                inactive: {}
              }
            }
          }
        }
      }
    });

    const json = JSON.parse(JSON.stringify(machine.definition));

    try {
      validate(json);
    } catch (err) {
      throw new Error(JSON.stringify(JSON.parse(err.message), null, 2));
    }

    expect(validate.errors).toBeNull();
  });

  it('should detect an invalid machine', () => {
    const invalidMachineConfig = {
      id: 'something',
      key: 'something',
      type: 'invalid type',
      states: {}
    };

    validate(invalidMachineConfig);
    expect(validate.errors).not.toBeNull();
  });

  it('should not double-serialize invoke transitions', () => {
    const machine = createMachine({
      initial: 'active',
      states: {
        active: {
          id: 'active',
          invoke: {
            src: 'someSrc',
            onDone: 'foo',
            onError: 'bar'
          },
          on: {
            EVENT: 'foo'
          }
        },
        foo: {},
        bar: {}
      }
    });

    const machineJSON = JSON.stringify(machine);

    const machineObject = JSON.parse(machineJSON);

    const revivedMachine = createMachine(machineObject);

    // 1. onDone
    // 2. onError
    // 3. EVENT
    expect(revivedMachine.getStateNodeById('active').transitions.length).toBe(
      3
    );
  });
});
