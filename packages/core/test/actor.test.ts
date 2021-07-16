import {
  interpret,
  createMachine,
  ActorRef,
  ActorRefFrom,
  spawn,
  spawnMachine,
  spawnCallback,
  spawnObservable,
  spawnPromise,
  EventObject,
  Behavior
} from '../src';
import {
  assign,
  send,
  sendParent,
  raise,
  doneInvoke,
  sendUpdate,
  respond,
  forwardTo,
  error
} from '../src/actions';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';
import * as actionTypes from '../src/actionTypes';
import { createMachineBehavior, fromReducer } from '../src/behaviors';
import { invokeMachine } from '../src/invoke';

describe('spawning machines', () => {
  const todoMachine = createMachine({
    id: 'todo',
    initial: 'incomplete',
    states: {
      incomplete: {
        on: { SET_COMPLETE: 'complete' }
      },
      complete: {
        entry: sendParent({ type: 'TODO_COMPLETED' })
      }
    }
  });

  const context = {
    todoRefs: {} as Record<string, ActorRef<any>>
  };

  type TodoEvent =
    | {
        type: 'ADD';
        id: number;
      }
    | {
        type: 'SET_COMPLETE';
        id: number;
      }
    | {
        type: 'TODO_COMPLETED';
      };

  const todosMachine = createMachine<typeof context, TodoEvent>({
    id: 'todos',
    context: context,
    initial: 'active',
    states: {
      active: {
        on: {
          TODO_COMPLETED: 'success'
        }
      },
      success: {
        type: 'final'
      }
    },
    on: {
      ADD: {
        actions: assign({
          todoRefs: (ctx, e) => ({
            ...ctx.todoRefs,
            [e.id]: spawnMachine(todoMachine)
          })
        })
      },
      SET_COMPLETE: {
        actions: send('SET_COMPLETE', {
          to: (ctx, e: Extract<TodoEvent, { type: 'SET_COMPLETE' }>) => {
            return ctx.todoRefs[e.id];
          }
        })
      }
    }
  });

  // Adaptation: https://github.com/p-org/P/wiki/PingPong-program
  type PingPongEvent =
    | { type: 'PING' }
    | { type: 'PONG' }
    | { type: 'SUCCESS' };

  const serverMachine = createMachine<any, PingPongEvent>({
    id: 'server',
    initial: 'waitPing',
    states: {
      waitPing: {
        on: {
          PING: 'sendPong'
        }
      },
      sendPong: {
        entry: [sendParent('PONG'), raise('SUCCESS')],
        on: {
          SUCCESS: 'waitPing'
        }
      }
    }
  });

  interface ClientContext {
    server?: ActorRef<PingPongEvent>;
  }

  const clientMachine = createMachine<ClientContext, PingPongEvent>({
    id: 'client',
    initial: 'init',
    context: {
      server: undefined
    },
    states: {
      init: {
        entry: [
          assign({
            server: (_, __) => spawnMachine(serverMachine)
          }),
          raise('SUCCESS')
        ],
        on: {
          SUCCESS: 'sendPing'
        }
      },
      sendPing: {
        entry: [send('PING', { to: (ctx) => ctx.server! }), raise('SUCCESS')],
        on: {
          SUCCESS: 'waitPong'
        }
      },
      waitPong: {
        on: {
          PONG: 'complete'
        }
      },
      complete: {
        type: 'final'
      }
    }
  });

  it('should invoke actors', (done) => {
    const service = interpret(todosMachine)
      .onDone(() => {
        done();
      })
      .start();

    service.send({ type: 'ADD', id: 42 });
    service.send({ type: 'SET_COMPLETE', id: 42 });
  });

  it('should invoke actors (when sending batch)', (done) => {
    const service = interpret(todosMachine)
      .onDone(() => {
        done();
      })
      .start();

    service.batch([{ type: 'ADD', id: 42 }]);
    service.send({ type: 'SET_COMPLETE', id: 42 });
  });

  it('should allow bidirectional communication between parent/child actors', (done) => {
    interpret(clientMachine)
      .onDone(() => {
        done();
      })
      .start();
  });
});

