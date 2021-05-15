import {
  Machine,
  interpret,
  assign,
  sendParent,
  send,
  EventObject,
  StateValue,
  createMachine
} from '../src';
import {
  actionTypes,
  done as _done,
  doneInvoke,
  escalate,
  raise
} from '../src/actions';
import { interval } from 'rxjs';
import { map, take } from 'rxjs/operators';

const user = { name: 'David' };

const fetchMachine = Machine<{ userId: string | undefined }>({
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
          cond: (ctx) => ctx.userId !== undefined
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

const fetcherMachine = Machine({
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
        src: fetchMachine,
        data: {
          userId: (ctx) => ctx.selectedUserId
        },
        onDone: {
          target: 'received',
          cond: (_, e) => {
            // Should receive { user: { name: 'David' } } as event data
            return e.data.user.name === 'David';
          }
        }
      }
    },
    waitingInvokeMachine: {
      invoke: {
        src: fetchMachine.withContext({ userId: '55' }),
        onDone: 'received'
      }
    },
    received: {
      type: 'final'
    }
  }
});

const intervalMachine = Machine<{
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
        src: (ctx) => (cb) => {
          const ivl = setInterval(() => {
            cb('INC');
          }, ctx.interval);

          return () => clearInterval(ivl);
        }
      },
      always: {
        target: 'finished',
        cond: (ctx) => ctx.count === 3
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
    const childMachine = Machine({
      id: 'child',
      initial: 'init',
      states: {
        init: {
          entry: [sendParent('INC'), sendParent('INC')]
        }
      }
    });

    const someParentMachine = Machine<{ count: number }>(
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
              cond: (ctx) => ctx.count === 2
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
        services: {
          child: childMachine
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
    const childMachine = Machine({
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

    const someParentMachine = Machine<{ count: number }>(
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
              cond: (ctx) => ctx.count === -3
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
        services: {
          child: childMachine
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

    const childMachine = Machine<{ count: number }>({
      id: 'child',
      context: { count: 0 },
      initial: 'counting',
      states: {
        counting: {
          on: {
            INCREMENT: [
              {
                target: 'done',
                cond: (ctx) => {
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

    const parentMachine = Machine<{ countedTo: number }>({
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
            src: childMachine,
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

    const childMachine = Machine<{ count: number }>({
      id: 'child',
      context: { count: 0 },
      initial: 'counting',
      states: {
        counting: {
          on: {
            INCREMENT: [
              {
                target: 'done',
                cond: (ctx) => {
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

    const parentMachine = Machine<{ countedTo: number }>({
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
            src: childMachine,
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

    service.send(['START']);
    service.send(['INCREMENT']);
    service.send(['INCREMENT', 'INCREMENT']);
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
    const machineInvokeMachine = Machine<
      void,
      { type: 'SUCCESS'; data: number }
    >({
      id: 'machine-invoke',
      initial: 'pending',
      states: {
        pending: {
          invoke: Machine({
            id: 'child',
            initial: 'sending',
            states: {
              sending: {
                entry: sendParent({ type: 'SUCCESS', data: 42 })
              }
            }
          }),
          on: {
            SUCCESS: {
              target: 'success',
              cond: (_, e) => {
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
    const machineInvokeMachine = Machine<
      void,
      { type: 'SUCCESS'; data: number }
    >({
      id: 'parent',
      initial: 'a',
      states: {
        a: {
          initial: 'b',
          states: {
            b: {
              invoke: Machine({
                id: 'child',
                initial: 'sending',
                states: {
                  sending: {
                    entry: sendParent({ type: 'SUCCESS', data: 42 })
                  }
                }
              })
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
          cond: (_, e) => {
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
    const childMachine = Machine({
      id: 'child',
      initial: 'init',
      states: {
        init: {}
      }
    });

    const someParentMachine = Machine(
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
        services: {
          child: childMachine
        }
      }
    );

    interpret(
      someParentMachine.withConfig({
        services: {
          child: Machine({
            id: 'child',
            initial: 'init',
            states: {
              init: {
                entry: [sendParent('STOP')]
              }
            }
          })
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

    const startMachine = Machine({
      id: 'start',
      initial: 'active',
      context: { foo: true },
      states: {
        active: {
          invoke: {
            src: () => () => {
              startCount++;
            }
          }
        }
      }
    });

    const startService = interpret(startMachine.withContext({ foo: false }));

    startService.start();

    expect(startCount).toEqual(1);
  });

  describe('parent to child', () => {
    const subMachine = Machine({
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
      const mainMachine = Machine({
        id: 'parent',
        initial: 'one',
        invoke: {
          id: 'foo-child',
          src: subMachine
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

      const mainMachine = Machine<MainMachineCtx>({
        id: 'parent',
        initial: 'one',
        context: {
          machine: subMachine
        },
        invoke: {
          id: 'foo-child',
          src: (ctx) => ctx.machine
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
      const mainMachine = Machine({
        id: 'parent',
        initial: 'one',
        states: {
          one: {
            invoke: {
              id: 'foo-child',
              src: subMachine
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
      const doneSubMachine = Machine({
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

      const mainMachine = Machine({
        id: 'parent',
        initial: 'one',
        states: {
          one: {
            invoke: {
              id: 'foo-child',
              src: doneSubMachine,
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
      const pongMachine = Machine({
        id: 'pong',
        initial: 'active',
        states: {
          active: {
            type: 'final',
            data: { secret: 'pingpong' }
          }
        }
      });

      const pingMachine = Machine({
        id: 'ping',
        type: 'parallel',
        states: {
          one: {
            initial: 'active',
            states: {
              active: {
                invoke: {
                  id: 'pong',
                  src: pongMachine,
                  onDone: {
                    target: 'success',
                    cond: (_, e) => e.data.secret === 'pingpong'
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
          src: () => () => {
            invokeCount++;

            return () => {
              invokeDisposeCount++;
            };
          }
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
      const invokePromiseMachine = Machine({
        id: 'invokePromise',
        initial: 'pending',
        context: {
          id: 42,
          succeed: true
        },
        states: {
          pending: {
            invoke: {
              src: (ctx) =>
                createPromise((resolve) => {
                  if (ctx.succeed) {
                    resolve(ctx.id);
                  } else {
                    throw new Error(`failed on purpose for: ${ctx.id}`);
                  }
                }),
              onDone: {
                target: 'success',
                cond: (ctx, e) => {
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

      it('should be invoked with a promise factory and ignore unhandled onError target', (done) => {
        const doneSpy = jest.fn();
        const stopSpy = jest.fn();

        const promiseMachine = Machine({
          id: 'invokePromise',
          initial: 'pending',
          states: {
            pending: {
              invoke: {
                src: () =>
                  createPromise(() => {
                    throw new Error('test');
                  }),
                onDone: 'success'
              }
            },
            success: {
              type: 'final'
            }
          }
        });

        interpret(promiseMachine).onDone(doneSpy).onStop(stopSpy).start();

        // assumes that error was ignored before the timeout is processed
        setTimeout(() => {
          expect(doneSpy).not.toHaveBeenCalled();
          expect(stopSpy).not.toHaveBeenCalled();
          done();
        }, 10);
      });

      // tslint:disable-next-line:max-line-length
      it('should be invoked with a promise factory and stop on unhandled onError target when on strict mode', (done) => {
        const doneSpy = jest.fn();

        const promiseMachine = Machine({
          id: 'invokePromise',
          initial: 'pending',
          strict: true,
          states: {
            pending: {
              invoke: {
                src: () =>
                  createPromise(() => {
                    throw new Error('test');
                  }),
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
            expect((err as Error).message).toBe('test');
          })
          .onStop(() => {
            expect(doneSpy).not.toHaveBeenCalled();
            done();
          })
          .start();
      });

      it('should be invoked with a promise factory and resolve through onDone for compound state nodes', (done) => {
        const promiseMachine = Machine({
          id: 'promise',
          initial: 'parent',
          states: {
            parent: {
              initial: 'pending',
              states: {
                pending: {
                  invoke: {
                    src: () => createPromise((resolve) => resolve()),
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
        const promiseMachine = Machine(
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
            services: {
              somePromise: () => createPromise((resolve) => resolve())
            }
          }
        );

        interpret(promiseMachine)
          .onDone(() => done())
          .start();
      });

      it('should assign the resolved data when invoked with a promise factory', (done) => {
        const promiseMachine = Machine<{ count: number }>({
          id: 'promise',
          context: { count: 0 },
          initial: 'pending',
          states: {
            pending: {
              invoke: {
                src: () => createPromise((resolve) => resolve({ count: 1 })),
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
        const promiseMachine = Machine<{ count: number }>(
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
            services: {
              somePromise: () =>
                createPromise((resolve) => resolve({ count: 1 }))
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

        const promiseMachine = Machine({
          id: 'promise',
          context: { count: 0 },
          initial: 'pending',
          states: {
            pending: {
              invoke: {
                src: () => createPromise((resolve) => resolve({ count: 1 })),
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

        const promiseMachine = Machine(
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
            services: {
              somePromise: () =>
                createPromise((resolve) => resolve({ count: 1 }))
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
        const promiseMachine = Machine<{ foo: boolean }, BeginEvent>(
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
            services: {
              somePromise: (ctx, e: BeginEvent) => {
                return createPromise((resolve, reject) => {
                  ctx.foo && e.payload ? resolve() : reject();
                });
              }
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
      const callbackMachine = Machine<
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
                  cond: (_, e) => e.data === 42
                }
              }
            },
            last: {
              type: 'final'
            }
          }
        },
        {
          services: {
            someCallback: (ctx, e) => (cb: (ev: CallbackEvent) => void) => {
              if (ctx.foo && 'payload' in e) {
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
      const callbackMachine = Machine(
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
          services: {
            someCallback: () => (cb) => {
              cb('CALLBACK');
            }
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
      const callbackMachine = Machine(
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
          services: {
            someCallback: () => (cb) => {
              cb('CALLBACK');
            }
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
      const callbackMachine = Machine(
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
          services: {
            someCallback: () => (cb) => {
              cb('CALLBACK');
            }
          }
        }
      );

      const expectedStateValues = ['pending', 'second', 'third'];
      const stateValues: StateValue[] = [];
      interpret(callbackMachine)
        .onTransition((current) => stateValues.push(current.value))
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
      const pingPongMachine = Machine({
        id: 'ping-pong',
        initial: 'active',
        states: {
          active: {
            invoke: {
              id: 'child',
              src: () => (callback, onReceive) => {
                onReceive((e) => {
                  if (e.type === 'PING') {
                    callback('PONG');
                  }
                });
              }
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
      const errorMachine = Machine({
        id: 'error',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: () => () => {
                throw new Error('test');
              },
              onError: {
                target: 'failed',
                cond: (_, e) => {
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
      const errorMachine = Machine({
        id: 'error',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: () => () => {
                throw new Error('test');
              },
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
      const errorMachine = Machine({
        id: 'asyncError',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: () => async () => {
                await true;
                throw new Error('test');
              },
              onError: {
                target: 'failed',
                cond: (_, e) => {
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

      const asyncWithDoneMachine = Machine<{ result?: any }>({
        id: 'async',
        initial: 'fetch',
        context: { result: undefined },
        states: {
          fetch: {
            invoke: {
              src: () => async () => {
                await true;
                return 42;
              },
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

      const errorMachine = Machine({
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
                  src: () => () => {
                    throw new Error('test');
                  },
                  onError: {
                    target: 'failed',
                    cond: () => {
                      errorHandlersCalled++;
                      return false;
                    }
                  }
                }
              },
              second: {
                invoke: {
                  src: () => () => {
                    // empty
                  },
                  onError: {
                    target: 'failed',
                    cond: () => {
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

      expect(typeof waitingState.actions[0].activity!.src).toBe('string');
    });

    it('should throw error if unhandled (sync)', () => {
      const errorMachine = Machine({
        id: 'asyncError',
        initial: 'safe',
        states: {
          safe: {
            invoke: {
              src: () => () => {
                throw new Error('test');
              }
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

    it('should stop machine if unhandled error and on strict mode (async)', (done) => {
      const errorMachine = Machine({
        id: 'asyncError',
        initial: 'safe',
        // if not in strict mode we have no way to know if there
        // was an error with processing rejected promise
        strict: true,
        states: {
          safe: {
            invoke: {
              src: () => async () => {
                await true;
                throw new Error('test');
              }
            }
          },
          failed: {
            type: 'final'
          }
        }
      });

      interpret(errorMachine)
        .onError((err) => {
          expect((err as Error).message).toContain('test');
        })
        .onStop(() => done())
        .start();
    });

    it('should ignore error if unhandled error and not on strict mode (async)', (done) => {
      const doneSpy = jest.fn();
      const stopSpy = jest.fn();

      const errorMachine = Machine({
        id: 'asyncError',
        initial: 'safe',
        // if not in strict mode we have no way to know if there
        // was an error with processing rejected promise
        strict: false,
        states: {
          safe: {
            invoke: {
              src: () => async () => {
                await true;
                throw new Error('test');
              }
            }
          },
          failed: {
            type: 'final'
          }
        }
      });

      interpret(errorMachine).onDone(doneSpy).onStop(stopSpy).start();

      // assumes that error was ignored before the timeout is processed
      setTimeout(() => {
        expect(doneSpy).not.toHaveBeenCalled();
        expect(stopSpy).not.toHaveBeenCalled();
        done();
      }, 20);
    });

    describe('sub invoke race condition', () => {
      const anotherChildMachine = Machine({
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

      const anotherParentMachine = Machine({
        id: 'parent',
        initial: 'begin',
        states: {
          begin: {
            invoke: {
              src: anotherChildMachine,
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
          })
          .onEvent((e) => {
            events.push(e);
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
      const obsMachine = Machine<{ count: number | undefined }, Events>({
        id: 'obs',
        initial: 'counting',
        context: { count: undefined },
        states: {
          counting: {
            invoke: {
              src: () =>
                infinite$.pipe(
                  map((value) => {
                    return { type: 'COUNT', value };
                  })
                )
            },
            always: {
              target: 'counted',
              cond: (ctx) => ctx.count === 5
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
      const obsMachine = Machine<Ctx, Events>({
        id: 'obs',
        initial: 'counting',
        context: {
          count: undefined
        },
        states: {
          counting: {
            invoke: {
              src: () =>
                infinite$.pipe(
                  take(5),
                  map((value) => {
                    return {
                      type: 'COUNT',
                      value
                    };
                  })
                ),
              onDone: {
                target: 'counted',
                cond: (ctx) => ctx.count === 4
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
      const obsMachine = Machine<Ctx, Events>({
        id: 'obs',
        initial: 'counting',
        context: { count: undefined },
        states: {
          counting: {
            invoke: {
              src: () =>
                infinite$.pipe(
                  map((value) => {
                    if (value === 5) {
                      throw new Error('some error');
                    }

                    return { type: 'COUNT', value };
                  })
                ),
              onError: {
                target: 'success',
                cond: (ctx, e) => {
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

  describe('nested invoked machine', () => {
    const pongMachine = Machine({
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
    const pingMachine = Machine({
      id: 'ping',
      initial: 'innerMachine',
      states: {
        innerMachine: {
          initial: 'active',
          states: {
            active: {
              invoke: {
                id: 'pong',
                src: pongMachine
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
  });

  describe('multiple simultaneous services', () => {
    const multiple = Machine<any>({
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
                  src: () => (cb) => cb('ONE')
                },
                {
                  id: 'child2',
                  src: () => (cb) => cb('TWO')
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

    const parallel = Machine<any>({
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
              type: 'parallel',
              states: {
                a: {
                  invoke: {
                    id: 'child',
                    src: () => (cb) => cb('ONE')
                  }
                },
                b: {
                  invoke: {
                    id: 'child2',
                    src: () => (cb) => cb('TWO')
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

    it('should not invoke a service if it gets stopped immediately by transitioning away in microstep', (done) => {
      // Since an invocation will be canceled when the state machine leaves the
      // invoking state, it does not make sense to start an invocation in a state
      // that will be exited immediately
      let serviceCalled = false;
      const transientMachine = Machine({
        id: 'transient',
        initial: 'active',
        states: {
          active: {
            invoke: {
              id: 'doNotInvoke',
              src: () => async () => {
                serviceCalled = true;
              }
            },
            always: 'inactive'
          },
          inactive: {
            after: { 10: 'complete' }
          },
          complete: {
            type: 'final'
          }
        }
      });

      const service = interpret(transientMachine);

      service
        .onDone(() => {
          expect(serviceCalled).toBe(false);
          done();
        })
        .start();
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
                      src: () => () => {
                        /* ... */
                      }
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
                      src: () => Promise.resolve(42),
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
  });

  describe('error handling', () => {
    it('handles escalated errors', (done) => {
      const child = Machine({
        initial: 'die',

        states: {
          die: {
            entry: escalate('oops')
          }
        }
      });

      const parent = Machine({
        initial: 'one',

        states: {
          one: {
            invoke: {
              id: 'child',
              src: child,
              onError: {
                target: 'two',
                cond: (_, event) => event.data === 'oops'
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

      const child = Machine<ChildContext>({
        initial: 'die',
        context: { id: 42 },
        states: {
          die: {
            entry: escalate((ctx) => ctx.id)
          }
        }
      });

      const parent = Machine({
        initial: 'one',

        states: {
          one: {
            invoke: {
              id: 'child',
              src: child,
              onError: {
                target: 'two',
                cond: (_, event) => {
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
        services: {
          search: async (_, __, meta) => {
            expect(meta.src.endpoint).toEqual('example.com');

            return await 42;
          }
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
        services: {
          stringService: (ctx, _, { data }) => {
            expect(ctx).toEqual({ count: 42 });

            expect(data).toEqual({ newCount: 84, staticVal: 'hello' });

            return new Promise<void>((res) => {
              res();
            });
          }
        }
      }
    );

    const service = interpret(machine).onDone(() => {
      done();
    });

    service.start();
  });

  it('should capture invoke errors', (done) => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: {}
      },
      invoke: {
        src: () => {
          throw new Error('test');
        }
      }
    });

    const service = interpret(machine).onError((err) => {
      expect((err as Error).message).toBe('test');
      done();
    });

    service.start();
  });
});
