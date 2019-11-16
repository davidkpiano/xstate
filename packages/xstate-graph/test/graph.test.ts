import { Machine, StateNode } from 'xstate';
import {
  getStateNodes,
  getSimplePaths,
  getShortestPaths,
  getAlternatePaths
} from '../src/index';
import { getSimplePathsAsArray, getAdjacencyMap } from '../src/graph';
import { assign } from 'xstate';

describe('@xstate/graph', () => {
  const pedestrianStates = {
    initial: 'walk',
    states: {
      walk: {
        on: {
          PED_COUNTDOWN: {
            target: 'wait',
            actions: ['startCountdown']
          }
        }
      },
      wait: {
        on: {
          PED_COUNTDOWN: 'stop'
        }
      },
      stop: {},
      flashing: {}
    }
  };

  const lightMachine = Machine({
    key: 'light',
    initial: 'green',
    states: {
      green: {
        on: {
          TIMER: 'yellow',
          POWER_OUTAGE: 'red.flashing',
          PUSH_BUTTON: [
            {
              actions: ['doNothing'] // pushing the walk button never does anything
            }
          ]
        }
      },
      yellow: {
        on: {
          TIMER: 'red',
          POWER_OUTAGE: '#light.red.flashing'
        }
      },
      red: {
        on: {
          TIMER: 'green',
          POWER_OUTAGE: 'red.flashing'
        },
        ...pedestrianStates
      }
    }
  });

  type CondMachineCtx = { id: string };
  type CondMachineEvents = { type: 'EVENT'; id: string } | { type: 'STATE' };

  const condMachine = Machine<CondMachineCtx, CondMachineEvents>({
    key: 'cond',
    initial: 'pending',
    states: {
      pending: {
        on: {
          EVENT: [
            {
              target: 'foo',
              cond: (_, e) => e.id === 'foo'
            },
            { target: 'bar' }
          ],
          STATE: [
            {
              target: 'foo',
              cond: s => s.id === 'foo'
            },
            { target: 'bar' }
          ]
        }
      },
      foo: {},
      bar: {}
    }
  });

  const parallelMachine = Machine({
    type: 'parallel',
    key: 'p',
    states: {
      a: {
        initial: 'a1',
        states: {
          a1: {
            on: { 2: 'a2', 3: 'a3' }
          },
          a2: {
            on: { 3: 'a3', 1: 'a1' }
          },
          a3: {}
        }
      },
      b: {
        initial: 'b1',
        states: {
          b1: {
            on: { 2: 'b2', 3: 'b3' }
          },
          b2: {
            on: { 3: 'b3', 1: 'b1' }
          },
          b3: {}
        }
      }
    }
  });

  describe('getNodes()', () => {
    it('should return an array of all nodes', () => {
      const nodes = getStateNodes(lightMachine);
      expect(nodes.every(node => node instanceof StateNode)).toBe(true);
      expect(nodes.map(node => node.id).sort()).toEqual([
        'light.green',
        'light.red',
        'light.red.flashing',
        'light.red.stop',
        'light.red.wait',
        'light.red.walk',
        'light.yellow'
      ]);
    });

    it('should return an array of all nodes (parallel)', () => {
      const nodes = getStateNodes(parallelMachine);
      expect(nodes.every(node => node instanceof StateNode)).toBe(true);
      expect(nodes.map(node => node.id).sort()).toEqual([
        'p.a',
        'p.a.a1',
        'p.a.a2',
        'p.a.a3',
        'p.b',
        'p.b.b1',
        'p.b.b2',
        'p.b.b3'
      ]);
    });
  });

  describe('getShortestPaths()', () => {
    it('should return a mapping of shortest paths to all states', () => {
      const paths = getShortestPaths(lightMachine) as any;

      expect(paths).toMatchSnapshot('shortest paths');
    });

    it('should return a mapping of shortest paths to all states (parallel)', () => {
      const paths = getShortestPaths(parallelMachine) as any;
      expect(paths).toMatchSnapshot('shortest paths parallel');
    });

    it('the initial state should have a zero-length path', () => {
      expect(
        getShortestPaths(lightMachine)[
          JSON.stringify(lightMachine.initialState.value)
        ].paths[0].segments
      ).toHaveLength(0);
    });

    xit('should not throw when a condition is present', () => {
      expect(() => getShortestPaths(condMachine)).not.toThrow();
    });

    it('should represent conditional paths based on context', () => {
      // explicit type arguments could be removed once davidkpiano/xstate#652 gets resolved
      const paths = getShortestPaths<CondMachineCtx, CondMachineEvents>(
        condMachine.withContext({
          id: 'foo'
        }),
        {
          events: {
            EVENT: [
              {
                type: 'EVENT',
                id: 'whatever'
              }
            ],
            STATE: [
              {
                type: 'STATE'
              }
            ]
          }
        }
      );

      expect(paths).toMatchSnapshot('shortest paths conditional');
    });
  });

  describe('getAlternatePaths()', () => {
    it('should return a mapping of arrays of paths to target state', () => {
      const alternatePaths = getAlternatePaths(lightMachine, 'red');
      const paths = {};

      for (const a in alternatePaths) {
        if (!alternatePaths.hasOwnProperty(a)) {
          continue;
        }
        paths[a] = alternatePaths[a].paths.map(p => ({
          segments: p.segments.map(s => ({
            event: s.event,
            state: s.state.value
          }))
        }));
      }

      expect(paths).toMatchSnapshot('alternate paths');
    });
    it('should return a mapping of arrays of paths to target state with max revisits', () => {
      const alternatePaths = getAlternatePaths(lightMachine, 'red', {
        maxRevisits: 2
      });
      const paths = {};

      for (const a in alternatePaths) {
        if (!alternatePaths.hasOwnProperty(a)) {
          continue;
        }
        paths[a] = alternatePaths[a].paths.map(p => ({
          segments: p.segments.map(s => ({
            event: s.event,
            state: s.state.value
          }))
        }));
      }

      expect(paths).toMatchSnapshot('alternate paths');
    });
  });

  describe('getSimplePaths()', () => {
    it('should return a mapping of arrays of simple paths to all states', () => {
      const paths = getSimplePaths(lightMachine) as any;

      expect(paths).toMatchSnapshot('simple paths');
    });

    const equivMachine = Machine({
      initial: 'a',
      states: {
        a: { on: { FOO: 'b', BAR: 'b' } },
        b: { on: { FOO: 'a', BAR: 'a' } }
      }
    });

    it('should return a mapping of simple paths to all states (parallel)', () => {
      const paths = getSimplePaths(parallelMachine);
      expect(paths).toMatchSnapshot('simple paths parallel');
    });

    it('should return multiple paths for equivalent transitions', () => {
      const paths = getSimplePaths(equivMachine);
      expect(paths).toMatchSnapshot('simple paths equal transitions');
    });

    it('should return a single empty path for the initial state', () => {
      expect(getSimplePaths(lightMachine)['"green"'].paths).toHaveLength(1);
      expect(
        getSimplePaths(lightMachine)['"green"'].paths[0].segments
      ).toHaveLength(0);
      expect(getSimplePaths(equivMachine)['"a"'].paths).toHaveLength(1);
      expect(
        getSimplePaths(equivMachine)['"a"'].paths[0].segments
      ).toHaveLength(0);
    });

    it('should return value-based paths', () => {
      interface Ctx {
        count: number;
      }
      interface Events {
        type: 'INC';
        value: number;
      }
      const countMachine = Machine<Ctx, Events>({
        id: 'count',
        initial: 'start',
        context: {
          count: 0
        },
        states: {
          start: {
            on: {
              '': {
                target: 'finish',
                cond: ctx => ctx.count === 3
              },
              INC: {
                actions: assign({
                  count: ctx => ctx.count + 1
                })
              }
            }
          },
          finish: {}
        }
      });

      const paths = getSimplePaths(countMachine, {
        events: {
          INC: [{ type: 'INC', value: 1 }]
        }
      });

      expect(paths).toMatchSnapshot('simple paths context');
    });
  });

  describe('getSimplePathsAsArray()', () => {
    it('should return an array of shortest paths to all states', () => {
      const pathsArray = getSimplePathsAsArray(lightMachine);

      expect(Array.isArray(pathsArray)).toBeTruthy();
      expect(pathsArray).toMatchSnapshot('simple paths array');
    });
  });

  describe('getAdjacencyMap', () => {
    it('should map adjacencies', () => {
      interface Ctx {
        count: number;
        other: string;
      }
      type Events = { type: 'INC'; value: number } | { type: 'DEC' };

      const counterMachine = Machine<Ctx, Events>({
        id: 'counter',
        initial: 'empty',
        context: {
          count: 0,
          other: 'something'
        },
        states: {
          empty: {
            on: {
              '': {
                target: 'full',
                cond: ctx => ctx.count === 5
              },
              INC: {
                actions: assign({
                  count: (ctx, e) => ctx.count + e.value
                })
              },
              DEC: {
                actions: assign({
                  count: ctx => ctx.count - 1
                })
              }
            }
          },
          full: {}
        }
      });

      // explicit type arguments could be removed once davidkpiano/xstate#652 gets resolved
      const adj = getAdjacencyMap<Ctx, Events>(counterMachine, {
        filter: state => state.context.count >= 0 && state.context.count <= 5,
        stateSerializer: state => {
          const ctx = {
            count: state.context.count
          };
          return JSON.stringify(state.value) + ' | ' + JSON.stringify(ctx);
        },
        events: {
          INC: [{ type: 'INC', value: 1 }]
        }
      });

      expect(adj).toHaveProperty('"full" | {"count":5}');
    });
  });
});
