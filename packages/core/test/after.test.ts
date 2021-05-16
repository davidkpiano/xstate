import { createMachine, interpret } from '../src';
import { after, actionTypes } from '../src/actions';

const lightMachine = createMachine({
  id: 'light',
  initial: 'green',
  context: {
    canTurnGreen: true
  },
  states: {
    green: {
      after: {
        1000: 'yellow'
      }
    },
    yellow: {
      after: {
        1000: [{ target: 'red' }]
      }
    },
    red: {
      after: [{ delay: 1000, target: 'green' }]
    }
  }
});

describe('delayed transitions', () => {
  it('should transition after delay', () => {
    const nextState = lightMachine.transition(
      lightMachine.initialState,
      after(1000, 'light.green')
    );

    expect(nextState.value).toEqual('yellow');
    expect(nextState.actions).toMatchInlineSnapshot(`
      Array [
        Object {
          "sendId": "xstate.after(1000)#light.green",
          "type": "xstate.cancel",
        },
        Object {
          "_event": Object {
            "$$type": "scxml",
            "data": Object {
              "type": "xstate.after(1000)#light.yellow",
            },
            "name": "xstate.after(1000)#light.yellow",
            "sendid": "xstate.after(1000)#light.yellow",
            "type": "external",
          },
          "delay": 1000,
          "event": Object {
            "type": "xstate.after(1000)#light.yellow",
          },
          "id": "xstate.after(1000)#light.yellow",
          "to": undefined,
          "type": "xstate.send",
        },
      ]
    `);
  });

  it('should format transitions properly', () => {
    const greenNode = lightMachine.states.green;

    const transitions = greenNode.transitions;

    expect(transitions.map((t) => t.eventType)).toEqual([
      after(1000, greenNode.id)
    ]);
  });

  it('should be able to transition with delay from nested initial state', (done) => {
    const machine = createMachine({
      initial: 'nested',
      states: {
        nested: {
          initial: 'wait',
          states: {
            wait: {
              after: {
                10: '#end'
              }
            }
          }
        },
        end: {
          id: 'end',
          type: 'final'
        }
      }
    });

    interpret(machine)
      .onDone(() => {
        done();
      })
      .start();
  });

  it('parent state should enter child state without re-entering self (relative target)', (done) => {
    const actual: string[] = [];
    const machine = createMachine({
      initial: 'one',
      states: {
        one: {
          initial: 'two',
          entry: () => actual.push('entered one'),
          states: {
            two: {
              entry: () => actual.push('entered two')
            },
            three: {
              entry: () => actual.push('entered three'),
              always: '#end'
            }
          },
          after: {
            10: '.three'
          }
        },
        end: {
          id: 'end',
          type: 'final'
        }
      }
    });

    interpret(machine)
      .onDone(() => {
        expect(actual).toEqual(['entered one', 'entered two', 'entered three']);
        done();
      })
      .start();
  });

  it('should defer a single send event for a delayed transition with multiple conditions (#886)', () => {
    type Events = { type: 'FOO' };

    const machine = createMachine<{}, Events>({
      initial: 'X',
      states: {
        X: {
          on: {
            FOO: 'X'
          },
          after: {
            1500: [
              {
                target: 'Y',
                guard: () => true
              },
              {
                target: 'Z'
              }
            ]
          }
        },
        Y: {},
        Z: {}
      }
    });

    expect(machine.initialState.actions.length).toBe(1);
  });

  describe('delay expressions', () => {
    type Events =
      | { type: 'ACTIVATE'; delay: number }
      | { type: 'NOEXPR'; delay: number };
    const delayExprMachine = createMachine<{ delay: number }, Events>(
      {
        id: 'delayExpr',
        initial: 'inactive',
        context: {
          delay: 1000
        },
        states: {
          inactive: {
            after: [
              {
                delay: (ctx) => ctx.delay,
                target: 'active'
              }
            ],
            on: {
              ACTIVATE: 'active',
              NOEXPR: 'activeNoExpr'
            }
          },
          active: {
            after: [
              {
                delay: 'someDelay',
                target: 'inactive'
              }
            ]
          },
          activeNoExpr: {
            after: [
              {
                delay: 'nonExistantDelay',
                target: 'inactive'
              }
            ]
          }
        }
      },
      {
        delays: {
          someDelay: (ctx, event) => ctx.delay + (event as any).delay
        }
      }
    );

    it('should evaluate the expression (function) to determine the delay', () => {
      const { initialState } = delayExprMachine;

      const sendActions = initialState.actions.filter(
        (a) => a.type === actionTypes.send
      );

      expect(sendActions.length).toBe(1);

      expect(sendActions[0].delay).toEqual(1000);
    });

    it('should evaluate the expression (string) to determine the delay', () => {
      const { initialState } = delayExprMachine;
      const activeState = delayExprMachine.transition(initialState, {
        type: 'ACTIVATE',
        delay: 500
      });

      const sendActions = activeState.actions.filter(
        (a) => a.type === actionTypes.send
      );

      expect(sendActions.length).toBe(1);

      expect(sendActions[0].delay).toEqual(1000 + 500);
    });

    it('should set delay to undefined if expression not found', () => {
      const { initialState } = delayExprMachine;
      const activeState = delayExprMachine.transition(initialState, {
        type: 'NOEXPR',
        delay: 500
      });

      const sendActions = activeState.actions.filter(
        (a) => a.type === actionTypes.send
      );

      expect(sendActions.length).toBe(1);

      expect(sendActions[0].delay).toEqual(undefined);
    });
  });
});
