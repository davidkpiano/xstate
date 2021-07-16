import {
  interpret,
  assign,
  sendParent,
  send,
  EventObject,
  StateValue,
  UpdateObject,
  createMachine,
  ActorContext,
  Behavior
} from '../src';
import { fromReducer } from '../src/behaviors';
import {
  actionTypes,
  done as _done,
  doneInvoke,
  escalate,
  forwardTo,
  raise
} from '../src/actions';
import {
  invokeMachine,
  invokeCallback,
  invokePromise,
  invokeObservable,
  invokeActivity
} from '../src/invoke';
import { interval } from 'rxjs';
import { map, take } from 'rxjs/operators';

const user = { name: 'David' };

const fetchMachine = createMachine<{ userId: string | undefined }>({
  id: 'fetch',
  context: {
    userId: undefined
  },
  initial: 'pending',
  states: {
    pending: {
      entry: send({ type: 'RESOLVE', user }),
      on: {
        RESOLVE: {
          target: 'success',
          guard: (ctx) => ctx.userId !== undefined
        }
      }
    },
    success: {
      type: 'final',
      data: { user: (_, e) => e.user }
    },
    failure: {
      entry: sendParent('REJECT')
    }
  }
});

const fetcherMachine = createMachine({
  id: 'fetcher',
  initial: 'idle',
  context: {
    selectedUserId: '42',
    user: undefined
  },
  states: {
    idle: {
      on: {
        GO_TO_WAITING: 'waiting',
        GO_TO_WAITING_MACHINE: 'waitingInvokeMachine'
      }
    },
    waiting: {
      invoke: {
        src: invokeMachine(fetchMachine),
        data: {
          userId: (ctx) => ctx.selectedUserId
        },
        onDone: {
          target: 'received',
          guard: (_, e) => {
            // Should receive { user: { name: 'David' } } as event data
            return e.data.user.name === 'David';
          }
        }
      }
    },
    waitingInvokeMachine: {
      invoke: {
        src: invokeMachine(fetchMachine.withContext({ userId: '55' })),
        onDone: 'received'
      }
    },
    received: {
      type: 'final'
    }
  }
});

const intervalMachine = createMachine<{
  interval: number;
  count: number;
}>({
  id: 'interval',
  initial: 'counting',
  context: {
    interval: 10,
    count: 0
  },
  states: {
    counting: {
      invoke: {
        id: 'intervalService',
        src: invokeCallback((ctx) => (cb) => {
          const ivl = setInterval(() => {
            cb({ type: 'INC' });
          }, ctx.interval);

          return () => clearInterval(ivl);
        })
      },
      always: {
        target: 'finished',
        guard: (ctx) => ctx.count === 3
      },
      on: {
        INC: { actions: assign({ count: (ctx) => ctx.count + 1 }) },
        SKIP: 'wait'
      }
    },
    wait: {
      on: {
        // this should never be called if interval service is properly disposed
        INC: { actions: assign({ count: (ctx) => ctx.count + 1 }) }
      },
      after: {
        50: 'finished'
      }
    },
    finished: {
      type: 'final'
    }
  }
});

