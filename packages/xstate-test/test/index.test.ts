// nothing yet
import { createModel } from '../src';
import { Machine, assign } from 'xstate';
import stripAnsi from 'strip-ansi';

interface DieHardContext {
  three: number;
  five: number;
}

const pour3to5 = assign<DieHardContext>((ctx) => {
  const poured = Math.min(5 - ctx.five, ctx.three);

  return {
    three: ctx.three - poured,
    five: ctx.five + poured
  };
});
const pour5to3 = assign<DieHardContext>((ctx) => {
  const poured = Math.min(3 - ctx.three, ctx.five);

  const res = {
    three: ctx.three + poured,
    five: ctx.five - poured
  };

  return res;
});
const fill3 = assign<DieHardContext>({ three: 3 });
const fill5 = assign<DieHardContext>({ five: 5 });
const empty3 = assign<DieHardContext>({ three: 0 });
const empty5 = assign<DieHardContext>({ five: 0 });

const dieHardMachine = Machine<DieHardContext>(
  {
    id: 'dieHard',
    initial: 'pending',
    context: { three: 0, five: 0 },
    states: {
      pending: {
        on: {
          '': {
            target: 'success',
            cond: 'weHave4Gallons'
          },
          POUR_3_TO_5: {
            actions: pour3to5
          },
          POUR_5_TO_3: {
            actions: pour5to3
          },
          FILL_3: {
            actions: fill3
          },
          FILL_5: {
            actions: fill5
          },
          EMPTY_3: {
            actions: empty3
          },
          EMPTY_5: {
            actions: empty5
          }
        },
        meta: {
          description: (state) => {
            return `pending with (${state.context.three}, ${state.context.five})`;
          },
          test: async ({ jugs }, state) => {
            expect(jugs.five).not.toEqual(4);
            expect(jugs.three).toEqual(state.context.three);
            expect(jugs.five).toEqual(state.context.five);
          }
        }
      },
      success: {
        type: 'final',
        meta: {
          description: '4 gallons',
          test: async ({ jugs }) => {
            expect(jugs.five).toEqual(4);
          }
        }
      }
    }
  },
  {
    guards: {
      weHave4Gallons: (ctx) => ctx.five === 4
    }
  }
);

class Jugs {
  public three = 0;
  public five = 0;

  public fillThree() {
    this.three = 3;
  }
  public fillFive() {
    this.five = 5;
  }
  public emptyThree() {
    this.three = 0;
  }
  public emptyFive() {
    this.five = 0;
  }
  public transferThree() {
    const poured = Math.min(5 - this.five, this.three);

    this.three = this.three - poured;
    this.five = this.five + poured;
  }
  public transferFive() {
    const poured = Math.min(3 - this.three, this.five);

    this.three = this.three + poured;
    this.five = this.five - poured;
  }
}

const dieHardModel = createModel<{ jugs: Jugs }>(dieHardMachine).withEvents({
  POUR_3_TO_5: {
    exec: async ({ jugs }) => {
      await jugs.transferThree();
    }
  },
  POUR_5_TO_3: {
    exec: async ({ jugs }) => {
      await jugs.transferFive();
    }
  },
  EMPTY_3: {
    exec: async ({ jugs }) => {
      await jugs.emptyThree();
    }
  },
  EMPTY_5: {
    exec: async ({ jugs }) => {
      await jugs.emptyFive();
    }
  },
  FILL_3: {
    exec: async ({ jugs }) => {
      await jugs.fillThree();
    }
  },
  FILL_5: {
    exec: async ({ jugs }) => {
      await jugs.fillFive();
    }
  }
});

describe('testing a model (shortestPathsTo)', () => {
  dieHardModel
    .getShortestPathPlansTo('success') // ...
    .forEach((plan) => {
      describe(plan.description, () => {
        plan.paths.forEach((path) => {
          it(path.description, () => {
            const testJugs = new Jugs();
            return path.test({ jugs: testJugs });
          });
        });
      });
    });
});

describe('testing a model (simplePathsTo)', () => {
  dieHardModel
    .getSimplePathPlansTo('success') // ...
    .forEach((plan) => {
      describe(`reaches state ${JSON.stringify(
        plan.state.value
      )} (${JSON.stringify(plan.state.context)})`, () => {
        plan.paths.forEach((path) => {
          it(path.description, () => {
            const testJugs = new Jugs();
            return path.test({ jugs: testJugs });
          });
        });
      });
    });
});

