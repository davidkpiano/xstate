import { State, matchState, matchesState, createMachine, assign } from '../src';

describe('matchState()', () => {
  it('should match a value from a pattern with the state (simple)', () => {
    const simpleState = State.from('a', undefined);

    expect(
      matchState(
        simpleState,
        [
          ['b', () => false],
          ['a', () => true],
          [{ a: 'b' }, () => false]
        ],
        (_) => false
      )
    ).toBeTruthy();
  });

  it('should match a value from a pattern with the state value', () => {
    expect(
      matchState(
        'a',
        [
          ['b', () => false],
          ['a', () => true],
          [{ a: 'b' }, () => false]
        ],
        (_) => false
      )
    ).toBeTruthy();
  });

  it('should match a value from a pattern with the state (compound)', () => {
    const simpleState = State.from({ a: 'b' }, undefined);

    expect(
      matchState(
        simpleState,
        [
          ['b', () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b' }, () => true],
          ['a', () => false]
        ],
        (_) => false
      )
    ).toBeTruthy();
  });

  it('should match a value from a pattern with the state (compound, ancestor)', () => {
    const simpleState = State.from({ a: 'b' }, undefined);

    expect(
      matchState(
        simpleState,
        [
          ['b', () => false],
          [{ a: { b: 'c' } }, () => false],
          ['a', () => true],
          [{ a: 'b' }, () => false]
        ],
        (_) => false
      )
    ).toBeTruthy();
  });

  it('should match a value from a pattern with the state (parallel)', () => {
    const simpleState = State.from(
      { a: 'b', c: { d: 'e', f: 'g' } },
      undefined
    );

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          ['a', () => true],
          [{ a: 'b' }, () => false]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ a: 'b' }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ a: 'b', c: {} }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ a: 'b', c: { d: 'e' } }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ a: 'b', c: { d: 'e', f: 'g' } }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ c: {} }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ c: { d: 'e' } }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();

    expect(
      matchState(
        simpleState,
        [
          [{ a: {}, b: {} }, () => false],
          [{ a: { b: 'c' } }, () => false],
          [{ a: 'b', c: 'e' }, () => false],
          [{ c: { d: 'e', f: 'g' } }, () => true]
        ],
        (_) => false
      )
    ).toBeTruthy();
  });

  it('should fallback to default if no pattern matched', () => {
    const simpleState = State.from('a', undefined);

    expect(
      matchState(simpleState, [['b', () => false]], (_) => true)
    ).toBeTruthy();
  });
});

describe('matchesState()', () => {
  it('should return true if two states are equivalent', () => {
    expect(matchesState('a', 'a')).toBeTruthy();

    expect(matchesState('b.b1', 'b.b1')).toBeTruthy();

    expect(matchesState('B.bar', { A: 'foo' })).toBe(false);
  });

  it('should return true if two state values are equivalent', () => {
    expect(matchesState({ a: 'b' }, { a: 'b' })).toBeTruthy();
    expect(matchesState({ a: { b: 'c' } }, { a: { b: 'c' } })).toBeTruthy();
  });

  it('should return true if two parallel states are equivalent', () => {
    expect(
      matchesState(
        { a: { b1: 'foo', b2: 'bar' } },
        { a: { b1: 'foo', b2: 'bar' } }
      )
    ).toBeTruthy();

    expect(
      matchesState(
        { a: { b1: 'foo', b2: 'bar' }, b: { b3: 'baz', b4: 'quo' } },
        { a: { b1: 'foo', b2: 'bar' }, b: { b3: 'baz', b4: 'quo' } }
      )
    ).toBeTruthy();

    expect(
      matchesState({ a: 'foo', b: 'bar' }, { a: 'foo', b: 'bar' })
    ).toBeTruthy();
  });

  it('should return true if a state is a substate of a superstate', () => {
    expect(matchesState('b', 'b.b1')).toBeTruthy();

    expect(matchesState('foo.bar', 'foo.bar.baz.quo')).toBeTruthy();
  });

  it('should return true if a state value is a substate of a superstate value', () => {
    expect(matchesState('b', { b: 'b1' })).toBeTruthy();

    expect(
      matchesState({ foo: 'bar' }, { foo: { bar: { baz: 'quo' } } })
    ).toBeTruthy();
  });

  it('should return true if a parallel state value is a substate of a superstate value', () => {
    expect(matchesState('b', { b: 'b1', c: 'c1' })).toBeTruthy();

    expect(
      matchesState(
        { foo: 'bar', fooAgain: 'barAgain' },
        { foo: { bar: { baz: 'quo' } }, fooAgain: { barAgain: 'baz' } }
      )
    ).toBeTruthy();
  });

  it('should return false if two states are not equivalent', () => {
    expect(!matchesState('a', 'b')).toBeTruthy();

    expect(!matchesState('a.a1', 'b.b1')).toBeTruthy();
  });

  it('should return false if parent state is more specific than child state', () => {
    expect(!matchesState('a.b.c', 'a.b')).toBeTruthy();

    expect(!matchesState({ a: { b: { c: 'd' } } }, { a: 'b' })).toBeTruthy();
  });

  it('should return false if two state values are not equivalent', () => {
    expect(!matchesState({ a: 'a1' }, { b: 'b1' })).toBeTruthy();
  });

  it('should return false if a state is not a substate of a superstate', () => {
    expect(!matchesState('a', 'b.b1')).toBeTruthy();

    expect(!matchesState('foo.false.baz', 'foo.bar.baz.quo')).toBeTruthy();
  });

  it('should return false if a state value is not a substate of a superstate value', () => {
    expect(!matchesState('a', { b: 'b1' })).toBeTruthy();

    expect(
      !matchesState({ foo: { false: 'baz' } }, { foo: { bar: { baz: 'quo' } } })
    ).toBeTruthy();
  });

  it('should mix/match string state values and object state values', () => {
    expect(matchesState('a.b.c', { a: { b: 'c' } })).toBeTruthy();
  });
});

