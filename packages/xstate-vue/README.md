# @xstate/vue

[[toc]]

::: warning Vue 2 Notice:
If you're using Vue 2.x, please see [the Vue recipe](../../recipes/vue.html) instead, or use the [`xstate-vue2` package](https://github.com/ChrisShank/xstate-vue2) if you want to use the Vue Composition API.
:::

## Quick Start

1. Install `xstate` and `@xstate/vue`:

```bash
npm i xstate @xstate/vue
```

**Via CDN**

```html
<script src="https://unpkg.com/@xstate/vue/dist/xstate-vue.min.js"></script>
```

By using the global variable `XStateVue`

or

```html
<script src="https://unpkg.com/@xstate/vue/dist/xstate-vue.fsm.min.js"></script>
```

By using the global variable `XStateVueFSM`

2. Import the `useMachine` composition function:

```vue
<template>
  <button @click="send('TOGGLE')">
    {{
      state.value === 'inactive'
        ? 'Click to activate'
        : 'Active! Click to deactivate'
    }}
  </button>
</template>

<script>
import { useMachine } from '@xstate/vue';
import { createMachine } from 'xstate';

const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      on: { TOGGLE: 'active' }
    },
    active: {
      on: { TOGGLE: 'inactive' }
    }
  }
});

export default {
  setup() {
    const { state, send } = useMachine(toggleMachine);
    return {
      state,
      send
    };
  }
};
</script>
```

## API

### `useMachine(machine, options?)`