describe('path.test()', () => {
  const plans = dieHardModel.getSimplePathPlansTo((state) => {
    return state.matches('success') && state.context.three === 0;
  });

  plans.forEach((plan) => {
    describe(`reaches state ${JSON.stringify(
      plan.state.value
    )} (${JSON.stringify(plan.state.context)})`, () => {
      plan.paths.forEach((path) => {
        describe(path.description, () => {
          it(`reaches the target state`, () => {
            const testJugs = new Jugs();
            return path.test({ jugs: testJugs });
          });
        });
      });
    });
  });
});

describe('error path trace', () => {
  describe('should return trace for failed state', () => {
    const machine = Machine({
      initial: 'first',
      states: {
        first: {
          on: { NEXT: 'second' }
        },
        second: {
          on: { NEXT: 'third' }
        },
        third: {
          meta: {
            test: () => {
              throw new Error('test error');
            }
          }
        }
      }
    });

    const testModel = createModel(machine).withEvents({
      NEXT: () => {
        /* noop */
      }
    });

    testModel.getShortestPathPlansTo('third').forEach((plan) => {
      plan.paths.forEach((path) => {
        it('should show an error path trace', async () => {
          try {
            await path.test(undefined);
          } catch (err) {
            expect(err.message).toEqual(expect.stringContaining('test error'));
            expect(stripAnsi(err.message)).toMatchSnapshot('error path trace');
            return;
          }

          throw new Error('Should have failed');
        });
      });
    });
  });
});

describe('coverage', () => {
  it('reports state node coverage', () => {
    const coverage = dieHardModel.getCoverage();

    expect(coverage.stateNodes['dieHard.pending']).toBeGreaterThan(0);
    expect(coverage.stateNodes['dieHard.success']).toBeGreaterThan(0);
  });

  it('tests missing state node coverage', async () => {
    const machine = Machine({
      id: 'missing',
      initial: 'first',
      states: {
        first: {
          on: { NEXT: 'third' },
          meta: {
            test: () => true
          }
        },
        second: {
          meta: {
            test: () => true
          }
        },
        third: {
          initial: 'one',
          states: {
            one: {
              meta: {
                test: () => true
              }
            },
            two: {
              meta: {
                test: () => true
              }
            },
            three: {
              meta: {
                test: () => true
              }
            }
          },
          meta: {
            test: () => true
          }
        }
      }
    });

    const testModel = createModel(machine).withEvents({
      NEXT: () => {
        /* ... */
      }
    });
    const plans = testModel.getShortestPathPlans();

    for (const plan of plans) {
      for (const path of plan.paths) {
        await path.test(undefined);
      }
    }

    try {
      testModel.testCoverage();
    } catch (err) {
      expect(err.message).toEqual(expect.stringContaining('missing.second'));
      expect(err.message).toEqual(expect.stringContaining('missing.third.two'));
      expect(err.message).toEqual(
        expect.stringContaining('missing.third.three')
      );
    }
  });

  it('skips filtered states (filter option)', async () => {
    const TestBug = Machine({
      id: 'testbug',
      initial: 'idle',
      context: {
        retries: 0
      },
      states: {
        idle: {
          on: {
            START: 'passthrough'
          },
          meta: {
            test: () => {
              /* ... */
            }
          }
        },
        passthrough: {
          on: {
            '': 'end'
          }
        },
        end: {
          type: 'final',
          meta: {
            test: () => {
              /* ... */
            }
          }
        }
      }
    });

    const testModel = createModel(TestBug).withEvents({
      START: () => {
        /* ... */
      }
    });

    const testPlans = testModel.getShortestPathPlans();

    const promises: any[] = [];
    testPlans.forEach((plan) => {
      plan.paths.forEach(() => {
        promises.push(plan.test(undefined));
      });
    });

    await Promise.all(promises);

    expect(() => {
      testModel.testCoverage({
        filter: (stateNode) => {
          return !!stateNode.meta;
        }
      });
    }).not.toThrow();
  });
});

