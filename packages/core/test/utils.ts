import { State } from '../src/index';
import { matchesState } from '../src';
import { StateMachine } from '../src/StateMachine';
import { MachineContext } from '../src/types';

export function testMultiTransition<TContext extends MachineContext>(
  machine: StateMachine<TContext>,
  fromState: string,
  eventTypes: string
) {
  const resultState = eventTypes
    .split(/,\s?/)
    .reduce((state: State<TContext> | string, eventType) => {
      if (typeof state === 'string' && state[0] === '{') {
        state = JSON.parse(state);
      }
      const nextState = machine.transition(state, eventType);
      return nextState;
    }, fromState) as State<TContext>;

  return resultState;
}

export function testAll(machine: StateMachine, expected: {}): void {
  Object.keys(expected).forEach((fromState) => {
    Object.keys(expected[fromState]).forEach((eventTypes) => {
      const toState = expected[fromState][eventTypes];

      it(`should go from ${fromState} to ${JSON.stringify(
        toState
      )} on ${eventTypes}`, () => {
        const resultState = testMultiTransition(machine, fromState, eventTypes);

        if (toState === undefined) {
          // undefined means that the state didn't transition
          expect(resultState.actions).toEqual([]);
          expect(resultState.changed).toBe(false);
        } else if (typeof toState === 'string') {
          expect(matchesState(toState, resultState.value)).toBeTruthy();
        } else {
          expect(resultState.value).toEqual(toState);
        }
      });
    });
  });
}
