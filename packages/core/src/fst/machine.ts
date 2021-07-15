import { StateMachine } from '..';
import { StateTransducerFrom } from './index';

export function fromMachine<TMachine extends StateMachine<any, any, any>>(
  machine: TMachine,
  nextEvents?: StateTransducerFrom<TMachine>['nextEvents']
): StateTransducerFrom<TMachine> {
  return {
    transition: ((state, input) => {
      const nextState = machine.transition(state, input);
      return [nextState, []];
    }) as StateTransducerFrom<TMachine>['transition'],
    initialState: machine.initialState,
    nextEvents
  } as StateTransducerFrom<TMachine>;
}
