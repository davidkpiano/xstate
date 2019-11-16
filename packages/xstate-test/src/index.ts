import {
  getShortestPaths,
  getSimplePaths,
  getStateNodes,
  getAlternatePaths
} from '@xstate/graph';
import { StateMachine, EventObject, State, StateValue } from 'xstate';
import { StatePathsMap } from '@xstate/graph/lib/types';
import slimChalk from './slimChalk';
import {
  TestModelCoverage,
  TestModelOptions,
  TestPlan,
  StatePredicate,
  TestPathResult,
  TestSegmentResult,
  TestMeta,
  EventExecutor
} from './types';
import {
  ValueAdjMapOptions,
  ValueAlternatePathOptions
} from '@xstate/graph/lib/graph';

/**
 * Creates a test model that represents an abstract model of a
 * system under test (SUT).
 *
 * The test model is used to generate test plans, which are used to
 * verify that states in the `machine` are reachable in the SUT.
 *
 * @example
 *
 * ```js
 * const toggleModel = createModel(toggleMachine).withEvents({
 *   TOGGLE: {
 *     exec: async page => {
 *       await page.click('input');
 *     }
 *   }
 * });
 * ```
 *
 */
export class TestModel<TTestContext, TContext> {
  public coverage: TestModelCoverage = {
    stateNodes: new Map(),
    transitions: new Map()
  };
  public options: TestModelOptions<TTestContext>;
  public static defaultOptions: TestModelOptions<any> = {
    events: {}
  };

  constructor(
    public machine: StateMachine<TContext, any, any>,
    options?: Partial<TestModelOptions<TTestContext>>
  ) {
    this.options = {
      ...TestModel.defaultOptions,
      ...options
    };
  }

  public getShortestPathPlans(
    options?: Partial<ValueAdjMapOptions<TContext, any>>
  ): Array<TestPlan<TTestContext, TContext>> {
    const shortestPaths = getShortestPaths(this.machine, {
      ...options,
      events: getEventSamples<TTestContext>(this.options.events)
    }) as StatePathsMap<TContext, any>;

    return this.getTestPlans(shortestPaths);
  }

  public getShortestPathPlansTo(
    stateValue: StateValue | StatePredicate<TContext>
  ): Array<TestPlan<TTestContext, TContext>> {
    let minWeight = Infinity;
    let shortestPlans: Array<TestPlan<TTestContext, TContext>> = [];

    const plans = this.filterPathsTo(stateValue, this.getShortestPathPlans());

    for (const plan of plans) {
      const currWeight = plan.paths[0].weight;
      if (currWeight < minWeight) {
        minWeight = currWeight;
        shortestPlans = [plan];
      } else if (currWeight === minWeight) {
        shortestPlans.push(plan);
      }
    }

    return shortestPlans;
  }

  private filterPathsTo(
    stateValue: StateValue | StatePredicate<TContext>,
    testPlans: Array<TestPlan<TTestContext, TContext>>
  ): Array<TestPlan<TTestContext, TContext>> {
    const predicate =
      typeof stateValue === 'function'
        ? plan => stateValue(plan.state)
        : plan => plan.state.matches(stateValue);
    return testPlans.filter(predicate);
  }

  public getSimplePathPlans(
    options?: Partial<ValueAdjMapOptions<TContext, any>>
  ): Array<TestPlan<TTestContext, TContext>> {
    const simplePaths = getSimplePaths(this.machine, {
      ...options,
      events: getEventSamples(this.options.events)
    }) as StatePathsMap<TContext, any>;

    return this.getTestPlans(simplePaths);
  }

  public getAlternatePathPlans(
    stateValue: StateValue,
    options?: Partial<ValueAlternatePathOptions<TContext, any>>
  ): Array<TestPlan<TTestContext, TContext>> {
    const alternatePaths = getAlternatePaths(this.machine, stateValue, {
      ...options,
      events: getEventSamples(this.options.events)
    }) as StatePathsMap<TContext, any>;

    return this.getTestPlans(alternatePaths);
  }