describe('events', () => {
  it('should allow for representing many cases', async () => {
    type Events =
      | { type: 'CLICK_BAD' }
      | { type: 'CLICK_GOOD' }
      | { type: 'CLOSE' }
      | { type: 'ESC' }
      | { type: 'SUBMIT'; value: string };
    const feedbackMachine = Machine<void, Events>({
      id: 'feedback',
      initial: 'question',
      states: {
        question: {
          on: {
            CLICK_GOOD: 'thanks',
            CLICK_BAD: 'form',
            CLOSE: 'closed',
            ESC: 'closed'
          },
          meta: {
            test: () => {
              // ...
            }
          }
        },
        form: {
          on: {
            SUBMIT: [
              {
                target: 'thanks',
                cond: (_, e) => !!e.value.length
              },
              {
                target: '.invalid'
              }
            ],
            CLOSE: 'closed',
            ESC: 'closed'
          },
          meta: {
            test: () => {
              // ...
            }
          },
          initial: 'valid',
          states: {
            valid: {
              meta: {
                test: () => {
                  // noop
                }
              }
            },
            invalid: {
              meta: {
                test: () => {
                  // noop
                }
              }
            }
          }
        },
        thanks: {
          on: {
            CLOSE: 'closed',
            ESC: 'closed'
          },
          meta: {
            test: () => {
              // ...
            }
          }
        },
        closed: {
          type: 'final',
          meta: {
            test: () => {
              // ...
            }
          }
        }
      }
    });

    const testModel = createModel(feedbackMachine).withEvents({
      CLICK_BAD: () => {
        /* ... */
      },
      CLICK_GOOD: () => {
        /* ... */
      },
      CLOSE: () => {
        /* ... */
      },
      SUBMIT: {
        cases: [{ value: 'something' }, { value: '' }]
      }
    });

    const testPlans = testModel.getShortestPathPlans();

    for (const plan of testPlans) {
      await plan.test(undefined);
    }

    return testModel.testCoverage();
  });

  it('should not throw an error for unimplemented events', () => {
    const testMachine = Machine({
      initial: 'idle',
      states: {
        idle: {
          on: { ACTIVATE: 'active' }
        },
        active: {}
      }
    });

    const testModel = createModel(testMachine);

    const testPlans = testModel.getShortestPathPlans();

    expect(async () => {
      for (const plan of testPlans) {
        await plan.test(undefined);
      }
    }).not.toThrow();
  });
});

describe('state limiting', () => {
  it('should limit states with filter option', () => {
    const machine = Machine<{ count: number }>({
      initial: 'counting',
      context: { count: 0 },
      states: {
        counting: {
          on: {
            INC: {
              actions: assign({
                count: (ctx) => ctx.count + 1
              })
            }
          }
        }
      }
    });

    const testModel = createModel(machine);
    const testPlans = testModel.getShortestPathPlans({
      filter: (state) => {
        return state.context.count < 5;
      }
    });

    expect(testPlans).toHaveLength(5);
  });
});

describe('plan description', () => {
  const machine = Machine({
    id: 'test',
    initial: 'atomic',
    context: { count: 0 },
    states: {
      atomic: {
        on: { NEXT: 'compound', DONE: 'final' }
      },
      final: {
        type: 'final'
      },
      compound: {
        initial: 'child',
        states: {
          child: {
            on: {
              NEXT: 'childWithMeta'
            }
          },
          childWithMeta: {
            meta: {
              description: 'child with meta'
            }
          }
        },
        on: {
          NEXT: 'parallel'
        }
      },
      parallel: {
        type: 'parallel',
        states: {
          one: {},
          two: {
            meta: {
              description: 'two description'
            }
          }
        },
        on: {
          NEXT: 'noMetaDescription'
        }
      },
      noMetaDescription: {
        meta: {}
      }
    }
  });

  const testModel = createModel(machine);
  const testPlans = testModel.getShortestPathPlans();

  it('should give a description for every plan', () => {
    const planDescriptions = testPlans.map((plan) => plan.description);

    expect(planDescriptions).toMatchInlineSnapshot(`
      Array [
        "reaches state: \\"#test.atomic\\" ({\\"count\\":0})",
        "reaches state: \\"#test.compound.child\\" ({\\"count\\":0})",
        "reaches state: \\"#test.final\\" ({\\"count\\":0})",
        "reaches state: \\"child with meta\\" ({\\"count\\":0})",
        "reaches states: \\"#test.parallel.one\\", \\"two description\\" ({\\"count\\":0})",
        "reaches state: \\"noMetaDescription\\" ({\\"count\\":0})",
      ]
    `);
  });
});

describe('event meta', () => {
  const machine = Machine({
    id: 'event meta',
    initial: 'first',
    states: {
      first: {
        on: { CLICK: { target: 'second', meta: { field: 'one' } } }
      },
      second: {
        on: { CLICK: { target: 'third', meta: { field: 'two' } } }
      },
      third: {
        meta: {
          test: (context) => context.fields.one && context.fields.two
        }
      }
    }
  });

  const testModel = createModel<{ fields: Record<string, boolean> }>(
    machine
  ).withEvents({
    CLICK: (context, _, eventMeta) => {
      context.fields[eventMeta!.field] = true;
    }
  });

  const plans = testModel.getShortestPathPlans();
  plans.forEach((plan) => {
    describe(`reaches state ${JSON.stringify(
      plan.state.value
    )} (${JSON.stringify(plan.state.context)})`, () => {
      plan.paths.forEach((path) => {
        describe(path.description, () => {
          it(`reaches the target state`, () => {
            return path.test({ fields: {} });
          });
        });
      });
    });
  });
});
