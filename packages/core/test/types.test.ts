import {
  CombineTypestates,
  CombineTypestateTuples,
  Machine,
  TypestateContext,
  assign,
  createMachine,
  interpret
} from '../src/index';
import { raise } from '../src/actions';

function noop(_x) {
  return;
}

type IsEqual<A, B> = [
  A extends B ? true : false,
  B extends A ? true : false
] extends [true, true]
  ? true
  : false;

describe('StateSchema', () => {
  interface LightStateSchema {
    meta: {
      interval: number;
    };
    states: {
      green: {
        meta: { name: string };
      };
      yellow: {};
      red: {
        states: {
          walk: {};
          wait: {};
          stop: {};
        };
      };
    };
  }

  type LightEvent =
    | { type: 'TIMER' }
    | { type: 'POWER_OUTAGE' }
    | { type: 'PED_COUNTDOWN'; duration: number };

  interface LightContext {
    elapsed: number;
  }

  const lightMachine = Machine<LightContext, LightStateSchema, LightEvent>({
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
                cond: (ctx, e: { type: 'PED_COUNTDOWN'; duration: number }) => {
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
  interface ParallelStateSchema {
    states: {
      foo: {};
      bar: {};
      baz: {
        states: {
          one: {};
          two: {};
        };
      };
    };
  }

  type ParallelEvent =
    | { type: 'TIMER' }
    | { type: 'POWER_OUTAGE' }
    | { type: 'E' }
    | { type: 'PED_COUNTDOWN'; duration: number };

  interface ParallelContext {
    elapsed: number;
  }

  const parallelMachine = Machine<
    ParallelContext,
    ParallelStateSchema,
    ParallelEvent
  >({
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
  interface ParallelStateSchema {
    states: {
      foo: {};
      bar: {};
      baz: {
        states: {
          blockUpdates: {};
          activeParallelNode: {};
        };
      };
    };
  }

  interface ParallelEvent {
    type: 'UPDATE.CONTEXT';
  }

  interface ParallelContext {
    lastDate: Date;
  }

  const nestedParallelMachine = Machine<
    ParallelContext,
    ParallelStateSchema,
    ParallelEvent
  >({
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
    interface GreetingStateSchema {
      states: {
        pending: {};
        morning: {};
        lunchTime: {};
        afternoon: {};
        evening: {};
        night: {};
      };
    }

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

    const raiseGreetingMachine = Machine<
      GreetingContext,
      GreetingStateSchema,
      GreetingEvent
    >({
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
                }) as any /* TODO: FIX */,
                cond: (_ctx, ev) => !!ev.aloha
              },
              {
                actions: raise({
                  type: 'MORNING'
                }) as any /* TODO: FIX */,
                cond: (ctx) => ctx.hour < 12
              },
              {
                actions: raise({
                  type: 'AFTERNOON'
                }) as any /* TODO: FIX */,
                cond: (ctx) => ctx.hour < 18
              },
              {
                actions: raise({ type: 'EVENING' }) as any /* TODO: FIX */,
                cond: (ctx) => ctx.hour < 22
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
  type None = { type: 'none' };
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

  it('should preserve typestate for state node returned by StateNode.withConfig.', () => {
    const machine2 = machine.withConfig({});
    const service = interpret(machine2);
    service.start();

    const idle: Idle = service.state.matches('idle')
      ? service.state.context
      : { result: none, error: none };
    expect(idle).toEqual({ result: none, error: none });

    const running: Running = service.state.matches('running')
      ? service.state.context
      : { result: none, error: none };
    expect(running).toEqual({ result: none, error: none });

    const succeeded: Succeeded = service.state.matches('succeeded')
      ? service.state.context
      : { result: 12, error: none };
    expect(succeeded).toEqual({ result: 12, error: none });

    const failed: Failed = service.state.matches('failed')
      ? service.state.context
      : { result: none, error: 'oops' };
    expect(failed).toEqual({ result: none, error: 'oops' });
  });
});

describe('CombineTypestates', () => {
  type TaskTypestate = CombineTypestates<
    | { value: 'idle' | 'running'; context: { common: boolean } }
    | { value: 'succeeded'; context: { common: boolean; result: number } }
    | { value: 'failed'; context: { common: number; error: string } }
    | { value: { parent: 'child' }; context: { common: boolean } }
  >;

  type TaskTypestateTuples = CombineTypestateTuples<
    | ['idle' | 'running', { common: boolean }]
    | ['succeeded', { common: boolean; result: number }]
    | ['failed', { common: number; error: string }]
    | [{ parent: 'child' }, { common: boolean }]
  >;

  type Expected =
    | {
        value: 'idle' | 'running' | { parent: 'child' };
        context: { common: boolean; result?: undefined; error?: undefined };
      }
    | {
        value: 'succeeded';
        context: { common: boolean; result: number; error?: undefined };
      }
    | {
        value: 'failed';
        context: { common: number; result?: undefined; error: string };
      };

  noop((): IsEqual<TaskTypestate, Expected> => true);
  noop((): IsEqual<TaskTypestateTuples, Expected> => true);
});

describe('TypestateContext', () => {
  type TaskTypestate = CombineTypestates<
    | { value: 'idle' | 'running'; context: { common: boolean } }
    | { value: 'succeeded'; context: { common: boolean; result: number } }
    | { value: 'failed'; context: { common: number; error: string } }
    | { value: { parent: 'child' }; context: { common: boolean } }
  >;

  type TaskContext = TypestateContext<TaskTypestate>;

  type Expected = {
    common: boolean | number;
    result?: number;
    error?: string;
  };

  noop((): IsEqual<TaskContext, Expected> => true);
});
