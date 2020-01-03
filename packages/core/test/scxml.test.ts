import * as fs from 'fs';
import * as path from 'path';
import * as pkgUp from 'pkg-up';
// import * as util from 'util';

import { toMachine } from '../src/scxml';
import { StateNode } from '../src/StateNode';
import { interpret } from '../src/interpreter';
import { SimulatedClock } from '../src/SimulatedClock';
import { State } from '../src';
import { pathsToStateValue } from '../src/utils';
// import { StateValue } from '../src/types';
// import { Event, StateValue, ActionObject } from '../src/types';
// import { actionTypes } from '../src/actions';

const TEST_FRAMEWORK = path.dirname(pkgUp.sync({
  cwd: require.resolve('@scion-scxml/test-framework')
}) as string);

const testGroups = {
  actionSend: [
    'send1',
    'send2',
    'send3',
    'send4',
    'send4b',
    'send7',
    'send7b',
    'send8',
    'send8b',
    'send9'
  ],
  assign: [
    // 'assign_invalid', // TODO: handle error.execution event
    'assign_obj_literal'
  ],
  'assign-current-small-step': ['test0', 'test1', 'test2', 'test3', 'test4'],
  basic: ['basic0', 'basic1', 'basic2'],
  'cond-js': ['test0', 'test1', 'test2', 'TestConditionalTransition'],
  data: [
    // 'data_invalid',
    'data_obj_literal'
  ],
  'default-initial-state': ['initial1', 'initial2'],
  delayedSend: ['send1', 'send2', 'send3'],
  documentOrder: ['documentOrder0'],
  error: [
    // 'error', // not implemented
  ],
  forEach: [
    // 'test1', // not implemented
  ],
  hierarchy: ['hier0', 'hier1', 'hier2'],
  'hierarchy+documentOrder': ['test0', 'test1'],
  history: [
    'history0',
    'history1',
    'history2',
    'history3',
    // 'history4', // TODO: support history nodes on parallel states
    'history4b',
    'history5',
    'history6'
  ],
  'if-else': [
    // 'test0', // not implemented
  ],
  in: [
    // 'TestInPredicate', // In() conversion not implemented yet
  ],
  'internal-transitions': ['test0', 'test1'],
  misc: ['deep-initial'],
  'more-parallel': [
    'test0',
    'test1',
    'test2',
    'test2b',
    'test3',
    // 'test3b',
    'test4',
    'test5',
    'test6',
    // 'test6b',
    'test7',
    'test8',
    'test9',
    'test10',
    'test10b'
  ],
  'multiple-events-per-transition': [
    // 'test1'
  ],
  parallel: ['test0', 'test1', 'test2', 'test3'],
  'parallel+interrupt': [
    'test0',
    // 'test1',
    'test2',
    'test3',
    'test4',
    // 'test5',
    'test6',
    // 'test7',
    // 'test7b',
    'test8',
    'test9',
    'test10',
    'test11',
    // 'test12',
    'test13',
    'test14',
    // 'test15',
    'test16',
    'test17',
    'test18',
    'test19',
    // 'test20',
    // 'test21',
    // 'test21b',
    'test22',
    'test23',
    'test24',
    // 'test25',
    'test27',
    'test28',
    'test29',
    'test30',
    'test31'
  ],
  // script: ['test0', 'test1', 'test2'], // <script/> conversion not implemented
  // 'script-src': ['test0', 'test1', 'test2', 'test3'], // <script/> conversion not implemented
  'scxml-prefix-event-name-matching': [
    'star0'
    // prefix event matching not implemented yet
    // 'test0',
    // 'test1'
  ],
  // 'send-data': ['send1'],
  // 'send-idlocation': ['test0'],
  // 'send-internal': ['test0'],
  'targetless-transition': ['test0', 'test1', 'test2', 'test3'],
  'w3c-ecma': [
    'test144.txml',
    // 'test147.txml',
    // 'test148.txml',
    'test149.txml',
    // 'test150.txml',
    // 'test151.txml',
    // 'test152.txml',
    // 'test153.txml',
    // 'test155.txml',
    // 'test156.txml',
    'test158.txml',
    // 'test159.txml',
    'test172.txml',
    'test173.txml',
    'test174.txml',
    'test175.txml',
    'test176.txml',
    // 'test179.txml',
    // 'test183.txml',
    'test185.txml',
    // 'test186.txml',
    'test187.txml',
    'test189.txml',
    // 'test190.txml',
    'test191.txml',
    // 'test192.txml',
    'test193.txml',
    // 'test194.txml',
    // 'test198.txml',
    // 'test199.txml',
    'test200.txml',
    'test201.txml',
    // 'test205.txml',
    // 'test207.txml',
    // 'test208.txml',
    // 'test210.txml',
    // 'test215.txml',
    // 'test216.txml',
    // 'test220.txml',
    // 'test223.txml',
    // 'test224.txml',
    // 'test225.txml',
    // 'test226.txml',
    // 'test228.txml',
    // 'test229.txml',
    // 'test230.txml',
    // 'test232.txml',
    // 'test233.txml',
    // 'test234.txml',
    // 'test235.txml',
    // 'test236.txml',
    // 'test237.txml',
    // 'test239.txml',
    // 'test240.txml',
    // 'test241.txml',
    // 'test242.txml',
    // 'test243.txml',
    // 'test244.txml',
    // 'test245.txml',
    // 'test247.txml',
    // 'test250.txml',
    // 'test252.txml',
    // 'test253.txml',
    // 'test276.txml',
    // 'test277.txml',
    // 'test278.txml',
    // 'test279.txml',
    // 'test280.txml',
    // 'test286.txml',
    'test287.txml',
    // 'test294.txml',
    // 'test298.txml',
    // 'test302.txml',
    // 'test303-1.txml',
    // 'test303-2.txml',
    // 'test303.txml',
    // 'test304.txml',
    // 'test307.txml',
    // 'test309.txml',
    // 'test310.txml',
    // 'test311.txml',
    // 'test312.txml',
    // 'test313.txml',
    // 'test314.txml',
    'test318.txml',
    // 'test319.txml',
    // 'test321.txml',
    // 'test322.txml',
    // 'test323.txml',
    // 'test324.txml',
    // 'test325.txml',
    // 'test326.txml',
    // 'test329.txml',
    // 'test330.txml',
    'test331.txml',
    // 'test332.txml',
    'test333.txml',
    'test335.txml',
    'test336.txml',
    'test337.txml',
    // 'test338.txml',
    'test339.txml',
    'test342.txml',
    // 'test343.txml',
    // 'test344.txml',
    // 'test346.txml',
    // 'test347.txml',
    'test348.txml',
    'test349.txml',
    // 'test350.txml',
    // 'test351.txml',
    // 'test352.txml',
    // 'test354.txml',
    'test355.txml',
    // 'test364.txml',
    // 'test372.txml',
    // 'test375.txml',
    // 'test376.txml',
    // 'test377.txml',
    // 'test378.txml',
    // 'test387.txml',
    // 'test388.txml',
    'test396.txml',
    // 'test399.txml',
    // 'test401.txml',
    // 'test402.txml',
    'test403a.txml',
    // 'test403b.txml',
    // 'test403c.txml',
    'test404.txml',
    'test405.txml',
    'test406.txml',
    'test407.txml',
    'test409.txml',
    // 'test411.txml',
    // 'test412.txml',
    // 'test413.txml',
    'test416.txml',
    'test417.txml',
    'test419.txml',
    'test421.txml',
    // 'test422.txml',
    // 'test423.txml',
    // 'test436.txml',
    // 'test444.txml',
    'test445.txml',
    // 'test446.txml',
    // 'test448.txml',
    'test449.txml',
    // 'test451.txml',
    // 'test452.txml',
    'test453.txml',
    // 'test456.txml',
    // 'test457.txml',
    // 'test459.txml',
    // 'test460.txml',
    // 'test487.txml',
    // 'test488.txml',
    // 'test495.txml',
    // 'test496.txml',
    // 'test500.txml',
    // 'test501.txml',
    'test503.txml',
    // 'test504.txml',
    // 'test505.txml',
    // 'test506.txml',
    // 'test521.txml',
    // 'test525.txml',
    // 'test527.txml',
    // 'test528.txml',
    // 'test529.txml',
    // 'test530.txml',
    // 'test533.txml',
    // 'test550.txml',
    // 'test551.txml',
    // 'test552.txml',
    // 'test553.txml',
    // 'test554.txml',
    // 'test557.txml',
    // 'test558.txml',
    // 'test560.txml',
    // 'test561.txml',
    // 'test562.txml',
    // 'test569.txml',
    'test570.txml'
    // 'test576.txml'
    // 'test578.txml',
    // 'test579.txml',
    // 'test580.txml',
  ]
};

