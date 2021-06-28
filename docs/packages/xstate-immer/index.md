# @xstate/immer

<p align="center">
  <a href="https://xstate.js.org">
  <br />
  <img src="https://user-images.githubusercontent.com/1093738/79572515-1509e180-808b-11ea-92aa-10958521aa68.png" alt="XState Immer" width="200"/>
  <br />
    <sub><strong>XState with Immer</strong></sub>
  <br />
  <br />
  </a>
</p>

This package contains utilities for using [Immer](https://immerjs.github.io/immer/) with [XState](https://github.com/davidkpiano/xstate).

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Quick Start](#quick-start)
- [API](#api)
  - [`assign(recipe)`](#assignrecipe)
  - [`createUpdater(eventType, recipe)`](#createupdatereventtype-recipe)
- [TypeScript](#typescript)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Quick Start

Included in `@xstate/immer`:

- `assign()` - an Immer action that allows you to immutably assign to machine `context` in a convenient way
- `createUpdater()` - a useful function that allows you to cohesively define a context update event event creator and assign action, all together. ([See an example](#createupdatereventtype-recipe) below)

1. Install `immer`, `xstate`, `@xstate/immer`:

```bash
npm install immer xstate @xstate/immer
```

**Note:** You don't need to `import` anything from `immer`; it is a peer-dependency of `@xstate/immer`, so it must be installed.

2. Import the Immer utilities:

```js
import { createMachine, interpret } from 'xstate';
import { assign, createUpdater } from '@xstate/immer';

const levelUpdater = createUpdater('UPDATE_LEVEL', (ctx, { input }) => {
  ctx.level = input;
});

const toggleMachine = createMachine({
  id: 'toggle',
  context: {
    count: 0,
    level: 0
  },
  initial: 'inactive',
  states: {
    inactive: {
      on: {
        TOGGLE: {
          target: 'active',
          // Immutably update context the same "mutable"
          // way as you would do with Immer!
          actions: assign((ctx) => ctx.count++)
        }
      }
    },
    active: {
      on: {
        TOGGLE: {
          target: 'inactive'
        },
        // Use the updater for more convenience:
        [levelUpdater.type]: {
          actions: levelUpdater.action
        }
      }
    }
  }
});

const toggleService = interpret(toggleMachine)
  .onTransition((state) => {
    console.log(state.context);
  })
  .start();

toggleService.send('TOGGLE');
// { count: 1, level: 0 }

toggleService.send(levelUpdater.update(9));
// { count: 1, level: 9 }

toggleService.send('TOGGLE');
// { count: 2, level: 9 }

toggleService.send(levelUpdater.update(-100));
// Notice how the level is not updated in 'inactive' state:
// { count: 2, level: 9 }
```

## API

### `assign(recipe)`

Returns an XState event object that will update the machine's `context` to reflect the changes ("mutations") to `context` made in the `recipe` function.

The `recipe` is similar to the function that you would pass to [Immer's `produce(val, recipe)` function](https://immerjs.github.io/immer/produce/), with the addition that you get the same arguments as a normal XState assigner passed to `assign(assigner)` (`context`, `event`, `meta`).

**Arguments for `assign`:**

| Argument | Type     | Description                                                                                                             |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `recipe` | function | A function where "mutations" to `context` are made. See the [Immer docs](https://immerjs.github.io/immer/produce/). |

**Arguments for `recipe`:**

| Argument  | Type               | Description                                                              |
| --------- | ------------------ | ------------------------------------------------------------------------ |
| `context` | any                | The context data of the current state                                    |
| `event`   | event object       | The received event object                                                |
| `meta`    | assign meta object | An object containing meta data such as the `state`, SCXML `_event`, etc. |

```js
import { createMachine } from 'xstate';
import { assign } from '@xstate/immer';

const userMachine = createMachine({
  id: 'user',
  context: {
    name: null,
    address: {
      city: null,
      state: null,
      country: null
    }
  },
  initial: 'active',
  states: {
    active: {
      on: {
        CHANGE_COUNTRY: {
          actions: assign((context, event) => {
            context.address.country = event.value;
          })
        }
      }
    }
  }
});

const { initialState } = userMachine;

const nextState = userMachine.transition(initialState, {
  type: 'UPDATE_COUNTRY',
  country: 'USA'
});

nextState.context.address.country;
// => 'USA'
```

### `createUpdater(eventType, recipe)`

Returns an object that is useful for creating `context` updaters.

| Argument    | Type     | Description                                                                                         |
| ----------- | -------- | --------------------------------------------------------------------------------------------------- |
| `eventType` | string   | The event type for the Immer update event                                                           |
| `recipe`    | function | A function that takes in the `context` and an Immer update `event` object to "mutate" the `context` |

An Immer update `event` object is an object that contains:

- `type`: the `eventType` specified
- `input`: the "payload" of the update event

The object returned by `createUpdater(...)` is an updater object containing:

- `type`: the `eventType` passed into `createUpdater(eventType, ...)`. This is used for specifying transitions in which the update will occur.
- `action`: the assign action object that will update the `context`.
- `update`: the event creator that takes in the `input` and returns an `event` object with the specified `eventType` and `input` that will be passed to `recipe(context, event)`.

**⚠️ Note:** The `.update(...)` event creator is pure; it only returns an assign action object, and doesn't directly update `context`.

```js
import { createMachine } from 'xstate';
import { createUpdater } from '@xstate/immer';

// The second argument is an Immer update event that looks like:
// {
//   type: 'UPDATE_NAME',
//   input: 'David' // or any string
// }
const nameUpdater = createUpdater('UPDATE_NAME', (context, { input }) => {
  context.name = input;
});

const ageUpdater = createUpdater('UPDATE_AGE', (context, { input }) => {
  context.age = input;
});

const formMachine = createMachine({
  initial: 'editing',
  context: {
    name: '',
    age: null
  },
  states: {
    editing: {
      on: {
        // The updater.type can be used directly for transitions
        // where the updater.action function will be applied
        [nameUpdater.type]: { actions: nameUpdater.action },
        [ageUpdater.type]: { actions: ageUpdater.action }
      }
    }
  }
});

const service = interpret(formMachine)
  .onTransition((state) => {
    console.log(state.context);
  })
  .start();

// The event object sent will look like:
// {
//   type: 'UPDATE_NAME',
//   input: 'David'
// }
service.send(nameUpdater.update('David'));
// => { name: 'David', age: null }

// The event object sent will look like:
// {
//   type: 'UPDATE_AGE',
//   input: 100
// }
service.send(ageUpdater.update(100));
// => { name: 'David', age: 100 }
```

## TypeScript

To properly type the Immer `assign` action creator, pass in the `context` and `event` types as generic types:

```ts
import { assign } from '@xstate/immer';

interface SomeContext {
  name: string;
}

interface SomeEvent {
  type: 'SOME_EVENT';
  value: string;
}

// ...

{
  actions: assign<SomeContext, SomeEvent>((context, event) => {
    context.name = event.value;
    // ... etc.
  });
}
```

To properly type `createUpdater`, pass in the `context` and the specific `ImmerUpdateEvent<...>` (see below) types as generic types:

```ts
import { createUpdater, ImmerUpdateEvent } from '@xstate/immer';

interface SomeContext {
  name: string;
}

// This is the same as:
// {
//   type: 'UPDATE_NAME';
//   input: string;
// }
type NameUpdateEvent = ImmerUpdateEvent<'UPDATE_NAME', string>;

const nameUpdater = createUpdater<SomeContext, NameUpdateEvent>(
  'UPDATE_NAME',
  (ctx, { input }) => {
    ctx.name = input;
  }
);

// You should use NameUpdateEvent directly as part of the event type
// in createMachine<SomeContext, SomeEvent>.
```

Here is a fully typed example of the previous form example:

```ts
import { createMachine } from 'xstate';
import { createUpdater, ImmerUpdateEvent } from '@xstate/immer';

interface FormContext {
  name: string;
  age: number | undefined;
}

type NameUpdateEvent = ImmerUpdateEvent<'UPDATE_NAME', string>;
type AgeUpdateEvent = ImmerUpdateEvent<'UPDATE_AGE', number>;

const nameUpdater = createUpdater<FormContext, NameUpdateEvent>(
  'UPDATE_NAME',
  (ctx, { input }) => {
    ctx.name = input;
  }
);

const ageUpdater = createUpdater<FormContext, AgeUpdateEvent>(
  'UPDATE_AGE',
  (ctx, { input }) => {
    ctx.age = input;
  }
);

type FormEvent =
  | NameUpdateEvent
  | AgeUpdateEvent
  | {
      type: 'SUBMIT';
    };

const formMachine = createMachine<FormContext, FormEvent>({
  initial: 'editing',
  context: {
    name: '',
    age: undefined
  },
  states: {
    editing: {
      on: {
        [nameUpdater.type]: { actions: nameUpdater.action },
        [ageUpdater.type]: { actions: ageUpdater.action },
        SUBMIT: 'submitting'
      }
    },
    submitting: {
      // ...
    }
  }
});
```
