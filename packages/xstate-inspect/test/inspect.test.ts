import { createMachine, interpret } from 'xstate';
import { createDevTools, inspect } from '../src';

describe('@xstate/inspect', () => {
  it('should handle circular structures in context', (done) => {
    const circularStructure = {
      get cycle() {
        return circularStructure;
      }
    };

    const machine = createMachine({
      id: 'whatever',
      context: circularStructure,
      initial: 'active',
      states: {
        active: {}
      }
    });

    const devTools = createDevTools();

    devTools.onRegister(() => {
      done();
    });

    inspect({
      iframe: false,
      devTools
    });

    const service = interpret(machine).start();

    // The devTools will notify the listeners:
    // 1. the built-in service listener
    // 2. the test listener that calls done() above
    // with the service. The built-in service listener is responsible for
    // stringifying the service's machine definition (which contains a circular structure)
    // and will throw an error if circular structures are not handled.
    expect(() => devTools.register(service)).not.toThrow();
  });

  it('should handle circular structures in events', (done) => {
    const circularStructure = {
      get cycle() {
        return circularStructure;
      }
    };

    const machine = createMachine({
      initial: 'active',
      states: {
        active: {}
      }
    });

    const devTools = createDevTools();

    devTools.onRegister((inspectedService) => {
      inspectedService.onTransition((state) => {
        if (state.event.type === 'CIRCULAR') {
          done();
        }
      });
    });

    inspect({
      iframe: false,
      devTools
    });

    const service = interpret(machine).start();

    service.send({
      type: 'CIRCULAR',
      value: circularStructure
    });

    expect(() => devTools.register(service)).not.toThrow();
  });
});
