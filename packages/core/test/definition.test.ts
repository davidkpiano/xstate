import { createMachine } from '../src';

describe('definition', () => {
  it('should provide invoke definitions', () => {
    const invokeMachine = createMachine({
      id: 'invoke',
      invoke: [{ src: 'foo' }, { src: 'bar' }],
      initial: 'idle',
      states: {
        idle: {}
      }
    });

    expect(invokeMachine.root.definition.invoke.length).toBe(2);
  });
});
