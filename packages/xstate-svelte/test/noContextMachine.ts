import { createMachine } from 'xstate';

export const noContextMachine = createMachine({
  initial: 'foo',
  states: {
    foo: {}
  }
});