describe('invoke', () => {
  it('should start services (external machines)', (done) => {
    const childMachine = createMachine({
      id: 'child',
      initial: 'init',
      states: {
        init: {
          entry: [sendParent('INC'), sendParent('INC')]
        }
      }
    });

    const someParentMachine = createMachine<{ count: number }>(
      {
        id: 'parent',
        context: { count: 0 },
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'child',
              id: 'someService',
              autoForward: true
            },
            always: {
              target: 'stop',
              guard: (ctx) => ctx.count === 2
            },
            on: {
              INC: {
                actions: assign({ count: (ctx) => ctx.count + 1 })
              }
            }
          },
          stop: {
            type: 'final'
          }
        }
      },
      {
        actors: {
          child: invokeMachine(childMachine)
        }
      }
    );

    let count: number;

    interpret(someParentMachine)
      .onTransition((state) => {
        count = state.context.count;
      })
      .onDone(() => {
        // 1. The 'parent' machine will enter 'start' state
        // 2. The 'child' service will be run with ID 'someService'
        // 3. The 'child' machine will enter 'init' state
        // 4. The 'entry' action will be executed, which sends 'INC' to 'parent' machine twice
        // 5. The context will be updated to increment count to 2

        expect(count).toEqual(2);
        done();
      })
      .start();
  });

  it('should forward events to services if autoForward: true', () => {
    const childMachine = createMachine({
      id: 'child',
      initial: 'init',
      states: {
        init: {
          on: {
            FORWARD_DEC: {
              actions: [sendParent('DEC'), sendParent('DEC'), sendParent('DEC')]
            }
          }
        }
      }
    });

    const someParentMachine = createMachine<{ count: number }>(
      {
        id: 'parent',
        context: { count: 0 },
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'child',
              id: 'someService',
              autoForward: true
            },
            always: {
              target: 'stop',
              guard: (ctx) => ctx.count === -3
            },
            on: {
              DEC: { actions: assign({ count: (ctx) => ctx.count - 1 }) },
              FORWARD_DEC: undefined
            }
          },
          stop: {
            type: 'final'
          }
        }
      },
      {
        actors: {
          child: invokeMachine(childMachine)
        }
      }
    );

    let state: any;
    const service = interpret(someParentMachine)
      .onTransition((s) => {
        state = s;
      })
      .onDone(() => {
        // 1. The 'parent' machine will not do anything (inert transition)
        // 2. The 'FORWARD_DEC' event will be forwarded to the 'child' machine (autoForward: true)
        // 3. On the 'child' machine, the 'FORWARD_DEC' event sends the 'DEC' action to the 'parent' thrice
        // 4. The context of the 'parent' machine will be updated from 2 to -1

        expect(state.context).toEqual({ count: -3 });
      })
      .start();

    service.send('FORWARD_DEC');
  });

  it('should forward events to services if autoForward: true before processing them', (done) => {
    const actual: string[] = [];

    const childMachine = createMachine<{ count: number }>({
      id: 'child',
      context: { count: 0 },
      initial: 'counting',
      states: {
        counting: {
          on: {
            INCREMENT: [
              {
                target: 'done',
                guard: (ctx) => {
                  actual.push('child got INCREMENT');
                  return ctx.count >= 2;
                }
              },
              {
                target: undefined
              }
            ].map((transition) => ({
              ...transition,
              actions: assign((ctx) => ({ count: ++ctx.count }))
            }))
          }
        },
        done: {
          type: 'final',
          data: (ctx) => ({ countedTo: ctx.count })
        }
      },
      on: {
        START: {
          actions: () => {
            throw new Error('Should not receive START action here.');
          }
        }
      }
    });

    const parentMachine = createMachine<{ countedTo: number }>({
      id: 'parent',
      context: { countedTo: 0 },
      initial: 'idle',
      states: {
        idle: {
          on: {
            START: 'invokeChild'
          }
        },
        invokeChild: {
          invoke: {
            src: invokeMachine(childMachine),
            autoForward: true,
            onDone: {
              target: 'done',
              actions: assign((_ctx, event) => ({
                countedTo: event.data.countedTo
              }))
            }
          },
          on: {
            INCREMENT: {
              actions: () => {
                actual.push('parent got INCREMENT');
              }
            }
          }
        },
        done: {
          type: 'final'
        }
      }
    });

    let state: any;
    const service = interpret(parentMachine)
      .onTransition((s) => {
        state = s;
      })
      .onDone(() => {
        expect(state.context).toEqual({ countedTo: 3 });
        expect(actual).toEqual([
          'child got INCREMENT',
          'parent got INCREMENT',
          'child got INCREMENT',
          'parent got INCREMENT',
          'child got INCREMENT',
          'parent got INCREMENT'
        ]);
        done();
      })
      .start();

    service.send('START');
    service.send('INCREMENT');
    service.send('INCREMENT');
    service.send('INCREMENT');
  });

  it('should forward events to services if autoForward: true before processing them (when sending batches)', (done) => {
    const actual: string[] = [];

    const childMachine = createMachine<{ count: number }>({
      id: 'child',
      context: { count: 0 },
      initial: 'counting',
      states: {
        counting: {
          on: {
            INCREMENT: [
              {
                target: 'done',
                guard: (ctx) => {
                  actual.push('child got INCREMENT');
                  return ctx.count >= 2;
                }
              },
              {
                target: undefined
              }
            ].map((transition) => ({
              ...transition,
              actions: assign((ctx) => ({ count: ++ctx.count }))
            }))
          }
        },
        done: {
          type: 'final',
          data: (ctx) => ({ countedTo: ctx.count })
        }
      },
      on: {
        START: {
          actions: () => {
            throw new Error('Should not receive START action here.');
          }
        }
      }
    });

    const parentMachine = createMachine<{ countedTo: number }>({
      id: 'parent',
      context: { countedTo: 0 },
      initial: 'idle',
      states: {
        idle: {
          on: {
            START: 'invokeChild'
          }
        },
        invokeChild: {
          invoke: {
            src: invokeMachine(childMachine),
            autoForward: true,
            onDone: {
              target: 'done',
              actions: assign((_ctx, event) => ({
                countedTo: event.data.countedTo
              }))
            }
          },
          on: {
            INCREMENT: {
              actions: () => {
                actual.push('parent got INCREMENT');
              }
            }
          }
        },
        done: {
          type: 'final'
        }
      }
    });

    let state: any;
    const service = interpret(parentMachine)
      .onTransition((s) => {
        state = s;
      })
      .onDone(() => {
        expect(state.context).toEqual({ countedTo: 3 });
        expect(actual).toEqual([
          'child got INCREMENT',
          'parent got INCREMENT',
          'child got INCREMENT',
          'child got INCREMENT',
          'parent got INCREMENT',
          'parent got INCREMENT'
        ]);
        done();
      })
      .start();

    service.batch(['START']);
    service.batch(['INCREMENT']);
    service.batch(['INCREMENT', 'INCREMENT']);
  });

  it('should start services (explicit machine, invoke = config)', (done) => {
    interpret(fetcherMachine)
      .onDone(() => {
        done();
      })
      .start()
      .send('GO_TO_WAITING');
  });

  it('should start services (explicit machine, invoke = machine)', (done) => {
    interpret(fetcherMachine)
      .onDone((_) => {
        done();
      })
      .start()
      .send('GO_TO_WAITING_MACHINE');
  });

  it('should start services (machine as invoke config)', (done) => {
    const machineInvokeMachine = createMachine<
      any,
      { type: 'SUCCESS'; data: number }
    >({
      id: 'machine-invoke',
      initial: 'pending',
      states: {
        pending: {
          invoke: invokeMachine(
            createMachine({
              id: 'child',
              initial: 'sending',
              states: {
                sending: {
                  entry: sendParent({ type: 'SUCCESS', data: 42 })
                }
              }
            })
          ),
          on: {
            SUCCESS: {
              target: 'success',
              guard: (_, e) => {
                return e.data === 42;
              }
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    interpret(machineInvokeMachine)
      .onDone(() => done())
      .start();
  });

  it('should start deeply nested service (machine as invoke config)', (done) => {
    const machineInvokeMachine = createMachine<
      any,
      { type: 'SUCCESS'; data: number }
    >({
      id: 'parent',
      initial: 'a',
      states: {
        a: {
          initial: 'b',
          states: {
            b: {
              invoke: invokeMachine(
                createMachine({
                  id: 'child',
                  initial: 'sending',
                  states: {
                    sending: {
                      entry: sendParent({ type: 'SUCCESS', data: 42 })
                    }
                  }
                })
              )
            }
          }
        },
        success: {
          id: 'success',
          type: 'final'
        }
      },
      on: {
        SUCCESS: {
          target: 'success',
          guard: (_, e) => {
            return e.data === 42;
          }
        }
      }
    });

    interpret(machineInvokeMachine)
      .onDone(() => done())
      .start();
  });

  it('should use the service overwritten by withConfig', (done) => {
    const childMachine = createMachine({
      id: 'child',
      initial: 'init',
      states: {
        init: {}
      }
    });

    const someParentMachine = createMachine(
      {
        id: 'parent',
        context: { count: 0 },
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'child',
              id: 'someService',
              autoForward: true
            },
            on: {
              STOP: 'stop'
            }
          },
          stop: {
            type: 'final'
          }
        }
      },
      {
        actors: {
          child: invokeMachine(childMachine)
        }
      }
    );

    interpret(
      someParentMachine.provide({
        actors: {
          child: invokeMachine(
            createMachine({
              id: 'child',
              initial: 'init',
              states: {
                init: {
                  entry: [sendParent('STOP')]
                }
              }
            })
          )
        }
      })
    )
      .onDone(() => {
        done();
      })
      .start();
  });

  it('should not start services only once when using withContext', () => {
    let startCount = 0;

    const startMachine = createMachine({
      id: 'start',
      initial: 'active',
      context: { foo: true },
      states: {
        active: {
          invoke: {
            src: invokeActivity(() => {
              startCount++;
            })
          }
        }
      }
    });

    const startService = interpret(startMachine.withContext({ foo: false }));

    startService.start();

    expect(startCount).toEqual(1);
  });

  describe('parent to child', () => {
    const subMachine = createMachine({
      id: 'child',
      initial: 'one',
      states: {
        one: {
          on: { NEXT: 'two' }
        },
        two: {
          entry: sendParent('NEXT')
        }
      }
    });

    it('should communicate with the child machine (invoke on machine)', (done) => {
      const mainMachine = createMachine({
        id: 'parent',
        initial: 'one',
        invoke: {
          id: 'foo-child',
          src: invokeMachine(subMachine)
        },
        states: {
          one: {
            entry: send('NEXT', { to: 'foo-child' }),
            on: { NEXT: 'two' }
          },
          two: {
            type: 'final'
          }
        }
      });

      interpret(mainMachine)
        .onDone(() => {
          done();
        })
        .start();
    });

    it('should communicate with the child machine (invoke on created machine)', (done) => {
      interface MainMachineCtx {
        machine: typeof subMachine;
      }

      const mainMachine = createMachine<MainMachineCtx>({
        id: 'parent',
        initial: 'one',
        context: {
          machine: subMachine
        },
        invoke: {
          id: 'foo-child',
          src: invokeMachine((ctx) => ctx.machine)
        },
        states: {
          one: {
            entry: send('NEXT', { to: 'foo-child' }),
            on: { NEXT: 'two' }
          },
          two: {
            type: 'final'
          }
        }
      });

      interpret(mainMachine)
        .onDone(() => {
          done();
        })
        .start();
    });

    it('should communicate with the child machine (invoke on state)', (done) => {
      const mainMachine = createMachine({
        id: 'parent',
        initial: 'one',
        states: {
          one: {
            invoke: {
              id: 'foo-child',
              src: invokeMachine(subMachine)
            },
            entry: send('NEXT', { to: 'foo-child' }),
            on: { NEXT: 'two' }
          },
          two: {
            type: 'final'
          }
        }
      });

      interpret(mainMachine)
        .onDone(() => {
          done();
        })
        .start();
    });

    it('should transition correctly if child invocation causes it to directly go to final state', (done) => {
      const doneSubMachine = createMachine({
        id: 'child',
        initial: 'one',
        states: {
          one: {
            on: { NEXT: 'two' }
          },
          two: {
            type: 'final'
          }
        }
      });

      const mainMachine = createMachine({
        id: 'parent',
        initial: 'one',
        states: {
          one: {
            invoke: {
              id: 'foo-child',
              src: invokeMachine(doneSubMachine),
              onDone: 'two'
            },
            entry: send('NEXT', { to: 'foo-child' })
          },
          two: {
            on: { NEXT: 'three' }
          },
          three: {
            type: 'final'
          }
        }
      });

      const expectedStateValue = 'two';
      let currentState;
      interpret(mainMachine)
        .onTransition((current) => (currentState = current))
        .start();
      setTimeout(() => {
        expect(currentState.value).toEqual(expectedStateValue);
        done();
      }, 30);
    });

    it('should work with invocations defined in orthogonal state nodes', (done) => {
      const pongMachine = createMachine({
        id: 'pong',
        initial: 'active',
        states: {
          active: {
            type: 'final',
            data: { secret: 'pingpong' }
          }
        }
      });

      const pingMachine = createMachine({
        id: 'ping',
        type: 'parallel',
        states: {
          one: {
            initial: 'active',
            states: {
              active: {
                invoke: {
                  id: 'pong',
                  src: invokeMachine(pongMachine),
                  onDone: {
                    target: 'success',
                    guard: (_, e) => e.data.secret === 'pingpong'
                  }
                }
              },
              success: {
                type: 'final'
              }
            }
          }
        }
      });

      interpret(pingMachine)
        .onDone(() => {
          done();
        })
        .start();
    });

    it('should not reinvoke root-level invocations', (done) => {
      // https://github.com/davidkpiano/xstate/issues/2147

      let invokeCount = 0;
      let invokeDisposeCount = 0;
      let actionsCount = 0;
      let entryActionsCount = 0;

      const machine = createMachine({
        invoke: {
          src: invokeCallback(() => () => {
            invokeCount++;

            return () => {
              invokeDisposeCount++;
            };
          })
        },
        entry: () => entryActionsCount++,
        on: {
          UPDATE: {
            internal: true,
            actions: () => {
              actionsCount++;
            }
          }
        }
      });

      const service = interpret(machine).start();
      expect(entryActionsCount).toEqual(1);
      expect(invokeCount).toEqual(1);
      expect(invokeDisposeCount).toEqual(0);
      expect(actionsCount).toEqual(0);

      service.send('UPDATE');
      expect(entryActionsCount).toEqual(1);
      expect(invokeCount).toEqual(1);
      expect(invokeDisposeCount).toEqual(0);
      expect(actionsCount).toEqual(1);

      service.send('UPDATE');
      expect(entryActionsCount).toEqual(1);
      expect(invokeCount).toEqual(1);
      expect(invokeDisposeCount).toEqual(0);
      expect(actionsCount).toEqual(2);
      done();
    });
  });

  type PromiseExecutor = (
    resolve: (value?: any) => void,
    reject: (reason?: any) => void
  ) => void;

  const promiseTypes = [
    {
      type: 'Promise',
      createPromise(executor: PromiseExecutor): Promise<any> {
        return new Promise(executor);
      }
    },
    {
      type: 'PromiseLike',
      createPromise(executor: PromiseExecutor): PromiseLike<any> {
        // Simulate a Promise/A+ thenable / polyfilled Promise.
        function createThenable(promise: Promise<any>): PromiseLike<any> {
          return {
            then(onfulfilled, onrejected) {
              return createThenable(promise.then(onfulfilled, onrejected));
            }
          };
        }
        return createThenable(new Promise(executor));
      }
    }
  ];

  promiseTypes.forEach(({ type, createPromise }) => {
    describe(`with promises (${type})`, () => {
      const invokePromiseMachine = createMachine({
        id: 'invokePromise',
        initial: 'pending',
        context: {
          id: 42,
          succeed: true
        },
        states: {
          pending: {
            invoke: {
              src: invokePromise((ctx) =>
                createPromise((resolve) => {
                  if (ctx.succeed) {
                    resolve(ctx.id);
                  } else {
                    throw new Error(`failed on purpose for: ${ctx.id}`);
                  }
                })
              ),
              onDone: {
                target: 'success',
                guard: (ctx, e) => {
                  return e.data === ctx.id;
                }
              },
              onError: 'failure'
            }
          },
          success: {
            type: 'final'
          },
          failure: {
            type: 'final'
          }
        }
      });

      it('should be invoked with a promise factory and resolve through onDone', (done) => {
        const service = interpret(invokePromiseMachine)
          .onDone(() => {
            expect(service.state._event.origin).toBeDefined();
            done();
          })
          .start();
      });

      it('should be invoked with a promise factory and reject with ErrorExecution', (done) => {
        interpret(invokePromiseMachine.withContext({ id: 31, succeed: false }))
          .onDone(() => done())
          .start();
      });

      it('should be invoked with a promise factory and surface any unhandled errors', (done) => {
        const promiseMachine = createMachine({
          id: 'invokePromise',
          initial: 'pending',
          states: {
            pending: {
              invoke: {
                src: invokePromise(() =>
                  createPromise(() => {
                    throw new Error('test');
                  })
                ),
                onDone: 'success'
              }
            },
            success: {
              type: 'final'
            }
          }
        });

        const service = interpret(promiseMachine).onError((err) => {
          expect(err.message).toEqual(expect.stringMatching(/test/));
          done();
        });
        service.start();
      });

      // tslint:disable-next-line:max-line-length
      it('should be invoked with a promise factory and stop on unhandled onError target when on strict mode', (done) => {
        const doneSpy = jest.fn();

        const promiseMachine = createMachine({
          id: 'invokePromise',
          initial: 'pending',
          strict: true,
          states: {
            pending: {
              invoke: {
                src: invokePromise(() =>
                  createPromise(() => {
                    throw new Error('test');
                  })
                ),
                onDone: 'success'
              }
            },
            success: {
              type: 'final'
            }
          }
        });

        interpret(promiseMachine)
          .onDone(doneSpy)
          .onError((err) => {
            // TODO: determine if err should be the full SCXML error event
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('test');
          })
          .onStop(() => {
            expect(doneSpy).not.toHaveBeenCalled();
            done();
          })
          .start();
      });

      it('should be invoked with a promise factory and resolve through onDone for compound state nodes', (done) => {
        const promiseMachine = createMachine({
          id: 'promise',
          initial: 'parent',
          states: {
            parent: {
              initial: 'pending',
              states: {
                pending: {
                  invoke: {
                    src: invokePromise(() =>
                      createPromise((resolve) => resolve())
                    ),
                    onDone: 'success'
                  }
                },
                success: {
                  type: 'final'
                }
              },
              onDone: 'success'
            },
            success: {
              type: 'final'
            }
          }
        });

        interpret(promiseMachine)
          .onDone(() => done())
          .start();
      });

      it('should be invoked with a promise service and resolve through onDone for compound state nodes', (done) => {
        const promiseMachine = createMachine(
          {
            id: 'promise',
            initial: 'parent',
            states: {
              parent: {
                initial: 'pending',
                states: {
                  pending: {
                    invoke: {
                      src: 'somePromise',
                      onDone: 'success'
                    }
                  },
                  success: {
                    type: 'final'
                  }
                },
                onDone: 'success'
              },
              success: {
                type: 'final'
              }
            }
          },
          {
            actors: {
              somePromise: invokePromise(() =>
                createPromise((resolve) => resolve())
              )
            }
          }
        );

        interpret(promiseMachine)
          .onDone(() => done())
          .start();
      });

      it('should assign the resolved data when invoked with a promise factory', (done) => {
        const promiseMachine = createMachine<{ count: number }>({
          id: 'promise',
          context: { count: 0 },
          initial: 'pending',
          states: {
            pending: {
              invoke: {
                src: invokePromise(() =>
                  createPromise((resolve) => resolve({ count: 1 }))
                ),
                onDone: {
                  target: 'success',
                  actions: assign({ count: (_, e) => e.data.count })
                }
              }
            },
            success: {
              type: 'final'
            }
          }
        });

        let state: any;
        interpret(promiseMachine)
          .onTransition((s) => {
            state = s;
          })
          .onDone(() => {
            expect(state.context.count).toEqual(1);
            done();
          })
          .start();
      });

      it('should assign the resolved data when invoked with a promise service', (done) => {
        const promiseMachine = createMachine<{ count: number }>(
          {
            id: 'promise',
            context: { count: 0 },
            initial: 'pending',
            states: {
              pending: {
                invoke: {
                  src: 'somePromise',
                  onDone: {
                    target: 'success',
                    actions: assign({ count: (_, e) => e.data.count })
                  }
                }
              },
              success: {
                type: 'final'
              }
            }
          },
          {
            actors: {
              somePromise: invokePromise(() =>
                createPromise((resolve) => resolve({ count: 1 }))
              )
            }
          }
        );

        let state: any;
        interpret(promiseMachine)
          .onTransition((s) => {
            state = s;
          })
          .onDone(() => {
            expect(state.context.count).toEqual(1);
            done();
          })
          .start();
      });

      it('should provide the resolved data when invoked with a promise factory', (done) => {
        let count = 0;

        const promiseMachine = createMachine({
          id: 'promise',
          context: { count: 0 },
          initial: 'pending',
          states: {
            pending: {
              invoke: {
                src: invokePromise(() =>
                  createPromise((resolve) => resolve({ count: 1 }))
                ),
                onDone: {
                  target: 'success',
                  actions: (_, e) => {
                    count = e.data.count;
                  }
                }
              }
            },
            success: {
              type: 'final'
            }
          }
        });

        interpret(promiseMachine)
          .onDone(() => {
            expect(count).toEqual(1);
            done();
          })
          .start();
      });

      it('should provide the resolved data when invoked with a promise service', (done) => {
        let count = 0;

        const promiseMachine = createMachine(
          {
            id: 'promise',
            initial: 'pending',
            states: {
              pending: {
                invoke: {
                  src: 'somePromise',
                  onDone: {
                    target: 'success',
                    actions: (_, e) => {
                      count = e.data.count;
                    }
                  }
                }
              },
              success: {
                type: 'final'
              }
            }
          },
          {
            actors: {
              somePromise: invokePromise(() =>
                createPromise((resolve) => resolve({ count: 1 }))
              )
            }
          }
        );

        interpret(promiseMachine)
          .onDone(() => {
            expect(count).toEqual(1);
            done();
          })
          .start();
      });

      it('should be able to specify a Promise as a service', (done) => {
        interface BeginEvent {
          type: 'BEGIN';
          payload: boolean;
        }
        const promiseMachine = createMachine<{ foo: boolean }, BeginEvent>(
          {
            id: 'promise',
            initial: 'pending',
            context: {
              foo: true
            },
            states: {
              pending: {
                on: {
                  BEGIN: 'first'
                }
              },
              first: {
                invoke: {
                  src: 'somePromise',
                  onDone: 'last'
                }
              },
              last: {
                type: 'final'
              }
            }
          },
          {
            actors: {
              somePromise: invokePromise((ctx, e: BeginEvent) => {
                return createPromise((resolve, reject) => {
                  ctx.foo && e.payload ? resolve() : reject();
                });
              })
            }
          }
        );

        interpret(promiseMachine)
          .onDone(() => done())
          .start()
          .send({
            type: 'BEGIN',
            payload: true
          });
      });
    });
  });

  describe('with callbacks', () => {
    it('should be able to specify a callback as a service', (done) => {
      interface BeginEvent {
        type: 'BEGIN';
        payload: boolean;
      }
      interface CallbackEvent {
        type: 'CALLBACK';
        data: number;
      }
      const callbackMachine = createMachine<
        {
          foo: boolean;
        },
        BeginEvent | CallbackEvent
      >(
        {
          id: 'callback',
          initial: 'pending',
          context: {
            foo: true
          },
          states: {
            pending: {
              on: {
                BEGIN: 'first'
              }
            },
            first: {
              invoke: {
                src: 'someCallback'
              },
              on: {
                CALLBACK: {
                  target: 'last',
                  guard: (_, e) => e.data === 42
                }
              }
            },
            last: {
              type: 'final'
            }
          }
        },
        {
          actors: {
            someCallback: invokeCallback(
              (ctx, e: BeginEvent) => (cb: (ev: CallbackEvent) => void) => {
                if (ctx.foo && e.payload) {
                  cb({
                    type: 'CALLBACK',
                    data: 40
                  });
                  cb({
                    type: 'CALLBACK',
                    data: 41
                  });
                  cb({
                    type: 'CALLBACK',
                    data: 42
                  });
                }
              }
            )
          }
        }
      );

      interpret(callbackMachine)
        .onDone(() => done())
        .start()
        .send({
          type: 'BEGIN',
          payload: true
        });
    });

    it('should transition correctly if callback function sends an event', () => {
      const callbackMachine = createMachine(
        {
          id: 'callback',
          initial: 'pending',
          context: { foo: true },
          states: {
            pending: {
              on: { BEGIN: 'first' }
            },
            first: {
              invoke: {
                src: 'someCallback'
              },
              on: { CALLBACK: 'intermediate' }
            },
            intermediate: {
              on: { NEXT: 'last' }
            },
            last: {
              type: 'final'
            }
          }
        },
        {
          actors: {
            someCallback: invokeCallback(() => (cb) => {
              cb({ type: 'CALLBACK' });
            })
          }
        }
      );

      const expectedStateValues = ['pending', 'first', 'intermediate'];
      const stateValues: StateValue[] = [];
      interpret(callbackMachine)
        .onTransition((current) => stateValues.push(current.value))
        .start()
        .send('BEGIN');
      for (let i = 0; i < expectedStateValues.length; i++) {
        expect(stateValues[i]).toEqual(expectedStateValues[i]);
      }
    });

    it('should transition correctly if callback function invoked from start and sends an event', () => {
      const callbackMachine = createMachine(
        {
          id: 'callback',
          initial: 'idle',
          context: { foo: true },
          states: {
            idle: {
              invoke: {
                src: 'someCallback'
              },
              on: { CALLBACK: 'intermediate' }
            },
            intermediate: {
              on: { NEXT: 'last' }
            },
            last: {
              type: 'final'
            }
          }
        },
        {
          actors: {
            someCallback: invokeCallback(() => (cb) => {
              cb({ type: 'CALLBACK' });
            })
          }
        }
      );

      const expectedStateValues = ['idle', 'intermediate'];
      const stateValues: StateValue[] = [];
      interpret(callbackMachine)
        .onTransition((current) => stateValues.push(current.value))
        .start()
        .send('BEGIN');
      for (let i = 0; i < expectedStateValues.length; i++) {
        expect(stateValues[i]).toEqual(expectedStateValues[i]);
      }
    });

    // tslint:disable-next-line:max-line-length
    it('should transition correctly if transient transition happens before current state invokes callback function and sends an event', () => {
      const callbackMachine = createMachine(
        {
          id: 'callback',
          initial: 'pending',
          context: { foo: true },
          states: {
            pending: {
              on: { BEGIN: 'first' }
            },
            first: {
              always: 'second'
            },
            second: {
              invoke: {
                src: 'someCallback'
              },
              on: { CALLBACK: 'third' }
            },
            third: {
              on: { NEXT: 'last' }
            },
            last: {
              type: 'final'
            }
          }
        },
        {
          actors: {
            someCallback: invokeCallback(() => (cb) => {
              cb({ type: 'CALLBACK' });
            })
          }
        }
      );

      const expectedStateValues = ['pending', 'second', 'third'];
      const stateValues: StateValue[] = [];
      interpret(callbackMachine)
        .onTransition((current) => {
          stateValues.push(current.value);
        })
        .start()
        .send('BEGIN');

      for (let i = 0; i < expectedStateValues.length; i++) {
        expect(stateValues[i]).toEqual(expectedStateValues[i]);
      }
    });

    it('should treat a callback source as an event stream', (done) => {
      interpret(intervalMachine)
        .onDone(() => done())
        .start();
    });

    it('should dispose of the callback (if disposal function provided)', (done) => {
      let state: any;
      const service = interpret(intervalMachine)
        .onTransition((s) => {
          state = s;
        })
        .onDone(() => {
          // if intervalService isn't disposed after skipping, 'INC' event will
          // keep being sent
          expect(state.context.count).toEqual(0);
          done();
        })
        .start();

      // waits 50 milliseconds before going to final state.
      service.send('SKIP');
    });

    it('callback should be able to receive messages from parent', (done) => {
      const pingPongMachine = createMachine({
        id: 'ping-pong',
        initial: 'active',
        states: {
          active: {
            invoke: {
              id: 'child',
              src: invokeCallback(() => (callback, onReceive) => {
                onReceive((e) => {
                  if (e.type === 'PING') {
                    callback({ type: 'PONG' });
                  }
                });
              })
            },
            entry: send('PING', { to: 'child' }),
            on: {
              PONG: 'done'
            }
          },
          done: {
            type: 'final'
          }
        }
      });

      interpret(pingPongMachine)
        .onDone(() => done())
        .start();
    });

    it('should call onError upon error (sync)', (done) => {
      const errorMachine = createMachine({
        id: 'error',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: invokeActivity(() => {
                throw new Error('test');
              }),
              onError: {
                target: 'failed',
                guard: (_, e) => {
                  return e.data instanceof Error && e.data.message === 'test';
                }
              }
            }
          },
          failed: {
            type: 'final'
          }
        }
      });

      interpret(errorMachine)
        .onDone(() => done())
        .start();
    });

    it('should transition correctly upon error (sync)', () => {
      const errorMachine = createMachine({
        id: 'error',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: invokeActivity(() => {
                throw new Error('test');
              }),
              onError: 'failed'
            }
          },
          failed: {
            on: { RETRY: 'safe' }
          }
        }
      });

      const expectedStateValue = 'failed';
      let currentState;
      interpret(errorMachine)
        .onTransition((current) => (currentState = current))
        .start();
      expect(currentState.value).toEqual(expectedStateValue);
    });

    it('should call onError upon error (async)', (done) => {
      const errorMachine = createMachine({
        id: 'asyncError',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: invokeCallback(() => async () => {
                await true;
                throw new Error('test');
              }),
              onError: {
                target: 'failed',
                guard: (_, e) => {
                  return e.data instanceof Error && e.data.message === 'test';
                }
              }
            }
          },
          failed: {
            type: 'final'
          }
        }
      });

      interpret(errorMachine)
        .onDone(() => done())
        .start();
    });

    it('should call onDone when resolved (async)', (done) => {
      let state: any;

      const asyncWithDoneMachine = createMachine<{ result?: any }>({
        id: 'async',
        initial: 'fetch',
        context: { result: undefined },
        states: {
          fetch: {
            invoke: {
              src: invokeCallback(() => async () => {
                await true;
                return 42;
              }),
              onDone: {
                target: 'success',
                actions: assign((_, { data: result }) => ({ result }))
              }
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      interpret(asyncWithDoneMachine)
        .onTransition((s) => {
          state = s;
        })
        .onDone(() => {
          expect(state.context.result).toEqual(42);
          done();
        })
        .start();
    });

    it('should call onError only on the state which has invoked failed service', () => {
      let errorHandlersCalled = 0;

      const errorMachine = createMachine({
        initial: 'start',
        states: {
          start: {
            on: {
              FETCH: 'fetch'
            }
          },
          fetch: {
            type: 'parallel',
            states: {
              first: {
                invoke: {
                  src: invokeActivity(() => {
                    throw new Error('test');
                  }),
                  onError: {
                    target: 'failed',
                    guard: () => {
                      errorHandlersCalled++;
                      return false;
                    }
                  }
                }
              },
              second: {
                invoke: {
                  src: invokeActivity(() => {
                    // empty
                  }),
                  onError: {
                    target: 'failed',
                    guard: () => {
                      errorHandlersCalled++;
                      return false;
                    }
                  }
                }
              },
              failed: {
                type: 'final'
              }
            }
          }
        }
      });

      interpret(errorMachine).start().send('FETCH');

      expect(errorHandlersCalled).toEqual(1);
    });

    it('should be able to be stringified', () => {
      const waitingState = fetcherMachine.transition(
        fetcherMachine.initialState,
        'GO_TO_WAITING'
      );

      expect(() => {
        JSON.stringify(waitingState);
      }).not.toThrow();

      expect(typeof waitingState.actions[0].src.type).toBe('string');
    });

    it('should throw error if unhandled (sync)', () => {
      const errorMachine = createMachine({
        id: 'asyncError',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: invokeCallback(() => {
                throw new Error('test');
              })
            }
          },
          failed: {
            type: 'final'
          }
        }
      });

      const service = interpret(errorMachine);
      expect(() => service.start()).toThrow();
    });

    describe('sub invoke race condition', () => {
      const anotherChildMachine = createMachine({
        id: 'child',
        initial: 'start',
        states: {
          start: {
            on: { STOP: 'end' }
          },
          end: {
            type: 'final'
          }
        }
      });

      const anotherParentMachine = createMachine({
        id: 'parent',
        initial: 'begin',
        states: {
          begin: {
            invoke: {
              src: invokeMachine(anotherChildMachine),
              id: 'invoked.child',
              onDone: 'completed'
            },
            on: {
              STOPCHILD: {
                actions: send('STOP', { to: 'invoked.child' })
              }
            }
          },
          completed: {
            type: 'final'
          }
        }
      });

      it('ends on the completed state', (done) => {
        const events: EventObject[] = [];
        let state: any;
        const service = interpret(anotherParentMachine)
          .onTransition((s) => {
            state = s;
            events.push(s.event);
          })
          .onDone(() => {
            expect(events.map((e) => e.type)).toEqual([
              actionTypes.init,
              'STOPCHILD',
              doneInvoke('invoked.child').type
            ]);
            expect(state.value).toEqual('completed');
            done();
          })
          .start();

        service.send('STOPCHILD');
      });
    });
  });

  describe('with observables', () => {
    const infinite$ = interval(10);

    it('should work with an infinite observable', (done) => {
      interface Events {
        type: 'COUNT';
        value: number;
      }
      const obsMachine = createMachine<{ count: number | undefined }, Events>({
        id: 'obs',
        initial: 'counting',
        context: { count: undefined },
        states: {
          counting: {
            invoke: {
              src: invokeObservable(() =>
                infinite$.pipe(
                  map((value) => {
                    return { type: 'COUNT', value };
                  })
                )
              )
            },
            always: {
              target: 'counted',
              guard: (ctx) => ctx.count === 5
            },
            on: {
              COUNT: { actions: assign({ count: (_, e) => e.value }) }
            }
          },
          counted: {
            type: 'final'
          }
        }
      });

      const service = interpret(obsMachine)
        .onDone(() => {
          expect(service.state._event.origin).toBeDefined();
          done();
        })
        .start();
    });

    it('should work with a finite observable', (done) => {
      interface Ctx {
        count: number | undefined;
      }
      interface Events {
        type: 'COUNT';
        value: number;
      }
      const obsMachine = createMachine<Ctx, Events>({
        id: 'obs',
        initial: 'counting',
        context: {
          count: undefined
        },
        states: {
          counting: {
            invoke: {
              src: invokeObservable(() =>
                infinite$.pipe(
                  take(5),
                  map((value) => {
                    return {
                      type: 'COUNT',
                      value
                    };
                  })
                )
              ),
              onDone: {
                target: 'counted',
                guard: (ctx) => ctx.count === 4
              }
            },
            on: {
              COUNT: {
                actions: assign({
                  count: (_, e) => e.value
                })
              }
            }
          },
          counted: {
            type: 'final'
          }
        }
      });

      interpret(obsMachine)
        .onDone(() => {
          done();
        })
        .start();
    });

    it('should receive an emitted error', (done) => {
      interface Ctx {
        count: number | undefined;
      }
      interface Events {
        type: 'COUNT';
        value: number;
      }
      const obsMachine = createMachine<Ctx, Events>({
        id: 'obs',
        initial: 'counting',
        context: { count: undefined },
        states: {
          counting: {
            invoke: {
              src: invokeObservable(() =>
                infinite$.pipe(
                  map((value) => {
                    if (value === 5) {
                      throw new Error('some error');
                    }

                    return { type: 'COUNT', value };
                  })
                )
              ),
              onError: {
                target: 'success',
                guard: (ctx, e) => {
                  expect(e.data.message).toEqual('some error');
                  return ctx.count === 4 && e.data.message === 'some error';
                }
              }
            },
            on: {
              COUNT: { actions: assign({ count: (_, e) => e.value }) }
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      interpret(obsMachine)
        .onDone(() => {
          done();
        })
        .start();
    });
  });

  describe('with behaviors', () => {
    it('should work with a behavior', (done) => {
      const countBehavior: Behavior<EventObject, number> = {
        transition: (count, event) => {
          if (event.type === 'INC') {
            return count + 1;
          } else if (event.type === 'DEC') {
            return count - 1;
          }
          return count;
        },
        initialState: 0
      };

      const countMachine = createMachine({
        invoke: {
          id: 'count',
          src: () => countBehavior
        },
        on: {
          INC: {
            actions: forwardTo('count')
          }
        }
      });

      const countService = interpret(countMachine)
        .onTransition((state) => {
          if (state.children['count']?.getSnapshot() === 2) {
            done();
          }
        })
        .start();

      countService.send('INC');
      countService.send('INC');
    });

    it('behaviors should have reference to the parent', (done) => {
      const pongBehavior: Behavior<EventObject, undefined> = {
        transition: (_, event, { parent }) => {
          if (event.type === 'PING') {
            parent?.send({ type: 'PONG' });
          }

          return undefined;
        },
        initialState: undefined
      };

      const pingMachine = createMachine({
        initial: 'waiting',
        states: {
          waiting: {
            entry: send('PING', { to: 'ponger' }),
            invoke: {
              id: 'ponger',
              src: () => pongBehavior
            },
            on: {
              PONG: 'success'
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      const pingService = interpret(pingMachine).onDone(() => {
        done();
      });
      pingService.start();
    });
  });

  describe('with reducers', () => {
    it('should work with a reducer', (done) => {
      const countReducer = (
        count: number,
        event: { type: 'INC' } | { type: 'DEC' }
      ): number => {
        if (event.type === 'INC') {
          return count + 1;
        } else if (event.type === 'DEC') {
          return count - 1;
        }
        return count;
      };

      const countMachine = createMachine({
        invoke: {
          id: 'count',
          src: () => fromReducer(countReducer, 0)
        },
        on: {
          INC: {
            actions: forwardTo('count')
          }
        }
      });

      const countService = interpret(countMachine)
        .onTransition((state) => {
          if (state.children['count']?.getSnapshot() === 2) {
            done();
          }
        })
        .start();

      countService.send('INC');
      countService.send('INC');
    });

    it('should schedule events in a FIFO queue', (done) => {
      type CountEvents = { type: 'INC' } | { type: 'DOUBLE' };

      const countReducer = (
        count: number,
        event: { type: 'INC' } | { type: 'DOUBLE' },
        { self }: ActorContext<CountEvents, any>
      ): number => {
        if (event.type === 'INC') {
          self.send({ type: 'DOUBLE' });
          return count + 1;
        }
        if (event.type === 'DOUBLE') {
          return count * 2;
        }

        return count;
      };

      const countMachine = createMachine({
        invoke: {
          id: 'count',
          src: () => fromReducer(countReducer, 0)
        },
        on: {
          INC: {
            actions: forwardTo('count')
          }
        }
      });

      const countService = interpret(countMachine)
        .onTransition((state) => {
          if (state.children['count']?.getSnapshot() === 2) {
            done();
          }
        })
        .start();

      countService.send('INC');
    });
  });

  describe('with machines', () => {
    const pongMachine = createMachine({
      id: 'pong',
      initial: 'active',
      states: {
        active: {
          on: {
            PING: {
              // Sends 'PONG' event to parent machine
              actions: sendParent('PONG')
            }
          }
        }
      }
    });

    // Parent machine
    const pingMachine = createMachine({
      id: 'ping',
      initial: 'innerMachine',
      states: {
        innerMachine: {
          initial: 'active',
          states: {
            active: {
              invoke: {
                id: 'pong',
                src: invokeMachine(pongMachine)
              },
              // Sends 'PING' event to child machine with ID 'pong'
              entry: send('PING', { to: 'pong' }),
              on: {
                PONG: 'innerSuccess'
              }
            },
            innerSuccess: {
              type: 'final'
            }
          },
          onDone: 'success'
        },
        success: { type: 'final' }
      }
    });

    it('should create invocations from machines in nested states', (done) => {
      interpret(pingMachine)
        .onDone(() => done())
        .start();
    });

    it('should sync with child machine when sync: true option is provided', (done) => {
      const childMachine = createMachine({
        initial: 'working',
        context: { count: 42 },
        states: {
          working: {}
        }
      });

      const machine = createMachine<any, UpdateObject>({
        initial: 'pending',
        states: {
          pending: {
            invoke: {
              src: invokeMachine(childMachine, { sync: true })
            }
          },
          success: { type: 'final' }
        }
      });

      const service = interpret(machine).onTransition((state) => {
        if (state.event.type === actionTypes.update) {
          expect(state.event.state.context).toEqual({ count: 42 });
          done();
        }
      });

      service.start();
    });
  });

  describe('multiple simultaneous services', () => {
    const multiple = createMachine<any>({
      id: 'machine',
      initial: 'one',

      context: {},

      on: {
        ONE: {
          actions: assign({
            one: 'one'
          })
        },

        TWO: {
          actions: assign({
            two: 'two'
          }),
          target: '.three'
        }
      },

      states: {
        one: {
          initial: 'two',
          states: {
            two: {
              invoke: [
                {
                  id: 'child',
                  src: invokeCallback(() => (cb) => cb({ type: 'ONE' }))
                },
                {
                  id: 'child2',
                  src: invokeCallback(() => (cb) => cb({ type: 'TWO' }))
                }
              ]
            }
          }
        },
        three: {
          type: 'final'
        }
      }
    });

    it('should start all services at once', (done) => {
      let state: any;
      const service = interpret(multiple)
        .onTransition((s) => {
          state = s;
        })
        .onDone(() => {
          expect(state.context).toEqual({ one: 'one', two: 'two' });
          done();
        });

      service.start();
    });

    const parallel = createMachine<any>({
      id: 'machine',
      initial: 'one',

      context: {},

      on: {
        ONE: {
          actions: assign({
            one: 'one'
          })
        },

        TWO: {
          actions: assign({
            two: 'two'
          })
        }
      },

      after: {
        // allow both invoked services to get a chance to send their events
        // and don't depend on a potential race condition (with an immediate transition)
        10: '.three'
      },

      states: {
        one: {
          initial: 'two',
          states: {
            two: {
              type: 'parallel',
              states: {
                a: {
                  invoke: {
                    id: 'child',
                    src: invokeCallback(() => (cb) => cb({ type: 'ONE' }))
                  }
                },
                b: {
                  invoke: {
                    id: 'child2',
                    src: invokeCallback(() => (cb) => cb({ type: 'TWO' }))
                  }
                }
              }
            }
          }
        },
        three: {
          type: 'final'
        }
      }
    });

    it('should run services in parallel', (done) => {
      let state: any;
      const service = interpret(parallel)
        .onTransition((s) => {
          state = s;
        })
        .onDone(() => {
          expect(state.context).toEqual({ one: 'one', two: 'two' });
          done();
        });

      service.start();
    });

    it('should not invoke an actor if it gets stopped immediately by transitioning away in immediate microstep', () => {
      // Since an actor will be canceled when the state machine leaves the invoking state
      // it does not make sense to start an actor in a state that will be exited immediately
      let actorStarted = false;

      const transientMachine = createMachine({
        id: 'transient',
        initial: 'active',
        states: {
          active: {
            invoke: {
              id: 'doNotInvoke',
              src: invokeCallback(() => () => {
                actorStarted = true;
              })
            },
            always: 'inactive'
          },
          inactive: {}
        }
      });

      const service = interpret(transientMachine);

      service.start();

      expect(actorStarted).toBe(false);
    });

    // tslint:disable-next-line: max-line-length
    it('should not invoke an actor if it gets stopped immediately by transitioning away in subsequent microstep', () => {
      // Since an actor will be canceled when the state machine leaves the invoking state
      // it does not make sense to start an actor in a state that will be exited immediately
      let actorStarted = false;

      const transientMachine = createMachine({
        initial: 'withNonLeafInvoke',
        states: {
          withNonLeafInvoke: {
            invoke: {
              id: 'doNotInvoke',
              src: invokeCallback(() => () => {
                actorStarted = true;
              })
            },
            initial: 'first',
            states: {
              first: {
                always: 'second'
              },
              second: {
                always: '#inactive'
              }
            }
          },
          inactive: {
            id: 'inactive'
          }
        }
      });

      const service = interpret(transientMachine);

      service.start();

      expect(actorStarted).toBe(false);
    });

    it('should invoke a service if other service gets stopped in subsequent microstep (#1180)', (done) => {
      const machine = createMachine({
        initial: 'running',
        states: {
          running: {
            type: 'parallel',
            states: {
              one: {
                initial: 'active',
                on: {
                  STOP_ONE: '.idle'
                },
                states: {
                  idle: {},
                  active: {
                    invoke: {
                      id: 'active',
                      src: invokeCallback(() => () => {
                        /* ... */
                      })
                    },
                    on: {
                      NEXT: {
                        actions: raise('STOP_ONE')
                      }
                    }
                  }
                }
              },
              two: {
                initial: 'idle',
                on: {
                  NEXT: '.active'
                },
                states: {
                  idle: {},
                  active: {
                    invoke: {
                      id: 'post',
                      src: invokePromise(() => Promise.resolve(42)),
                      onDone: '#done'
                    }
                  }
                }
              }
            }
          },
          done: {
            id: 'done',
            type: 'final'
          }
        }
      });

      const service = interpret(machine)
        .onDone(() => done())
        .start();

      service.send('NEXT');
    });

    // TODO: make it work
    it.skip('should invoke an actor when reentering invoking state within a single macrostep', () => {
      let actorStartedCount = 0;

      const transientMachine = createMachine<{ counter: number }>({
        initial: 'active',
        context: { counter: 0 },
        states: {
          active: {
            invoke: {
              src: invokeCallback(() => () => {
                actorStartedCount++;
              })
            },
            always: [
              {
                guard: (ctx) => ctx.counter === 0,
                target: 'inactive'
              }
            ]
          },
          inactive: {
            entry: assign({ counter: (ctx) => ++ctx.counter }),
            always: 'active'
          }
        }
      });

      const service = interpret(transientMachine);

      service.start();

      expect(actorStartedCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('handles escalated errors', (done) => {
      const child = createMachine({
        initial: 'die',

        states: {
          die: {
            entry: [escalate('oops')]
          }
        }
      });

      const parent = createMachine({
        initial: 'one',

        states: {
          one: {
            invoke: {
              id: 'child',
              src: invokeMachine(child),
              onError: {
                target: 'two',
                guard: (_, event) => event.data === 'oops'
              }
            }
          },
          two: {
            type: 'final'
          }
        }
      });

      interpret(parent)
        .onDone(() => {
          done();
        })
        .start();
    });

    it('handles escalated errors as an expression', (done) => {
      interface ChildContext {
        id: number;
      }

      const child = createMachine<ChildContext>({
        initial: 'die',
        context: { id: 42 },
        states: {
          die: {
            entry: escalate((ctx) => ctx.id)
          }
        }
      });

      const parent = createMachine({
        initial: 'one',

        states: {
          one: {
            invoke: {
              id: 'child',
              src: invokeMachine(child),
              onError: {
                target: 'two',
                guard: (_, event) => {
                  expect(event.data).toEqual(42);
                  return true;
                }
              }
            }
          },
          two: {
            type: 'final'
          }
        }
      });

      interpret(parent)
        .onDone(() => {
          done();
        })
        .start();
    });
  });

  it('invoke `src` should accept invoke source definition', (done) => {
    const machine = createMachine(
      {
        initial: 'searching',
        states: {
          searching: {
            invoke: {
              src: {
                type: 'search',
                endpoint: 'example.com'
              },
              onDone: 'success'
            }
          },
          success: {
            type: 'final'
          }
        }
      },
      {
        actors: {
          search: invokePromise(async (_, __, meta) => {
            expect(meta.src.endpoint).toEqual('example.com');

            return await 42;
          })
        }
      }
    );

    interpret(machine)
      .onDone(() => done())
      .start();
  });
});

describe('services option', () => {
  it('should provide data params to a service creator', (done) => {
    const machine = createMachine(
      {
        initial: 'pending',
        context: {
          count: 42
        },
        states: {
          pending: {
            invoke: {
              src: 'stringService',
              data: {
                staticVal: 'hello',
                newCount: (ctx) => ctx.count * 2
              },
              onDone: 'success'
            }
          },
          success: {
            type: 'final'
          }
        }
      },
      {
        actors: {
          stringService: invokePromise((ctx, _, { data }) => {
            expect(ctx).toEqual({ count: 42 });

            expect(data).toEqual({ newCount: 84, staticVal: 'hello' });

            return new Promise<void>((res) => {
              res();
            });
          })
        }
      }
    );

    const service = interpret(machine).onDone(() => {
      done();
    });

    service.start();
  });
});
