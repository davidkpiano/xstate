import { interpret, DevToolsAdapter, createMachine } from '../src';

describe('devTools', () => {
  it('should register services with a custom devTools adapter', (done) => {
    const customAdapter: DevToolsAdapter = (service) => {
      service.subscribe((state) => {
        if (state.matches('active')) {
          done();
        }
      });
    };

    const machine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: {
            TOGGLE: 'active'
          }
        },
        active: {}
      }
    });

    const service = interpret(machine, {
      devTools: customAdapter
    });

    service.start();
    service.send('TOGGLE');
  });
});
