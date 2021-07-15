# @xstate/test

This package contains utilities for facilitating [model-based testing](https://en.wikipedia.org/wiki/Model-based_testing) for any software.

- **Talk**: [Write Fewer Tests! From Automation to Autogeneration](https://slides.com/davidkhourshid/mbt) at React Rally 2019 ([🎥 Video](https://www.youtube.com/watch?v=tpNmPKjPSFQ))

## Quick Start

1. Install `xstate` and `@xstate/test`:

```bash
npm install xstate @xstate/test
```

2. Create the machine that will be used to model the system under test (SUT):

```js
import { createMachine } from 'xstate';

const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      on: {
        TOGGLE: 'active'
      }
    },
    active: {
      on: {
        TOGGLE: 'inactive'
      }
    }
  }
});
```

3. Add assertions for each state in the machine (in this example, using [Puppeteer](https://github.com/GoogleChrome/puppeteer)):

```js
// ...

const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      on: {
        /* ... */
      },
      meta: {
        test: async (page) => {
          await page.waitFor('input:checked');
        }
      }
    },
    active: {
      on: {
        /* ... */
      },
      meta: {
        test: async (page) => {
          await page.waitFor('input:not(:checked)');
        }
      }
    }
  }
});
```

4. Create the model:

```js
import { createMachine } from 'xstate';
import { createModel } from '@xstate/test';

const toggleMachine = createMachine(/* ... */);

const toggleModel = createModel(toggleMachine).withEvents({
  TOGGLE: {
    exec: async (page) => {
      await page.click('input');
    }
  }
});
```

5. Create test plans and run the tests with coverage:

```js
// ...

describe('toggle', () => {
  const testPlans = toggleModel.getShortestPathPlans();

  testPlans.forEach((plan) => {
    describe(plan.description, () => {
      plan.paths.forEach((path) => {
        it(path.description, async () => {
          // do any setup, then...

          await path.test(page);
        });
      });
    });
  });

  it('should have full coverage', () => {
    return toggleModel.testCoverage();
  });
});
```

## API

### `createModel(machine, options?)`

Creates an abstract testing model based on the `machine` passed in.

| Argument   | Type             | Description                                    |
| ---------- | ---------------- | ---------------------------------------------- |
| `machine`  | StateMachine     | The machine used to create the abstract model. |
| `options?` | TestModelOptions | Options to customize the abstract model        |

**Returns**

A `TestModel` instance.

**Methods**

#### `model.withEvents(eventsMap)`

Provides testing details for each event. Each key in `eventsMap` is an object whose keys are event types and properties describe the execution and test cases for each event:

- `exec` (function): Function that executes the events. It is given two arguments:
  - `testContext` (any): any contextual testing data
  - `event` (EventObject): the event sent by the testing model
- `cases?` (EventObject[]): the sample event objects for this event type that can be sent by the testing model.

**Example**

```js
const toggleModel = createModel(toggleMachine).withEvents({
  TOGGLE: {
    exec: async (page) => {
      await page.click('input');
    }
  }
});
```

### `testModel.getShortestPathPlans(options?)`

Returns an array of testing plans based on the shortest paths from the test model's initial state to every other reachable state.

**Options**

| Argument | Type     | Description                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `filter` | function | Takes in the `state` and returns `true` if the state should be traversed, or `false` if traversal should stop. |

This is useful for preventing infinite traversals and stack overflow errors:

```js
const todosModel = createModel(todosMachine).withEvents({
  /* ... */
});

const plans = todosModel.getShortestPathPlans({
  // Tell the algorithm to limit state/event adjacency map to states
  // that have less than 5 todos
  filter: (state) => state.context.todos.length < 5
});
```

### `testModel.getShortestPathPlansTo(options?)`

Returns an array of testing plans based on the shortest paths from the test model's initial state to a given state specified by the `stateValue`.

**Options**

| Argument | Type     | Description                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `stateValue` | string or function | Specifies a target state or a filter function which takes in the `state` and returns `true` if the state should be targeted |

```js
const todosModel = createModel(todosMachine).withEvents({
  /* ... */
});

const plans = todosModel.getShortestPathPlansTo({
  filter: (state) => state.matches('TODO.DELETE')
});

// Equivalent:
const plans = todosModel.getShortestPathPlansTo('TODO.DELETE');
```

### `testModel.getSimplePathPlans(options?)`

Returns an array of testing plans based on the simple paths from the test model's initial state to every other reachable state.

**Options**

| Argument | Type     | Description                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `filter` | function | Takes in the `state` and returns `true` if the state should be traversed, or `false` if traversal should stop. |

### `testModel.getSimplePathPlansTo(options?)`

Returns an array of testing plans based on the simple paths from the test model's initial state to a given state specified by the `stateValue`.

**Options**

| Argument | Type     | Description                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `stateValue` | string or function | Specifies a target state or a filter function which takes in the `state` and returns `true` if the state should be targeted. |

```js
const todosModel = createModel(todosMachine).withEvents({
  /* ... */
});

const plans = todosModel.getSimplePathPlansTo({
  filter: (state) => state.matches('TODO.DELETE')
});

// Equivalent:
const plans = todosModel.getSimplePathPlansTo('TODO.DELETE');
```

### `testModel.testCoverage(options?)`

Tests that all state nodes were covered (traversed) in the exected tests.

**_Options_**

| Argument | Type     | Description                                                                               |
| -------- | -------- | ----------------------------------------------------------------------------------------- |
| `filter` | function | Takes in each `stateNode` and returns `true` if that state node should have been covered. |

```js
// Only test coverage for state nodes with a `.meta` property defined:

testModel.testCoverage({
  filter: (stateNode) => !!stateNode.meta
});
```

### `testPlan.description`

The string description of the testing plan, describing the goal of reaching the `testPlan.state`.

### `testPlan.paths`

The testing paths to get from the test model's initial state to every other reachable state.

### `testPath.description`

The string description of the testing path, describing a sequence of events that will reach the `testPath.state`.

### `testPath.test(testContext)`

Executes each step in `testPath.segments` by:

1. Verifying that the SUT is in `segment.state`
2. Executing the event for `segment.event`

And finally, verifying that the SUT is in the target `testPath.state`.

NOTE: If your model has nested states, the `meta.test` method for each parent state of that nested state is also executed when verifying that the SUT is in that nested state.