const overrides = {
  'assign-current-small-step': [
    // original using <script/> to manipulate datamodel
    'test0'
  ]
};

interface SCIONTest {
  initialConfiguration: string[];
  events: Array<{
    after?: number;
    event: { name: string };
    nextConfiguration: string[];
  }>;
}

async function runW3TestToCompletion(machine: StateNode): Promise<void> {
  await new Promise((resolve, reject) => {
    let nextState: State<any>;

    interpret(machine)
      .onTransition(state => {
        nextState = state;
      })
      .onDone(() => {
        if (nextState.value === 'pass') {
          resolve();
        } else {
          reject(new Error('Reached "fail" state.'));
        }
      })
      .start();
  });
}

async function runTestToCompletion(
  machine: StateNode,
  test: SCIONTest
): Promise<void> {
  if (!test.events.length && test.initialConfiguration[0] === 'pass') {
    await runW3TestToCompletion(machine);
    return;
  }

  const resolvedStateValue = pathsToStateValue(
    test.initialConfiguration.map(id => machine.getStateNodeById(id).path)
  );

  let done = false;
  let nextState: State<any>;
  const service = interpret(machine, {
    clock: new SimulatedClock()
  })
    .onTransition(state => {
      nextState = state;
    })
    .onDone(() => {
      done = true;
    })
    .start(resolvedStateValue);

  test.events.forEach(({ event, nextConfiguration, after }) => {
    if (done) {
      return;
    }
    if (after) {
      (service.clock as SimulatedClock).increment(after);
    }
    service.send(event.name);

    const stateIds = machine
      .getStateNodes(nextState)
      .map(stateNode => stateNode.id);

    expect(stateIds).toContain(nextConfiguration[0]);
  });
}

describe('scxml', () => {
  const testGroupKeys = Object.keys(testGroups);
  // const testGroupKeys = ['scxml-prefix-event-name-matching'];

  testGroupKeys.forEach(testGroupName => {
    testGroups[testGroupName].forEach(testName => {
      const scxmlSource =
        overrides[testGroupName] &&
        overrides[testGroupName].indexOf(testName) !== -1
          ? `./fixtures/scxml/${testGroupName}/${testName}.scxml`
          : `${TEST_FRAMEWORK}/test/${testGroupName}/${testName}.scxml`;
      const scxmlDefinition = fs.readFileSync(
        path.resolve(__dirname, scxmlSource),
        { encoding: 'utf-8' }
      );
      const scxmlTest = JSON.parse(
        fs.readFileSync(
          path.resolve(
            __dirname,
            `${TEST_FRAMEWORK}/test/${testGroupName}/${testName}.json`
          ),
          { encoding: 'utf-8' }
        )
      ) as SCIONTest;

      it(`${testGroupName}/${testName}`, async () => {
        const machine = toMachine(scxmlDefinition, {
          delimiter: '$'
        });

        // console.dir(machine.config, { depth: null });
        await runTestToCompletion(machine, scxmlTest);
      });
    });
  });
});
