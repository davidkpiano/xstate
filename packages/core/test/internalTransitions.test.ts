import { createMachine, interpret, assign } from '../src/index';

const wordMachine = createMachine({
  key: 'word',
  type: 'parallel',
  states: {
    direction: {
      initial: 'left',
      entry: 'ENTER_DIRECTION',
      exit: 'EXIT_DIRECTION',
      states: {
        left: {},
        right: {},
        center: {},
        justify: {}
      },
      on: {
        // internal transitions
        LEFT_CLICK: '.left',
        RIGHT_CLICK: '.right',
        RIGHT_CLICK_EXTERNAL: {
          target: '.right',
          internal: false
        },
        CENTER_CLICK: '.center',
        JUSTIFY_CLICK: '.justify',
        RESET: 'direction', // explicit self-transition
        RESET_TO_CENTER: {
          target: 'direction.center',
          internal: false
        }
      }
    }
  }
});

const topLevelMachine = createMachine({
  initial: 'Hidden',
  on: {
    CLICKED_CLOSE: '.Hidden',
    TARGETLESS_ARRAY: [{ actions: ['doSomethingParent'] }],
    TARGETLESS_OBJECT: { actions: ['doSomethingParent'] },
    PARENT_EVENT: { actions: ['handleParentEvent'] }
  },
  states: {
    Hidden: {
      on: {
        PUBLISH_FAILURE: 'Failure',
        TARGETLESS_ARRAY: [{ actions: ['doSomething'] }],
        TARGETLESS_OBJECT: { actions: ['doSomething'] }
      }
    },
    Failure: {}
  }
});

describe('internal transitions', () => {
  it('parent state should enter child state without re-entering self', () => {
    const nextState = wordMachine.transition(
      wordMachine.initialState,
      'RIGHT_CLICK'
    );

    expect(nextState.value).toEqual({ direction: 'right' });
    expect(nextState.actions.length).toBe(0);
  });

  it('parent state should re-enter self upon transitioning to child state if internal is false', () => {
    const nextState = wordMachine.transition(
      wordMachine.initialState,
      'RIGHT_CLICK_EXTERNAL'
    );

    expect(nextState.value).toEqual({ direction: 'right' });
    expect(nextState.actions.length).toBe(2);
    expect(nextState.actions.map((a) => a.type)).toEqual([
      'EXIT_DIRECTION',
      'ENTER_DIRECTION'
    ]);
  });

  it('parent state should only exit/reenter if there is an explicit self-transition', () => {
    const resetState = wordMachine.transition('direction.center', 'RESET');

    expect(resetState.value).toEqual({ direction: 'left' });
    expect(resetState.actions.map((a) => a.type)).toEqual([
      'EXIT_DIRECTION',
      'ENTER_DIRECTION'
    ]);
  });

  it('parent state should only exit/reenter if there is an explicit self-transition (to child)', () => {
    const resetState = wordMachine.transition(
      'direction.right',
      'RESET_TO_CENTER'
    );

    expect(resetState.value).toEqual({ direction: 'center' });
    expect(resetState.actions.map((a) => a.type)).toEqual([
      'EXIT_DIRECTION',
      'ENTER_DIRECTION'
    ]);
  });

  it('should listen to events declared at top state', () => {
    const actualState = topLevelMachine.transition('Failure', 'CLICKED_CLOSE');

    expect(actualState.value).toEqual('Hidden');
  });

  it('should work with targetless transitions (in conditional array)', () => {
    const sameState = topLevelMachine.transition('Hidden', 'TARGETLESS_ARRAY');

    expect(sameState.actions.map((a) => a.type)).toEqual(['doSomething']);
  });

  it('should work with targetless transitions (in object)', () => {
    const sameState = topLevelMachine.transition('Hidden', 'TARGETLESS_OBJECT');

    expect(sameState.actions.map((a) => a.type)).toEqual(['doSomething']);
  });

  it('should work on parent with targetless transitions (in conditional array)', () => {
    const sameState = topLevelMachine.transition('Failure', 'TARGETLESS_ARRAY');

    expect(sameState.actions.map((a) => a.type)).toEqual(['doSomethingParent']);
  });

  it('should work with targetless transitions (in object)', () => {
    const sameState = topLevelMachine.transition(
      'Failure',
      'TARGETLESS_OBJECT'
    );

    expect(sameState.actions.map((a) => a.type)).toEqual(['doSomethingParent']);
  });

  it('should maintain the child state when targetless transition is handled by parent', () => {
    const hiddenState = topLevelMachine.transition('Hidden', 'PARENT_EVENT');

    expect(hiddenState.value).toEqual('Hidden');
  });

  it('should reenter proper descendants of a source state of an internal transition', () => {
    const machine = createMachine<{
      sourceStateEntries: number;
      directDescendantEntries: number;
      deepDescendantEntries: number;
    }>({
      context: {
        sourceStateEntries: 0,
        directDescendantEntries: 0,
        deepDescendantEntries: 0
      },
      initial: 'a1',
      states: {
        a1: {
          initial: 'a11',
          entry: assign({
            sourceStateEntries: (ctx) => ctx.sourceStateEntries + 1
          }),
          states: {
            a11: {
              initial: 'a111',
              entry: assign({
                directDescendantEntries: (ctx) =>
                  ctx.directDescendantEntries + 1
              }),
              states: {
                a111: {
                  entry: assign({
                    deepDescendantEntries: (ctx) =>
                      ctx.deepDescendantEntries + 1
                  })
                }
              }
            }
          },
          on: {
            REENTER: '.a11.a111'
          }
        }
      }
    });

    const service = interpret(machine).start();

    service.send('REENTER');

    expect(service.state.context).toEqual({
      sourceStateEntries: 1,
      directDescendantEntries: 2,
      deepDescendantEntries: 2
    });
  });

  it('should exit proper descendants of a source state of an internal transition', () => {
    const machine = createMachine<{
      sourceStateExits: number;
      directDescendantExits: number;
      deepDescendantExits: number;
    }>({
      context: {
        sourceStateExits: 0,
        directDescendantExits: 0,
        deepDescendantExits: 0
      },
      initial: 'a1',
      states: {
        a1: {
          initial: 'a11',
          exit: assign({
            sourceStateExits: (ctx) => ctx.sourceStateExits + 1
          }),
          states: {
            a11: {
              initial: 'a111',
              exit: assign({
                directDescendantExits: (ctx) => ctx.directDescendantExits + 1
              }),
              states: {
                a111: {
                  exit: assign({
                    deepDescendantExits: (ctx) => ctx.deepDescendantExits + 1
                  })
                }
              }
            }
          },
          on: {
            REENTER: '.a11.a111'
          }
        }
      }
    });

    const service = interpret(machine).start();

    service.send('REENTER');

    expect(service.state.context).toEqual({
      sourceStateExits: 0,
      directDescendantExits: 1,
      deepDescendantExits: 1
    });
  });
});