  public getSimplePathPlansTo(
    stateValue: StateValue | StatePredicate<TContext>
  ): Array<TestPlan<TTestContext, TContext>> {
    return this.filterPathsTo(stateValue, this.getSimplePathPlans());
  }

  public getTestPlans(
    statePathsMap: StatePathsMap<TContext, any>
  ): Array<TestPlan<TTestContext, TContext>> {
    return Object.keys(statePathsMap).map(key => {
      const testPlan = statePathsMap[key];
      const paths = testPlan.paths.map(path => {
        const segments = path.segments.map(segment => {
          return {
            ...segment,
            description: getDescription(segment.state),
            test: testContext => this.testState(segment.state, testContext),
            exec: testContext => this.executeEvent(segment.event, testContext)
          };
        });

        function formatEvent(event: EventObject): string {
          const { type, ...other } = event;

          const propertyString = Object.keys(other).length
            ? ` (${JSON.stringify(other)})`
            : '';

          return `${type}${propertyString}`;
        }

        const eventsString = path.segments
          .map(s => formatEvent(s.event))
          .join(' → ');

        return {
          ...path,
          segments,
          description: `via ${eventsString}`,
          test: async testContext => {
            const testPathResult: TestPathResult = {
              segments: [],
              state: {
                error: null
              }
            };

            try {
              for (const segment of segments) {
                const testSegmentResult: TestSegmentResult = {
                  segment,
                  state: { error: null },
                  event: { error: null }
                };

                testPathResult.segments.push(testSegmentResult);

                try {
                  await segment.test(testContext);
                } catch (err) {
                  testSegmentResult.state.error = err;

                  throw err;
                }

                try {
                  await segment.exec(testContext);
                } catch (err) {
                  testSegmentResult.event.error = err;

                  throw err;
                }
              }

              try {
                await this.testState(testPlan.state, testContext);
              } catch (err) {
                testPathResult.state.error = err;
                throw err;
              }
            } catch (err) {
              const targetStateString = `${JSON.stringify(path.state.value)} ${
                path.state.context === undefined
                  ? ''
                  : JSON.stringify(path.state.context)
              }`;

              let hasFailed = false;
              err.message +=
                '\nPath:\n' +
                testPathResult.segments
                  .map(s => {
                    const stateString = `${JSON.stringify(
                      s.segment.state.value
                    )} ${
                      s.segment.state.context === undefined
                        ? ''
                        : JSON.stringify(s.segment.state.context)
                    }`;
                    const eventString = `${JSON.stringify(s.segment.event)}`;

                    const stateResult = `\tState: ${
                      hasFailed
                        ? slimChalk('gray', stateString)
                        : s.state.error
                        ? ((hasFailed = true),
                          slimChalk('redBright', stateString))
                        : slimChalk('greenBright', stateString)
                    }`;
                    const eventResult = `\tEvent: ${
                      hasFailed
                        ? slimChalk('gray', eventString)
                        : s.event.error
                        ? ((hasFailed = true), slimChalk('red', eventString))
                        : slimChalk('green', eventString)
                    }`;

                    return [stateResult, eventResult].join('\n');
                  })
                  .concat(
                    `\tState: ${
                      hasFailed
                        ? slimChalk('gray', targetStateString)
                        : testPathResult.state.error
                        ? slimChalk('red', targetStateString)
                        : slimChalk('green', targetStateString)
                    }`
                  )
                  .join('\n\n');

              throw err;
            }

            return testPathResult;
          }
        };
      });

      return {
        ...testPlan,
        test: async testContext => {
          for (const path of paths) {
            await path.test(testContext);
          }
        },
        description: `reaches ${getDescription(testPlan.state)}`,
        paths
      } as TestPlan<TTestContext, TContext>;
    });
  }

  public async testState(state: State<TContext>, testContext: TTestContext) {
    for (const id of Object.keys(state.meta)) {
      const stateNodeMeta = state.meta[id] as TestMeta<TTestContext, TContext>;
      if (typeof stateNodeMeta.test === 'function' && !stateNodeMeta.skip) {
        this.coverage.stateNodes.set(
          id,
          (this.coverage.stateNodes.get(id) || 0) + 1
        );

        await stateNodeMeta.test(testContext, state);
      }
    }
  }

