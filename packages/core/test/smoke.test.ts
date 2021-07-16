import { createMachine } from '../src';

describe('smoke test', () => {
  it('should work with built files', () => {
    expect(() => {
      return createMachine({
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
    }).not.toThrow();
  });
});