A [Vue composition function](https://v3.vuejs.org/guide/composition-api-introduction.html) that interprets the given `machine` and starts a service that runs for the lifetime of the component.

**Arguments**

- `machine` - An [XState machine](https://xstate.js.org/docs/guides/machines.html).
- `options` (optional) - [Interpreter options](https://xstate.js.org/docs/guides/interpretation.html#options) OR one of the following Machine Config options: `guards`, `actions`, `activities`, `services`, `delays`, `immediate`, `context`, or `state`.

**Returns** `{ state, send, service}`:

- `state` - Represents the current state of the machine as an XState `State` object.
- `send` - A function that sends events to the running service.
- `service` - The created service.

### `useService(service)`

A [Vue composition function](https://v3.vuejs.org/guide/composition-api-introduction.html) that subscribes to state changes from an existing [service](https://xstate.js.org/docs/guides/interpretation.html).

**Arguments**

- `service` - An [XState service](https://xstate.js.org/docs/guides/communication.html).

**Returns** `{state, send}`:

- `state` - Represents the current state of the service as an XState `State` object.
- `send` - A function that sends events to the running service.

### `useActor(actor, getSnapshot)`

A [Vue composition function](https://v3.vuejs.org/guide/composition-api-introduction.html) that subscribes to emitted changes from an existing [actor](https://xstate.js.org/docs/guides/actors.html).

_Since 0.5.0_

**Arguments**

- `actor` - an actor-like object that contains `.send(...)` and `.subscribe(...)` methods.
- `getSnapshot` - a function that should return the latest emitted value from the `actor`.
  - Defaults to attempting to get the `actor.state`, or returning `undefined` if that does not exist.

```js
import { useActor } from '@xstate/vue';

export default {
  props: ['someSpawnedActor'],
  setup(props) {
    const { state, send } = useActor(props.someSpawnedActor);
    return { state, send };
  }
};
```

### `useInterpret(machine, options?, observer?)`

A [Vue composition function](https://v3.vuejs.org/guide/composition-api-introduction.html) that returns the `service` created from the `machine` with the `options`, if specified. It also sets up a subscription to the `service` with the `observer`, if provided.

_Since 0.5.0_

**Arguments**

- `machine` - An [XState machine](https://xstate.js.org/docs/guides/machines.html) or a function that lazily returns a machine.
- `options` (optional) - [Interpreter options](https://xstate.js.org/docs/guides/interpretation.html#options) and/or any of the following machine config options: `guards`, `actions`, `services`, `delays`, `immediate`, `context`, `state`.
- `observer` (optional) - an observer or listener that listens to state updates:
  - an observer (e.g., `{ next: (state) => {/* ... */} }`)
  - or a listener (e.g., `(state) => {/* ... */}`)

```js
import { useInterpret } from '@xstate/vue';
import { someMachine } from '../path/to/someMachine';
export default {
  setup() {
    const service = useInterpret(someMachine);
    return service;
  }
};
```

With options + listener:

```js
import { useInterpret } from '@xstate/vue';
import { someMachine } from '../path/to/someMachine';
export default {
  setup() {
    const service = useInterpret(
      someMachine,
      {
        actions: {
          /* ... */
        }
      },
      (state) => {
        // subscribes to state changes
        console.log(state.value);
      }
    );
    // ...
  }
};
```

### `useSelector(actor, selector, compare?, getSnapshot?)`

A [Vue composition function](https://v3.vuejs.org/guide/composition-api-introduction.html) that returns the selected value from the snapshot of an `actor`, such as a service. This hook will only cause a rerender if the selected value changes, as determined by the optional `compare` function.

_Since 0.6.0_

**Arguments**

- `actor` - a service or an actor-like object that contains `.send(...)` and `.subscribe(...)` methods.
- `selector` - a function that takes in an actor's "current state" (snapshot) as an argument and returns the desired selected value.
- `compare` (optional) - a function that determines if the current selected value is the same as the previous selected value.
- `getSnapshot` (optional) - a function that should return the latest emitted value from the `actor`.
  - Defaults to attempting to get the `actor.state`, or returning `undefined` if that does not exist. Will automatically pull the state from services.

```js
import { useSelector } from '@xstate/vue';

const selectCount = (state) => state.context.count;

export default {
  props: ['service'],
  setup(props) {
    const count = useSelector(props.service, selectCount);
    // ...
    return { count };
  }
};
```

With `compare` function:

```js
import { useSelector } from '@xstate/vue';

const selectUser = (state) => state.context.user;
const compareUser = (prevUser, nextUser) => prevUser.id === nextUser.id;

export default {
  props: ['service'],
  setup(props) {
    const user = useSelector(props.service, selectUser, compareUser);
    // ...
    return { user };
  }
};
```

With `useInterpret(...)`:

```js
import { useInterpret, useSelector } from '@xstate/vue';
import { someMachine } from '../path/to/someMachine';

const selectCount = (state) => state.context.count;

export default {
  setup() {
    const service = useInterpret(someMachine);
    const count = useSelector(service, selectCount);
    // ...
    return { count, service };
  }
};
```

### `useMachine(machine)` with `@xstate/fsm`

A [Vue composition function](https://v3.vuejs.org/guide/composition-api-introduction.html) that interprets the given finite state `machine` from [`@xstate/fsm`] and starts a service that runs for the lifetime of the component.

This special `useMachine` hook is imported from `@xstate/vue/fsm`

**Arguments**

- `machine` - An [XState finite state machine (FSM)](https://xstate.js.org/docs/packages/xstate-fsm/).

**Returns** an object `{state, send, service}`:

- `state` - Represents the current state of the machine as an `@xstate/fsm` `StateMachine.State` object.
- `send` - A function that sends events to the running service.
- `service` - The created `@xstate/fsm` service.

**Example** (TODO)

## Configuring Machines

Existing machines can be configured by passing the machine options as the 2nd argument of `useMachine(machine, options)`.

Example: the `'fetchData'` service and `'notifySuccess'` action are both configurable:

```vue
<template>
  <template v-if="state.value === 'idle'">
    <button @click="send('FETCH', { query: 'something' })">
      Search for something
    </button>
  </template>

  <template v-else-if="state.value === 'loading'">
    <div>Searching...</div>
  </template>

  <template v-else-if="state.value === 'success'">
    <div>Success! {{ state.context.data }}</div>
  </template>

  <template v-else-if="state.value === 'failure'">
    <p>{{ state.context.error.message }}</p>
    <button @click="send('RETRY')">Retry</button>
  </template>
</template>

<script>
import { assign, createMachine } from 'xstate';
import { useMachine } from '@xstate/vue';

const fetchMachine = createMachine({
  id: 'fetch',
  initial: 'idle',
  context: {
    data: undefined,
    error: undefined
  },
  states: {
    idle: {
      on: { FETCH: 'loading' }
    },
    loading: {
      invoke: {
        src: 'fetchData',
        onDone: {
          target: 'success',
          actions: assign({
            data: (_context, event) => event.data
          })
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: (_context, event) => event.data
          })
        }
      }
    },
    success: {
      entry: 'notifySuccess',
      type: 'final'
    },
    failure: {
      on: {
        RETRY: 'loading'
      }
    }
  }
});

export default {
  props: {
    onResolve: {
      type: Function,
      default: () => {}
    }
  },
  setup(props) {
    const { state, send } = useMachine(fetchMachine, {
      actions: {
        notifySuccess: (ctx) => props.onResolve(ctx.data)
      },
      services: {
        fetchData: (_context, event) =>
          fetch(`some/api/${event.query}`).then((res) => res.json())
      }
    });
    return {
      state,
      send
    };
  }
};
</script>
```

## Matching States

For [hierarchical](https://xstate.js.org/docs/guides/hierarchical.html) and [parallel](https://xstate.js.org/docs/guides/parallel.html) machines, the state values will be objects, not strings. In this case, it's better to use [`state.matches(...)`](https://xstate.js.org/docs/guides/states.html#state-methods-and-getters):

```vue
<template>
  <div>
    <loader-idle v-if="state.matches('idle')" />
    <loader-loading-user v-if-else="state.matches({ loading: 'user' })" />
    <loader-loading-friends v-if-else="state.matches({ loading: 'friends' })" />
  </div>
</template>
```

## Persisted and Rehydrated State

You can persist and rehydrate state with `useMachine(...)` via `options.state`:

```vue
<script>
// Get the persisted state config object from somewhere, e.g. localStorage
const persistedState = JSON.parse(
  localStorage.getItem('some-persisted-state-key')
);

export default {
  setup() {
    const { state, send } = useMachine(someMachine, {
      state: persistedState
    });

    // state will initially be that persisted state, not the machine's initialState
    return { state, send };
  }
};
</script>
```

## Migration from 0.4.0

- For spawned actors created using `invoke` or `spawn(...)`, use the `useActor()` hook instead of `useService()`:

  ```diff
  -import { useService } from '@xstate/vue';
  +import { useActor } from '@xstate/vue';

  -const {state, send} = useService(someActor);
  +const {state, send} = useActor(someActor);
  ```
