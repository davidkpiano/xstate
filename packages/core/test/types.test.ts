import { assign, createMachine, interpret } from '../src/index';
import { raise } from '../src/actions';
import { createModel } from '../src/model';

function noop(_x) {
  return;
}

describe('StateSchema', () => {
  type LightEvent =
    | { type: 'TIMER' }
    | { type: 'POWER_OUTAGE' }
    | { type: 'PED_COUNTDOWN'; duration: number };

  interface LightContext {
    elapsed: number;
  }

  const lightMachine = createMachine<LightContext, LightEvent>({
    key: 'light',
    initial: 'green',
    meta: { interval: 1000 },
    context: { elapsed: 0 },
    states: {
      green: {
        id: 'green',
        meta: { name: 'greenLight' },
        on: {
          TIMER: 'yellow',
          POWER_OUTAGE: 'red'
        }
      },
      yellow: {
        on: {
          TIMER: 'red',
          POWER_OUTAGE: 'red'
        }
      },
      red: {
        on: {
          TIMER: 'green',
          POWER_OUTAGE: 'red'
        },
        initial: 'walk',
        states: {
          walk: {
            on: {
              PED_COUNTDOWN: 'wait'
            }
          },
          wait: {
            on: {
              PED_COUNTDOWN: {
                target: 'stop',
                guard: (
                  ctx,
                  e: { type: 'PED_COUNTDOWN'; duration: number }
                ) => {
                  return e.duration === 0 && ctx.elapsed > 0;
                }
              }
            }
          },
          stop: {
            always: { target: '#green' }
          }
        }
      }
    }
  });

  noop(lightMachine);

  it('should work with a StateSchema defined', () => {
    expect(true).toBeTruthy();
  });
});

describe('Parallel StateSchema', () => {
  type ParallelEvent =
    | { type: 'TIMER' }
    | { type: 'POWER_OUTAGE' }
    | { type: 'E' }
    | { type: 'PED_COUNTDOWN'; duration: number };

  interface ParallelContext {
    elapsed: number;
  }

  const parallelMachine = createMachine<ParallelContext, ParallelEvent>({
    type: 'parallel',
    states: {
      foo: {},
      bar: {},
      baz: {
        initial: 'one',
        states: {
          one: { on: { E: 'two' } },
          two: {}
        }
      }
    }
  });

  noop(parallelMachine);

  it('should work with a parallel StateSchema defined', () => {
    expect(true).toBeTruthy();
  });
});

describe('Nested parallel stateSchema', () => {
  interface ParallelEvent {
    type: 'UPDATE.CONTEXT';
  }

  interface ParallelContext {
    lastDate: Date;
  }

  const nestedParallelMachine = createMachine<ParallelContext, ParallelEvent>({
    initial: 'foo',
    states: {
      foo: {},
      bar: {},
      baz: {
        type: 'parallel',
        initial: 'blockUpdates',
        states: {
          blockUpdates: { type: 'final' },
          activeParallelNode: {
            on: {
              'UPDATE.CONTEXT': {
                actions: [
                  assign({
                    lastDate: new Date()
                  })
                ]
              }
            }
          }
        }
      }
    }
  });

  noop(nestedParallelMachine);

  it('should work with a parallel StateSchema defined', () => {
    expect(true).toBeTruthy();
  });
});

describe('Raise events', () => {
  it('should work with all the ways to raise events', () => {
    type GreetingEvent =
      | { type: 'DECIDE'; aloha?: boolean }
      | { type: 'MORNING' }
      | { type: 'LUNCH_TIME' }
      | { type: 'AFTERNOON' }
      | { type: 'EVENING' }
      | { type: 'NIGHT' }
      | { type: 'ALOHA' };

    interface GreetingContext {
      hour: number;
    }

    const greetingContext: GreetingContext = { hour: 10 };

    const raiseGreetingMachine = createMachine<GreetingContext, GreetingEvent>({
      key: 'greeting',
      context: greetingContext,
      initial: 'pending',
      states: {
        pending: {
          on: {
            DECIDE: [
              {
                actions: raise({
                  type: 'ALOHA'
                }),
                guard: (_ctx, ev) => !!ev.aloha
              },
              {
                actions: raise({
                  type: 'MORNING'
                }),
                guard: (ctx) => ctx.hour < 12
              },
              {
                actions: raise({
                  type: 'AFTERNOON'
                }),
                guard: (ctx) => ctx.hour < 18
              },
              {
                actions: raise({ type: 'EVENING' }),
                guard: (ctx) => ctx.hour < 22
              }
            ]
          }
        },
        morning: {},
        lunchTime: {},
        afternoon: {},
        evening: {},
        night: {}
      },
      on: {
        MORNING: '.morning',
        LUNCH_TIME: '.lunchTime',
        AFTERNOON: '.afternoon',
        EVENING: '.evening',
        NIGHT: '.night'
      }
    });

    noop(raiseGreetingMachine);
    expect(true).toBeTruthy();
  });
});

describe('Typestates', () => {
  // Using "none" because undefined and null are unavailable when not in strict mode.
  interface None {
    type: 'none';
  }
  const none: None = { type: 'none' };

  const taskMachineConfiguration = {
    id: 'task',
    initial: 'idle',
    context: {
      result: none as None | number,
      error: none as None | string
    },
    states: {
      idle: {
        on: { RUN: 'running' }
      },
      running: {
        invoke: {
          id: 'task-1',
          src: 'taskService',
          onDone: { target: 'succeeded', actions: 'assignSuccess' },
          onError: { target: 'failed', actions: 'assignFailure' }
        }
      },
      succeeded: {},
      failed: {}
    }
  };

  type TaskContext = typeof taskMachineConfiguration.context;

  type TaskTypestate =
    | { value: 'idle'; context: { result: None; error: None } }
    | { value: 'running'; context: { result: None; error: None } }
    | { value: 'succeeded'; context: { result: number; error: None } }
    | { value: 'failed'; context: { result: None; error: string } };

  type ExtractTypeState<T extends TaskTypestate['value']> = Extract<
    TaskTypestate,
    { value: T }
  >['context'];
  type Idle = ExtractTypeState<'idle'>;
  type Running = ExtractTypeState<'running'>;
  type Succeeded = ExtractTypeState<'succeeded'>;
  type Failed = ExtractTypeState<'failed'>;

  const machine = createMachine<TaskContext, any, TaskTypestate>(
    taskMachineConfiguration
  );

  it("should preserve typestate for the service returned by Interpreter.start() and a servcie's .state getter.", () => {
    const service = interpret(machine);
    const startedService = service.start();

    const idle: Idle = startedService.state.matches('idle')
      ? startedService.state.context
      : { result: none, error: none };
    expect(idle).toEqual({ result: none, error: none });

    const running: Running = startedService.state.matches('running')
      ? startedService.state.context
      : { result: none, error: none };
    expect(running).toEqual({ result: none, error: none });

    const succeeded: Succeeded = startedService.state.matches('succeeded')
      ? startedService.state.context
      : { result: 12, error: none };
    expect(succeeded).toEqual({ result: 12, error: none });

    const failed: Failed = startedService.state.matches('failed')
      ? startedService.state.context
      : { result: none, error: 'oops' };
    expect(failed).toEqual({ result: none, error: 'oops' });
  });
});

describe('types', () => {
  it('defined context in createMachine() should be an object', () => {
    createMachine({
      // @ts-expect-error
      context: 'string'
    });
  });

  it('defined context passed to createModel() should be an object', () => {
    // @ts-expect-error
    createModel('string');
  });
});