describe('matches() method', () => {
  it('should execute matchesState on a State given the parent state value', () => {
    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {
          initial: 'bar',
          states: {
            bar: {
              initial: 'baz',
              states: {
                baz: {}
              }
            }
          }
        }
      }
    });

    expect(machine.initialState.matches('foo')).toBeTruthy();
    expect(machine.initialState.matches({ foo: 'bar' })).toBeTruthy();
    expect(machine.initialState.matches('fake')).toBeFalsy();
  });

  it('should compile with typed matches (createMachine)', () => {
    interface TestContext {
      count?: number;
      user?: { name: string };
    }

    type TestState =
      | {
          value: 'loading';
          context: { count: number; user: undefined };
        }
      | {
          value: 'loaded';
          context: { user: { name: string } };
        };

    const machine = createMachine<TestContext, any, TestState>({
      initial: 'loading',
      states: {
        loading: {
          initial: 'one',
          states: {
            one: {},
            two: {}
          }
        },
        loaded: {}
      }
    });

    const init = machine.initialState;

    if (init.matches('loaded')) {
      const name = init.context.user.name;

      // never called - it's okay if the name is undefined
      expect(name).toBeTruthy();
    } else if (init.matches('loading')) {
      // Make sure init isn't "never" - if it is, tests should fail to compile
      expect(init).toBeTruthy();
    }
  });

  it('should compile with conditional matches even without a specified Typestate', () => {
    const toggleMachine = createMachine<{ foo: number }>({
      id: 'toggle',
      context: {
        foo: 0
      },
      initial: 'a',
      states: {
        a: { on: { TOGGLE: 'b' } },
        b: { on: { TOGGLE: 'a' } }
      }
    });

    const state = toggleMachine.initialState;

    if (state.matches('a') || state.matches('b')) {
      // This should be a `number` type
      state.context.foo;

      // Make sure state isn't "never" - if it is, tests should fail to compile
      expect(state).toBeTruthy();
    }
  });

  it('should compile with a typestate value that is a union', (done) => {
    interface MachineContext {
      countObject:
        | {
            count: number;
          }
        | undefined;
    }

    type MachineEvent = { type: 'TOGGLE' };

    type MachineTypestate =
      | {
          value: 'active' | { other: 'one' };
          context: MachineContext & { countObject: { count: number } };
        }
      | {
          value: 'inactive';
          context: MachineContext;
        };

    const machine = createMachine<
      MachineContext,
      MachineEvent,
      MachineTypestate
    >({
      initial: 'active',
      context: {
        countObject: { count: 0 }
      },
      states: {
        inactive: {
          entry: assign({
            countObject: undefined
          }),
          on: { TOGGLE: 'active' }
        },
        active: {
          entry: assign({
            countObject: (ctx) => ({
              count: (ctx.countObject?.count ?? 0) + 1
            })
          }),
          on: { TOGGLE: 'other' }
        },
        other: {
          on: { TOGGLE: 'active' },
          initial: 'one',
          states: {
            one: {}
          }
        }
      }
    });

    const state = machine.initialState;

    if (state.matches('active')) {
      expect(state.context.countObject.count).toBe(1);
      done();
    }
  });
});
