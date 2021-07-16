import { stateIn } from '../src/guards';
import { interpret, createMachine } from '../src/index';
import { invokeActivity } from '../src/invoke';

// TODO: remove this file but before doing that ensure that things tested here are covered by other tests

const lightMachine = createMachine({
  key: 'light',
  initial: 'green',
  states: {
    green: {
      invoke: ['fadeInGreen'],
      on: {
        TIMER: 'yellow'
      }
    },
    yellow: {
      on: {
        TIMER: 'red'
      }
    },
    red: {
      initial: 'walk',
      invoke: ['activateCrosswalkLight'],
      on: {
        TIMER: 'green'
      },
      states: {
        walk: { on: { PED_WAIT: 'wait' } },
        wait: {
          invoke: ['blinkCrosswalkLight'],
          on: { PED_STOP: 'stop' }
        },
        stop: {}
      }
    }
  }
});

describe('activities with guarded transitions', () => {
  it('should activate even if there are subsequent automatic, but blocked transitions', (done) => {
    const machine = createMachine(
      {
        initial: 'A',
        states: {
          A: {
            on: {
              E: 'B'
            }
          },
          B: {
            invoke: ['B_ACTIVITY'],
            always: [{ guard: () => false, target: 'A' }]
          }
        }
      },
      {
        actors: {
          B_ACTIVITY: invokeActivity(() => {
            done();
          })
        }
      }
    );

    const service = interpret(machine).start();

    service.send('E');
  });
});

describe('remembering activities', () => {
  const machine = createMachine({
    initial: 'A',
    states: {
      A: {
        on: {
          E: 'B'
        }
      },
      B: {
        invoke: 'B_ACTIVITY',
        on: {
          E: 'A'
        }
      }
    }
  });

  it('should remember the activities even after an event', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          B_ACTIVITY: invokeActivity(() => {
            done();
          })
        }
      })
    ).start();

    service.send('E');
    service.send('IGNORE');
  });
});

describe('activities', () => {
  it('identifies initial activities', (done) => {
    const service = interpret(
      lightMachine.provide({
        actors: {
          fadeInGreen: invokeActivity(() => {
            done();
          })
        }
      })
    );

    service.start();
  });
  it('identifies start activities', (done) => {
    const service = interpret(
      lightMachine.provide({
        actors: {
          activateCrosswalkLight: invokeActivity(() => {
            done();
          })
        }
      })
    );

    service.start();
    service.send('TIMER'); // yellow
    service.send('TIMER'); // red
  });

  it('identifies start activities for child states and active activities', (done) => {
    const service = interpret(
      lightMachine.provide({
        actors: {
          blinkCrosswalkLight: invokeActivity(() => {
            done();
          })
        }
      })
    );

    service.start();
    service.send('TIMER'); // yellow
    service.send('TIMER'); // red.walk
    service.send('PED_WAIT'); // red.wait
  });

  it('identifies stop activities for child states', (done) => {
    const service = interpret(
      lightMachine.provide({
        actors: {
          blinkCrosswalkLight: invokeActivity(() => {
            return () => {
              done();
            };
          })
        }
      })
    );

    service.start();
    service.send('TIMER'); // yellow
    service.send('TIMER'); // red.walk
    service.send('PED_WAIT'); // red.wait
    service.send('PED_STOP');
  });

  it('identifies multiple stop activities for child and parent states', (done) => {
    let stopActivateCrosswalkLightcalled = false;

    const service = interpret(
      lightMachine.provide({
        actors: {
          fadeInGreen: invokeActivity(() => {
            if (stopActivateCrosswalkLightcalled) {
              done();
            }
          }),
          activateCrosswalkLight: invokeActivity(() => {
            return () => {
              stopActivateCrosswalkLightcalled = true;
            };
          })
        }
      })
    );

    service.start();
    service.send('TIMER'); // yellow
    service.send('TIMER'); // red.walk
    service.send('PED_WAIT'); // red.wait
    service.send('PED_STOP'); // red.stop
    service.send('TIMER'); // green
  });
});

describe('transient activities', () => {
  const machine = createMachine({
    type: 'parallel',
    states: {
      A: {
        invoke: ['A'],
        initial: 'A1',
        states: {
          A1: {
            invoke: ['A1'],
            on: {
              A: 'AWAIT'
            }
          },
          AWAIT: {
            id: 'AWAIT',
            invoke: ['AWAIT'],
            on: {
              '': 'A2'
            }
          },
          A2: {
            invoke: ['A2'],
            on: {
              A: 'A1'
            }
          }
        },
        on: {
          A1: '.A1',
          A2: '.A2'
        }
      },
      B: {
        initial: 'B1',
        invoke: ['B'],
        states: {
          B1: {
            invoke: ['B1'],
            always: {
              target: 'B2',
              guard: stateIn('#AWAIT')
            },
            on: {
              B: 'B2'
            }
          },
          B2: {
            invoke: ['B2'],
            on: {
              B: 'B1'
            }
          }
        },
        on: {
          B1: '.B1',
          B2: '.B2'
        }
      },
      C: {
        initial: 'C1',
        states: {
          C1: {
            invoke: ['C1'],
            on: {
              C: 'C1',
              C_SIMILAR: 'C2'
            }
          },
          C2: {
            invoke: ['C1']
          }
        }
      }
    }
  });

  it('should have started initial activities', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          A: invokeActivity(() => {
            done();
          })
        }
      })
    );

    service.start();
  });

  it('should have started deep initial activities', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          A1: invokeActivity(() => {
            done();
          })
        }
      })
    );
    service.start();
  });

  it('should have kept existing activities', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          A: invokeActivity(() => {
            done();
          })
        }
      })
    ).start();

    service.send('A');
  });

  it('should have kept same activities', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          C1: invokeActivity(() => {
            done();
          })
        }
      })
    ).start();

    service.send('C_SIMILAR');
  });

  it('should have kept same activities after self transition', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          C1: invokeActivity(() => {
            done();
          })
        }
      })
    ).start();

    service.send('C');
  });

  it('should have stopped after automatic transitions', (done) => {
    const service = interpret(
      machine.provide({
        actors: {
          B2: invokeActivity(() => {
            done();
          })
        }
      })
    ).start();

    service.send('A');
  });
});