describe('spawning promises', () => {
  it('should be able to spawn a promise', (done) => {
    const promiseMachine = createMachine<{ promiseRef?: ActorRef<any> }>({
      id: 'promise',
      initial: 'idle',
      context: {
        promiseRef: undefined
      },
      states: {
        idle: {
          entry: assign({
            promiseRef: () => {
              const ref = spawnPromise(
                () =>
                  new Promise((res) => {
                    res('response');
                  }),
                'my-promise'
              );

              return ref;
            }
          }),
          on: {
            [doneInvoke('my-promise')]: {
              target: 'success',
              guard: (_, e) => e.data === 'response'
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const promiseService = interpret(promiseMachine).onDone(() => {
      done();
    });

    promiseService.start();
  });
});

describe('spawning callbacks', () => {
  it('should be able to spawn an actor from a callback', (done) => {
    const callbackMachine = createMachine<{ callbackRef?: ActorRef<any> }>({
      id: 'callback',
      initial: 'idle',
      context: {
        callbackRef: undefined
      },
      states: {
        idle: {
          entry: assign({
            callbackRef: () =>
              spawnCallback((cb, receive) => {
                receive((event) => {
                  if (event.type === 'START') {
                    setTimeout(() => {
                      cb({ type: 'SEND_BACK' });
                    }, 10);
                  }
                });
              })
          }),
          on: {
            START_CB: {
              actions: send('START', { to: (ctx) => ctx.callbackRef })
            },
            SEND_BACK: 'success'
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const callbackService = interpret(callbackMachine).onDone(() => {
      done();
    });

    callbackService.start();
    callbackService.send('START_CB');
  });
});

describe('spawning observables', () => {
  it('should be able to spawn an observable', (done) => {
    interface Events {
      type: 'INT';
      value: number;
    }

    const observableMachine = createMachine<any, Events>({
      id: 'observable',
      initial: 'idle',
      context: {
        observableRef: undefined
      },
      states: {
        idle: {
          entry: assign({
            observableRef: () => {
              const ref = spawnObservable(() =>
                interval(10).pipe(
                  map((n) => ({
                    type: 'INT',
                    value: n
                  }))
                )
              );

              return ref;
            }
          }),
          on: {
            INT: {
              target: 'success',
              guard: (_, e) => e.value === 5
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const observableService = interpret(observableMachine).onDone(() => {
      done();
    });

    observableService.start();
  });
});

describe('communicating with spawned actors', () => {
  it('should treat an interpreter as an actor', (done) => {
    const existingMachine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: { ACTIVATE: 'active' }
        },
        active: {
          entry: respond('EXISTING.DONE')
        }
      }
    });

    const existingService = interpret(existingMachine).start();

    const parentMachine = createMachine<{
      existingRef?: ActorRef<any>;
    }>({
      initial: 'pending',
      context: {
        existingRef: undefined
      },
      states: {
        pending: {
          entry: assign({
            // No need to spawn an existing service:
            // existingRef: () => spawn(existingService)
            existingRef: existingService.ref
          }),
          on: {
            'EXISTING.DONE': 'success'
          },
          after: {
            100: {
              actions: send('ACTIVATE', { to: (ctx) => ctx.existingRef })
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const parentService = interpret(parentMachine).onDone(() => {
      done();
    });

    parentService.start();
  });

  it.skip('should be able to name existing actors', (done) => {
    const existingMachine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: { ACTIVATE: 'active' }
        },
        active: {
          entry: respond('EXISTING.DONE')
        }
      }
    });

    const existingService = interpret(existingMachine).start();

    const parentMachine = createMachine<{
      existingRef: ActorRef<any> | undefined;
    }>({
      initial: 'pending',
      context: {
        existingRef: undefined
      },
      states: {
        pending: {
          entry: assign({
            // TODO: fix (spawn existing service)
            // @ts-ignore
            existingRef: () => spawn(existingService, 'existing')
          }),
          on: {
            'EXISTING.DONE': 'success'
          },
          after: {
            100: {
              actions: send('ACTIVATE', { to: 'existing' })
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const parentService = interpret(parentMachine).onDone(() => {
      done();
    });

    parentService.start();
  });

  it('should be able to communicate with arbitrary actors if sessionId is known', (done) => {
    const existingMachine = createMachine({
      initial: 'inactive',
      states: {
        inactive: {
          on: { ACTIVATE: 'active' }
        },
        active: {
          entry: respond('EXISTING.DONE')
        }
      }
    });

    const existingService = interpret(existingMachine).start();

    const parentMachine = createMachine<{ existingRef: ActorRef<any> }>({
      initial: 'pending',
      context: {
        existingRef: existingService
      },
      states: {
        pending: {
          entry: send('ACTIVATE', { to: () => existingService }),
          on: {
            'EXISTING.DONE': 'success'
          },
          after: {
            100: {
              actions: send('ACTIVATE', { to: (ctx) => ctx.existingRef })
            }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const parentService = interpret(parentMachine).onDone(() => {
      done();
    });

    parentService.start();
  });
});

describe('actors', () => {
  it('should only spawn actors defined on initial state once', () => {
    let count = 0;

    const startMachine = createMachine<{
      items: number[];
      refs: any[];
    }>({
      id: 'start',
      initial: 'start',
      context: {
        items: [0, 1, 2, 3],
        refs: []
      },
      states: {
        start: {
          entry: assign({
            refs: (ctx) => {
              count++;
              const c = ctx.items.map((item) =>
                spawnPromise(() => new Promise((res) => res(item)))
              );

              return c;
            }
          })
        }
      }
    });

    interpret(startMachine)
      .onTransition(() => {
        expect(count).toEqual(1);
      })
      .start();
  });

  it('should spawn null actors if not used within a service', () => {
    const nullActorMachine = createMachine<{ ref?: ActorRef<any> }>({
      initial: 'foo',
      context: { ref: undefined },
      states: {
        foo: {
          entry: assign({
            ref: () => spawnPromise(() => Promise.resolve(42))
          })
        }
      }
    });

    const { initialState } = nullActorMachine;

    // expect(initialState.context.ref!.id).toBe('null'); // TODO: identify null actors
    expect(initialState.context.ref!.send).toBeDefined();
  });

  describe('autoForward option', () => {
    const pongActorMachine = createMachine({
      id: 'server',
      initial: 'waitPing',
      states: {
        waitPing: {
          on: {
            PING: 'sendPong'
          }
        },
        sendPong: {
          entry: [sendParent('PONG'), raise('SUCCESS')],
          on: {
            SUCCESS: 'waitPing'
          }
        }
      }
    });

    it('should not forward events to a spawned actor by default', () => {
      let pongCounter = 0;

      const machine = createMachine<any>({
        id: 'client',
        context: { counter: 0, serverRef: undefined },
        initial: 'initial',
        states: {
          initial: {
            entry: assign(() => ({
              serverRef: spawnMachine(pongActorMachine)
            })),
            on: {
              PONG: {
                actions: () => ++pongCounter
              }
            }
          }
        }
      });
      const service = interpret(machine);
      service.start();
      service.send('PING');
      service.send('PING');
      expect(pongCounter).toEqual(0);
    });

    it('should not forward events to a spawned actor when { autoForward: false }', () => {
      let pongCounter = 0;

      const machine = createMachine<{
        counter: number;
        serverRef?: ActorRef<any>;
      }>({
        id: 'client',
        context: { counter: 0, serverRef: undefined },
        initial: 'initial',
        states: {
          initial: {
            entry: assign((ctx) => ({
              ...ctx,
              serverRef: spawn(
                createMachineBehavior(pongActorMachine, {
                  autoForward: false
                })
              )
            })),
            on: {
              PONG: {
                actions: () => ++pongCounter
              }
            }
          }
        }
      });
      const service = interpret(machine);
      service.start();
      service.send('PING');
      service.send('PING');
      expect(pongCounter).toEqual(0);
    });
  });

  describe('sync option', () => {
    const childMachine = createMachine({
      id: 'child',
      context: { value: 0 },
      initial: 'active',
      states: {
        active: {
          after: {
            10: { actions: assign({ value: 42 }), internal: true }
          }
        }
      }
    });

    it('should sync spawned actor state when { sync: true }', (done) => {
      const machine = createMachine<{
        ref?: ActorRef<any>;
      }>({
        id: 'parent',
        context: {
          ref: undefined
        },
        initial: 'foo',
        states: {
          foo: {
            entry: assign({
              ref: () =>
                spawn(createMachineBehavior(childMachine, { sync: true }))
            }),
            on: {
              [actionTypes.update]: 'success'
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      const service = interpret(machine, {
        id: 'a-service'
      }).onDone(() => {
        done();
      });
      service.start();
    });

    it('should not sync spawned actor state when { sync: false }', (done) => {
      const machine = createMachine<{
        refNoSync?: ActorRef<any>;
      }>({
        id: 'parent',
        context: {
          refNoSync: undefined
        },
        initial: 'foo',
        states: {
          foo: {
            entry: assign({
              refNoSync: () =>
                spawn(createMachineBehavior(childMachine, { sync: false }))
            }),
            on: {
              '*': 'failure'
            }
          },
          failure: {
            type: 'final'
          }
        }
      });

      const service = interpret(machine, {
        id: 'b-service'
      }).onDone(() => {
        throw new Error('value change caused transition');
      });
      service.start();

      setTimeout(() => {
        done();
      }, 30);
    });

    it('should not sync spawned actor state (default)', (done) => {
      const machine = createMachine<{
        refNoSyncDefault?: ActorRef<any>;
      }>({
        id: 'parent',
        context: {
          refNoSyncDefault: undefined
        },
        initial: 'foo',
        states: {
          foo: {
            entry: assign({
              refNoSyncDefault: () => spawn(createMachineBehavior(childMachine))
            }),
            on: {
              '*': 'failure'
            }
          },
          failure: {
            type: 'final'
          }
        }
      });

      const service = interpret(machine, {
        id: 'b-service'
      }).onDone(() => {
        throw new Error('value change caused transition');
      });
      service.start();

      setTimeout(() => {
        done();
      }, 30);
    });

    it('parent state should be changed if synced child actor update occurs', (done) => {
      const syncChildMachine = createMachine({
        initial: 'active',
        states: {
          active: {
            after: { 500: 'inactive' }
          },
          inactive: {}
        }
      });

      interface SyncMachineContext {
        ref?: ActorRefFrom<typeof syncChildMachine>;
      }

      const syncMachine = createMachine<SyncMachineContext>({
        initial: 'same',
        context: {},
        states: {
          same: {
            entry: assign<SyncMachineContext>({
              ref: () => {
                return spawn(
                  createMachineBehavior(syncChildMachine, { sync: true })
                );
              }
            }),
            on: {
              [actionTypes.update]: 'success'
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      interpret(syncMachine)
        .onDone(() => {
          done();
        })
        .start();
    });

    const falseSyncOptions = [{}, { sync: false }];

    falseSyncOptions.forEach((falseSyncOption) => {
      it(`parent state should NOT be changed regardless of unsynced child actor update (options: ${JSON.stringify(
        falseSyncOption
      )})`, (done) => {
        const syncChildMachine = createMachine({
          initial: 'active',
          states: {
            active: {
              after: { 10: 'inactive' }
            },
            inactive: {}
          }
        });

        interface SyncMachineContext {
          ref?: ActorRefFrom<typeof syncChildMachine>;
        }

        const syncMachine = createMachine<SyncMachineContext>({
          initial: 'same',
          context: {},
          states: {
            same: {
              entry: assign({
                ref: () =>
                  spawn(
                    createMachineBehavior(syncChildMachine, falseSyncOption)
                  )
              }),
              on: {
                '*': 'failure'
              }
            },
            failure: {}
          }
        });

        interpret(syncMachine)
          .onDone(() => {
            done();
          })
          .onTransition((state) => {
            expect(state.matches('failure')).toBeFalsy();
          })
          .start();

        setTimeout(() => {
          done();
        }, 20);
      });

      it(`parent state should be changed if unsynced child actor manually sends update event (options: ${JSON.stringify(
        falseSyncOption
      )})`, (done) => {
        const syncChildMachine = createMachine({
          initial: 'active',
          states: {
            active: {
              after: { 10: 'inactive' }
            },
            inactive: {
              entry: sendUpdate()
            }
          }
        });

        interface SyncMachineContext {
          ref?: ActorRefFrom<typeof syncChildMachine>;
        }

        const syncMachine = createMachine<SyncMachineContext>({
          initial: 'same',
          context: {},
          states: {
            same: {
              entry: assign({
                ref: () =>
                  spawn(
                    createMachineBehavior(syncChildMachine, falseSyncOption)
                  )
              })
            }
          }
        });

        interpret(syncMachine)
          .onTransition((state) => {
            if (state.event.type === actionTypes.update) {
              expect(state.changed).toBe(true);
              done();
            }
          })
          .start();
      });

      it('should only spawn an actor in an initial state of a child that gets invoked in the initial state of a parent when the parent gets started', (done) => {
        let spawnCounter = 0;

        const child = createMachine<any>({
          initial: 'bar',
          context: {},
          states: {
            bar: {
              entry: assign({
                promise: () => {
                  return spawnPromise(() => {
                    spawnCounter++;
                    return Promise.resolve('answer');
                  });
                }
              })
            }
          }
        });

        const parent = createMachine({
          initial: 'foo',
          states: {
            foo: {
              invoke: {
                src: invokeMachine(child),
                onDone: 'end'
              }
            },
            end: { type: 'final' }
          }
        });
        interpret(parent)
          .onTransition(() => {
            if (spawnCounter === 1) {
              done();
            }
          })
          .start();
      });
    });
  });

  describe('with behaviors', () => {
    it('should work with a reducer behavior', (done) => {
      const countBehavior = fromReducer((count: number, event: any) => {
        if (event.type === 'INC') {
          return count + 1;
        } else if (event.type === 'DEC') {
          return count - 1;
        }
        return count;
      }, 0);

      const countMachine = createMachine<{
        count: ActorRefFrom<typeof countBehavior> | undefined;
      }>({
        context: {
          count: undefined
        },
        entry: assign({
          count: () => spawn(countBehavior)
        }),
        on: {
          INC: {
            actions: forwardTo((ctx) => ctx.count!)
          }
        }
      });

      const countService = interpret(countMachine)
        .onTransition((state) => {
          if (state.context.count?.getSnapshot() === 2) {
            done();
          }
        })
        .start();

      countService.send('INC');
      countService.send('INC');
    });

    it('should work with a promise behavior (fulfill)', (done) => {
      const countMachine = createMachine<{
        count: ActorRefFrom<Promise<number>> | undefined;
      }>({
        context: {
          count: undefined
        },
        entry: assign({
          count: () =>
            spawnPromise(
              () =>
                new Promise<number>((res) => {
                  setTimeout(res(42));
                }),
              'test'
            )
        }),
        initial: 'pending',
        states: {
          pending: {
            on: {
              'done.invoke.test': {
                target: 'success',
                guard: (_, e) => e.data === 42
              }
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      const countService = interpret(countMachine).onDone(() => {
        done();
      });
      countService.start();
    });

    it('should work with a promise behavior (reject)', (done) => {
      const errorMessage = 'An error occurred';
      const countMachine = createMachine<{
        count: ActorRefFrom<Promise<number>>;
      }>({
        context: () => ({
          count: spawnPromise(
            () =>
              new Promise<number>((_, rej) => {
                setTimeout(rej(errorMessage), 1000);
              }),
            'test'
          )
        }),
        initial: 'pending',
        states: {
          pending: {
            on: {
              [error('test')]: {
                target: 'success',
                guard: (_, e) => {
                  return e.data === errorMessage;
                }
              }
            }
          },
          success: {
            type: 'final'
          }
        }
      });

      const countService = interpret(countMachine).onDone(() => {
        done();
      });
      countService.start();
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

      const pingMachine = createMachine<{
        ponger: ActorRefFrom<typeof pongBehavior> | undefined;
      }>({
        initial: 'waiting',
        context: {
          ponger: undefined
        },
        entry: assign({
          ponger: () => spawn(pongBehavior)
        }),
        states: {
          waiting: {
            entry: send('PING', { to: (ctx) => ctx.ponger! }),
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

  it('should be able to spawn actors in (lazy) initial context', (done) => {
    const machine = createMachine<{ ref: ActorRef<any> }>({
      context: () => ({
        ref: spawnCallback((sendBack) => {
          sendBack({ type: 'TEST' });
        })
      }),
      initial: 'waiting',
      states: {
        waiting: {
          on: { TEST: 'success' }
        },
        success: {
          type: 'final'
        }
      }
    });

    interpret(machine)
      .onDone(() => {
        done();
      })
      .start();
  });
});
