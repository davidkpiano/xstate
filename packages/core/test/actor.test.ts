import {
  Machine,
  spawn,
  interpret,
  ActorRef,
  ActorRefFrom,
  createMachine
} from '../src';
import {
  assign,
  send,
  sendParent,
  raise,
  doneInvoke,
  sendUpdate,
  respond,
  forwardTo
} from '../src/actions';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

describe('spawning machines', () => {
  const todoMachine = Machine({
    id: 'todo',
    initial: 'incomplete',
    states: {
      incomplete: {
        on: { SET_COMPLETE: 'complete' }
      },
      complete: {
        onEntry: sendParent({ type: 'TODO_COMPLETED' })
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

  const todosMachine = Machine<any, TodoEvent>({
    id: 'todos',
    context,
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
            [e.id]: spawn(todoMachine)
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

  const serverMachine = Machine<any, PingPongEvent>({
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

  const clientMachine = Machine<ClientContext, PingPongEvent>({
    id: 'client',
    initial: 'init',
    context: {
      server: undefined
    },
    states: {
      init: {
        entry: [
          assign({
            server: () => spawn(serverMachine)
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

    service.send('ADD', { id: 42 });
    service.send('SET_COMPLETE', { id: 42 });
  });

  it('should invoke actors (when sending batch)', (done) => {
    const service = interpret(todosMachine)
      .onDone(() => {
        done();
      })
      .start();

    service.send([{ type: 'ADD', id: 42 }]);
    service.send('SET_COMPLETE', { id: 42 });
  });

  it('should invoke a null actor if spawned outside of a service', () => {
    expect(spawn(todoMachine)).toBeTruthy();
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
  const promiseMachine = Machine<any>({
    id: 'promise',
    initial: 'idle',
    context: {
      promiseRef: undefined
    },
    states: {
      idle: {
        entry: assign({
          promiseRef: () => {
            const ref = spawn(
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
            cond: (_, e) => e.data === 'response'
          }
        }
      },
      success: {
        type: 'final'
      }
    }
  });

  it('should be able to spawn a promise', (done) => {
    const promiseService = interpret(promiseMachine).onDone(() => {
      done();
    });

    promiseService.start();
  });
});

describe('spawning callbacks', () => {
  const callbackMachine = Machine<any>({
    id: 'callback',
    initial: 'idle',
    context: {
      callbackRef: undefined
    },
    states: {
      idle: {
        entry: assign({
          callbackRef: () =>
            spawn((cb, receive) => {
              receive((event) => {
                if (event.type === 'START') {
                  setTimeout(() => {
                    cb('SEND_BACK');
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

  it('should be able to spawn an actor from a callback', (done) => {
    const callbackService = interpret(callbackMachine).onDone(() => {
      done();
    });

    callbackService.start();
    callbackService.send('START_CB');
  });
});

describe('spawning observables', () => {
  interface Events {
    type: 'INT';
    value: number;
  }

  const observableMachine = Machine<any, Events>({
    id: 'observable',
    initial: 'idle',
    context: {
      observableRef: undefined
    },
    states: {
      idle: {
        entry: assign({
          observableRef: () => {
            const ref = spawn(
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
            cond: (_, e) => e.value === 5
          }
        }
      },
      success: {
        type: 'final'
      }
    }
  });

  it('should be able to spawn an observable', (done) => {
    const observableService = interpret(observableMachine).onDone(() => {
      done();
    });

    observableService.start();
  });
});

describe('communicating with spawned actors', () => {
  it('should treat an interpreter as an actor', (done) => {
    const existingMachine = Machine({
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

    const parentMachine = Machine<any>({
      initial: 'pending',
      context: {
        existingRef: undefined as any
      },
      states: {
        pending: {
          entry: assign({
            // No need to spawn an existing service:
            // existingRef: () => spawn(existingService)
            existingRef: existingService
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

  it('should be able to communicate with arbitrary actors if sessionId is known', (done) => {
    const existingMachine = Machine({
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

    const parentMachine = Machine<any>({
      initial: 'pending',
      states: {
        pending: {
          entry: send('ACTIVATE', { to: existingService.sessionId }),
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

    const startMachine = Machine<any>({
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
                spawn(new Promise((res) => res(item)))
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
    interface TestContext {
      ref?: ActorRef<any>;
    }

    const nullActorMachine = Machine<TestContext>({
      initial: 'foo',
      context: { ref: undefined },
      states: {
        foo: {
          entry: assign<TestContext>({
            ref: () => spawn(Promise.resolve(42))
          })
        }
      }
    });

    const { initialState } = nullActorMachine;

    // expect(initialState.context.ref!.id).toBe('null'); // TODO: identify null actors
    expect(initialState.context.ref!.send).toBeDefined();
  });

  describe('autoForward option', () => {
    const pongActorMachine = Machine({
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

      const machine = Machine<any>({
        id: 'client',
        context: { counter: 0, serverRef: undefined },
        initial: 'initial',
        states: {
          initial: {
            entry: assign(() => ({
              serverRef: spawn(pongActorMachine)
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

      const machine = Machine<{ counter: number; serverRef?: ActorRef<any> }>({
        id: 'client',
        context: { counter: 0, serverRef: undefined },
        initial: 'initial',
        states: {
          initial: {
            entry: assign((ctx) => ({
              ...ctx,
              serverRef: spawn(pongActorMachine, { autoForward: false })
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

    it('should forward events to a spawned actor when { autoForward: true }', () => {
      let pongCounter = 0;

      const machine = Machine<any>({
        id: 'client',
        context: { counter: 0, serverRef: undefined },
        initial: 'initial',
        states: {
          initial: {
            entry: assign(() => ({
              serverRef: spawn(pongActorMachine, { autoForward: true })
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
      expect(pongCounter).toEqual(2);
    });
  });

  describe('sync option', () => {
    const childMachine = Machine({
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

    interface TestContext {
      ref?: ActorRefFrom<typeof childMachine>;
      refNoSync?: ActorRefFrom<typeof childMachine>;
      refNoSyncDefault?: ActorRefFrom<typeof childMachine>;
    }

    const parentMachine = Machine<TestContext>({
      id: 'parent',
      context: {
        ref: undefined,
        refNoSync: undefined,
        refNoSyncDefault: undefined
      },
      initial: 'foo',
      states: {
        foo: {
          entry: assign<TestContext>({
            ref: () => spawn(childMachine, { sync: true }),
            refNoSync: () => spawn(childMachine, { sync: false }),
            refNoSyncDefault: () => spawn(childMachine)
          })
        },
        success: {
          type: 'final'
        }
      }
    });

    it('should sync spawned actor state when { sync: true }', () => {
      return new Promise<void>((res) => {
        const service = interpret(parentMachine, {
          id: 'a-service'
        }).onTransition((s) => {
          if (s.context.ref?.getSnapshot()?.context.value === 42) {
            res();
          }
        });
        service.start();
      });
    });

    it('should not sync spawned actor state when { sync: false }', () => {
      return new Promise<void>((res, rej) => {
        const service = interpret(parentMachine, {
          id: 'b-service'
        }).onTransition((s) => {
          if (s.context.refNoSync?.getSnapshot()?.context.value === 42) {
            rej(new Error('value change caused transition'));
          }
        });
        service.start();

        setTimeout(() => {
          expect(
            service.state.context.refNoSync?.getSnapshot()?.context.value
          ).toBe(42);
          res();
        }, 30);
      });
    });

    it('should not sync spawned actor state (default)', () => {
      return new Promise<void>((res, rej) => {
        const service = interpret(parentMachine, {
          id: 'c-service'
        }).onTransition((s) => {
          if (s.context.refNoSyncDefault?.getSnapshot()?.context.value === 42) {
            rej(new Error('value change caused transition'));
          }
        });
        service.start();

        setTimeout(() => {
          expect(
            service.state.context.refNoSyncDefault?.getSnapshot()?.context.value
          ).toBe(42);
          res();
        }, 30);
      });
    });

    it('parent state should be changed if synced child actor update occurs', (done) => {
      const syncChildMachine = Machine({
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

      const syncMachine = Machine<SyncMachineContext>({
        initial: 'same',
        context: {},
        states: {
          same: {
            entry: assign<SyncMachineContext>({
              ref: () => spawn(syncChildMachine, { sync: true })
            })
          }
        }
      });

      interpret(syncMachine)
        .onTransition((state) => {
          if (state.context.ref?.getSnapshot()?.matches('inactive')) {
            expect(state.changed).toBe(true);
            done();
          }
        })
        .start();
    });

    const falseSyncOptions = [{}, { sync: false }];

    falseSyncOptions.forEach((falseSyncOption) => {
      it(`parent state should NOT be changed regardless of unsynced child actor update (options: ${JSON.stringify(
        falseSyncOption
      )})`, (done) => {
        const syncChildMachine = Machine({
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

        const syncMachine = Machine<SyncMachineContext>({
          initial: 'same',
          context: {},
          states: {
            same: {
              entry: assign<SyncMachineContext>({
                ref: () => spawn(syncChildMachine, falseSyncOption)
              })
            }
          }
        });

        const service = interpret(syncMachine)
          .onTransition((state) => {
            if (
              state.context.ref &&
              state.context.ref.getSnapshot()?.matches('inactive')
            ) {
              expect(state.changed).toBe(false);
            }
          })
          .start();

        setTimeout(() => {
          expect(
            service.state.context.ref?.getSnapshot()?.matches('inactive')
          ).toBe(true);
          done();
        }, 20);
      });

      it(`parent state should be changed if unsynced child actor manually sends update event (options: ${JSON.stringify(
        falseSyncOption
      )})`, (done) => {
        const syncChildMachine = Machine({
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

        const syncMachine = Machine<SyncMachineContext>({
          initial: 'same',
          context: {},
          states: {
            same: {
              entry: assign<SyncMachineContext>({
                ref: () => spawn(syncChildMachine, falseSyncOption)
              })
            }
          }
        });

        interpret(syncMachine)
          .onTransition((state) => {
            if (state.context.ref?.getSnapshot()?.matches('inactive')) {
              expect(state.changed).toBe(true);
              done();
            }
          })
          .start();
      });

      it('should only spawn an actor in an initial state of a child that gets invoked in the initial state of a parent when the parent gets started', () => {
        let spawnCounter = 0;

        interface TestContext {
          promise?: ActorRefFrom<Promise<string>>;
        }

        const child = Machine<TestContext>({
          initial: 'bar',
          context: {},
          states: {
            bar: {
              entry: assign<TestContext>({
                promise: () => {
                  return spawn(() => {
                    spawnCounter++;
                    return Promise.resolve('answer');
                  });
                }
              })
            }
          }
        });

        const parent = Machine({
          initial: 'foo',
          states: {
            foo: {
              invoke: {
                src: child,
                onDone: 'end'
              }
            },
            end: { type: 'final' }
          }
        });
        interpret(parent).start();
        expect(spawnCounter).toBe(1);
      });
    });
  });
});

describe('persistence', () => {
  it('persists actor state', (done) => {
    const machine = createMachine({
      id: 'parent',
      initial: 'inactive',
      states: {
        inactive: {
          on: { NEXT: 'active' }
        },
        active: {
          invoke: {
            id: 'counter',
            src: createMachine<{ count: number }>({
              initial: 'counting',
              context: { count: 40 },
              states: {
                counting: {
                  on: {
                    INC: {
                      target: 'checking',
                      actions: assign({ count: (ctx) => ctx.count + 1 })
                    }
                  }
                },
                checking: {
                  always: [
                    { target: 'success', cond: (ctx) => ctx.count === 42 },
                    { target: 'counting' }
                  ]
                },
                success: {
                  type: 'final'
                }
              }
            }),
            onDone: 'success'
          },
          on: {
            INC: { actions: forwardTo('counter') }
          }
        },
        success: {
          type: 'final'
        }
      }
    });

    const service = interpret(machine).start();
    service.send('NEXT');
    service.send('INC');

    const snapshot = service.getSnapshot();

    delete snapshot.actions;

    service.stop();

    const restoredService = interpret(machine)
      .onDone(() => {
        done();
      })
      .start(snapshot);

    expect(
      restoredService.children.get('counter')?.getSnapshot().context
    ).toEqual({ count: 41 });

    restoredService.send('INC');
  });
});