  public getEventExecutor(
    event: EventObject
  ): EventExecutor<TTestContext> | undefined {
    const testEvent = this.options.events[event.type];

    if (!testEvent) {
      // tslint:disable-next-line:no-console
      console.warn(`Missing config for event "${event.type}".`);
      return undefined;
    }

    if (typeof testEvent === 'function') {
      return testEvent;
    }

    return testEvent.exec;
  }

  public async executeEvent(event: EventObject, testContext: TTestContext) {
    const executor = this.getEventExecutor(event);

    if (executor) {
      await executor(testContext, event);
    }
  }

  public getCoverage(): { stateNodes: Record<string, number> } {
    const stateNodes = getStateNodes(this.machine);
    const coverage = {
      stateNodes: stateNodes.reduce((acc, stateNode) => {
        acc[stateNode.id] = 0;
        return acc;
      }, {})
    };

    for (const key of this.coverage.stateNodes.keys()) {
      coverage.stateNodes[key] = this.coverage.stateNodes.get(key);
    }

    return coverage;
  }

  public testCoverage(): void {
    const coverage = this.getCoverage();
    const missingStateNodes = Object.keys(coverage.stateNodes).filter(id => {
      return !coverage.stateNodes[id];
    });

    if (missingStateNodes.length) {
      throw new Error(
        'Missing coverage for state nodes:\n' +
          missingStateNodes.map(id => `\t${id}`).join('\n')
      );
    }
  }

  public withEvents(
    eventMap: TestModelOptions<TTestContext>['events']
  ): TestModel<TTestContext, TContext> {
    return new TestModel<TTestContext, TContext>(this.machine, {
      events: eventMap
    });
  }
}

function getDescription<T, TContext>(state: State<TContext>): string {
  if (state === undefined) {
    return 'undefined';
  }

  const contextString =
    state.context === undefined ? '' : `(${JSON.stringify(state.context)})`;

  const stateStrings = state.configuration
    .filter(sn => sn.type === 'atomic')
    .map(({ id }) => {
      const meta = state.meta[id] as TestMeta<T, TContext>;
      if (!meta) {
        return `"#${id}"`;
      }

      const { description } = meta;

      return typeof description === 'function'
        ? description(state)
        : `"${description}"` || `"${JSON.stringify(state.value)}"`;
    });

  return (
    `state${stateStrings.length === 1 ? '' : 's'}: ` +
    stateStrings.join(', ') +
    ` ${contextString}`
  );
}

function getEventSamples<T>(eventsOptions: TestModelOptions<T>['events']) {
  const result = {};

  Object.keys(eventsOptions).forEach(key => {
    const eventConfig = eventsOptions[key];
    if (typeof eventConfig === 'function') {
      return [
        {
          type: key
        }
      ];
    }

    result[key] = eventConfig.cases
      ? eventConfig.cases.map(sample => ({
          type: key,
          ...sample
        }))
      : [
          {
            type: key
          }
        ];
  });

  return result;
}

/**
 * Creates a test model that represents an abstract model of a
 * system under test (SUT).
 *
 * The test model is used to generate test plans, which are used to
 * verify that states in the `machine` are reachable in the SUT.
 *
 * @example
 *
 * ```js
 * const toggleModel = createModel(toggleMachine).withEvents({
 *   TOGGLE: {
 *     exec: async page => {
 *       await page.click('input');
 *     }
 *   }
 * });
 * ```
 *
 * @param machine The state machine used to represent the abstract model.
 * @param options Options for the created test model:
 * - `events`: an object mapping string event types (e.g., `SUBMIT`)
 * to an event test config (e.g., `{exec: () => {...}, cases: [...]}`)
 */
export function createModel<TestContext, TContext = any>(
  machine: StateMachine<TContext, any, any>,
  options?: TestModelOptions<TestContext>
): TestModel<TestContext, TContext> {
  return new TestModel<TestContext, TContext>(machine, options);
}
