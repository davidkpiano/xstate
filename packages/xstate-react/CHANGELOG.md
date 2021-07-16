# Changelog

## 1.5.1

### Patch Changes

- [`453acacb`](https://github.com/statelyai/xstate/commit/453acacbec364531a2851f183c3ab446d7db0e84) [#2389](https://github.com/statelyai/xstate/pull/2389) Thanks [@davidkpiano](https://github.com/davidkpiano)! - An internal issue where the `spawnBehavior` import for the `useSpawn(...)` hook was broken internally has been fixed.

## 1.5.0

### Minor Changes

- [`432b60f7`](https://github.com/statelyai/xstate/commit/432b60f7bcbcee9510e0d86311abbfd75b1a674e) [#2280](https://github.com/statelyai/xstate/pull/2280) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Just like `useInvoke(...)`, other types of actors can now be spawned from _behaviors_ using `useSpawn(...)`:

  ```tsx
  import { fromReducer } from 'xstate/lib/behaviors';
  import { useActor, useSpawn } from '@xstate/react';

  type CountEvent = { type: 'INC' } | { type: 'DEC' };

  const countBehavior = fromReducer(
    (count: number, event: CountEvent): number => {
      if (event.type === 'INC') {
        return count + 1;
      } else if (event.type === 'DEC') {
        return count - 1;
      }

      return count;
    },
    0 // initial state
  );

  const countMachine = createMachine({
    invoke: {
      id: 'count',
      src: () => fromReducer(countReducer, 0)
    },
    on: {
      INC: {
        actions: forwardTo('count')
      },
      DEC: {
        actions: forwardTo('count')
      }
    }
  });

  const Component = () => {
    const countActorRef = useSpawn(countBehavior);
    const [count, send] = useActor(countActorRef);

    return (
      <div>
        Count: {count}
        <button onClick={() => send({ type: 'INC' })}>Increment</button>
        <button onClick={() => send({ type: 'DEC' })}>Decrement</button>
      </div>
    );
  };
  ```

## 1.4.0

### Minor Changes

- [`849ec56c`](https://github.com/davidkpiano/xstate/commit/849ec56c2a9db34e65a30af94e68a7a7a50b4158) [#2286](https://github.com/davidkpiano/xstate/pull/2286) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `useService(...)` hook will be deprecated, since services are also actors. In future versions, the `useActor(...)` hook should be used instead:

  ```diff
  -const [state, send] = useService(service);
  +const [state, send] = useActor(service);
  ```

### Patch Changes

- [`ea3aaffb`](https://github.com/davidkpiano/xstate/commit/ea3aaffb906b34a42bb2736c7b91d54ffe9ed882) [#2326](https://github.com/davidkpiano/xstate/pull/2326) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `send` type returned in the tuple from `useActor(someService)` was an incorrect `never` type; this has been fixed.

## 1.3.4

### Patch Changes

- [`aa3c2991`](https://github.com/davidkpiano/xstate/commit/aa3c29916b7382fbcf1a3efb183ca1e8eb625480) [#2223](https://github.com/davidkpiano/xstate/pull/2223) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Support for actor refs with the `.getSnapshot()` method (added for spawned actors in XState version 4.19) is now supported in the `useActor(...)` hook.

## 1.3.3

### Patch Changes

- [`27e7242c`](https://github.com/davidkpiano/xstate/commit/27e7242c24146de85cf618a658b400a3241fa7d7) [#2112](https://github.com/davidkpiano/xstate/pull/2112) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `executeEffect` function is no longer exported (was meant to be internal and is useless as a public function anyway). This also fixes a circular dependency issue.

## 1.3.2

### Patch Changes

- [`bb5e81ea`](https://github.com/davidkpiano/xstate/commit/bb5e81eaa1ecba1fd54a7677ce9eaee9bd695964) [#2050](https://github.com/davidkpiano/xstate/pull/2050) Thanks [@theKashey](https://github.com/theKashey)! - Added an explicit entrypoint for `@xstate/react/fsm` which you can use instead of `@xstate/react/lib/fsm`. This is the only specifier that will be supported in the future - the other one will be dropped in the next major version.

  ```diff
  -import { useMachine } from '@xstate/react/lib/fsm'
  +import { useMachine } from '@xstate/react/fsm'
  ```

## 1.3.1

### Patch Changes

- [`b076b253`](https://github.com/davidkpiano/xstate/commit/b076b25364224874f62e8065892be40dfbb28030) [#1947](https://github.com/davidkpiano/xstate/pull/1947) Thanks [@lukekarrys](https://github.com/lukekarrys)! - Fix typing of the service returned from the fsm useMachine hook by passing it Typestate

* [`9b5dc784`](https://github.com/davidkpiano/xstate/commit/9b5dc7843c44f50bcca0ffccb843b3d50cef6ddc) [#1950](https://github.com/davidkpiano/xstate/pull/1950) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with `toObserver` being internally imported from `xstate/lib/utils` which has broken UMD build and the declared peer dep contract.

## 1.3.0

### Minor Changes

- [`577ae023`](https://github.com/davidkpiano/xstate/commit/577ae02384926b49e876011c4393f212b49066f8) [#1915](https://github.com/davidkpiano/xstate/pull/1915) Thanks [@davidkpiano](https://github.com/davidkpiano)! - New hook: `useInterpret(machine)`, which is a low-level hook that interprets the `machine` and returns the `service`:

  ```js
  import { useInterpret } from '@xstate/react';
  import { someMachine } from '../path/to/someMachine';

  const App = () => {
    const service = useInterpret(someMachine);

    // ...
  };
  ```

* [`577ae023`](https://github.com/davidkpiano/xstate/commit/577ae02384926b49e876011c4393f212b49066f8) [#1915](https://github.com/davidkpiano/xstate/pull/1915) Thanks [@davidkpiano](https://github.com/davidkpiano)! - New hook: `useSelector(actor, selector)`, which subscribes to `actor` and returns the selected state derived from `selector(snapshot)`:

  ```js
  import { useSelector } from '@xstate/react';

  const App = ({ someActor }) => {
    const count = useSelector(someActor, (state) => state.context.count);

    // ...
  };
  ```

## 1.2.2

### Patch Changes

- [`4b31cefb`](https://github.com/davidkpiano/xstate/commit/4b31cefb3d3497e5515314046639df7e27dbe9e8) [#1780](https://github.com/davidkpiano/xstate/pull/1780) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with some external packages not being bundled correctly into the UMD bundles.

## 1.2.1

### Patch Changes

- [`a16a5f2f`](https://github.com/davidkpiano/xstate/commit/a16a5f2ff5ba9d4d7834ec3ca2d0adecf5d6a870) [#1756](https://github.com/davidkpiano/xstate/pull/1756) Thanks [@dimitardanailov](https://github.com/dimitardanailov)! - Fixed an issue with `process` references not being removed correctly from the UMD bundles.

## 1.2.0

### Minor Changes

- [`dd98296e`](https://github.com/davidkpiano/xstate/commit/dd98296e9fcbae905da2395e67e876e28be7c774) [#1738](https://github.com/davidkpiano/xstate/pull/1738) Thanks [@dimitardanailov](https://github.com/dimitardanailov)! - Added UMD bundle.

## 1.1.0

### Minor Changes

- [`89f9c27c`](https://github.com/davidkpiano/xstate/commit/89f9c27c453dc56bdfdf49c8ea1f0f87ff1f9b67) [#1622](https://github.com/davidkpiano/xstate/pull/1622) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Spawned/invoked actors and interpreters are now typed as extending `ActorRef` rather than `Actor` or `Interpreter`. This unification of types should make it more straightforward to provide actor types in React:

  ```ts
  import { ActorRef } from 'xstate';
  import { useActor } from '@xstate/react';

  const Child: React.FC<{ actorRef: ActorRef<SomeEvent, SomeEmitted> }> = ({
    actorRef
  }) => {
    // `state` is typed as `SomeEmitted`
    // `send` can be called with `SomeEvent` values
    const [state, send] = useActor(actorRef);

    // . ..
  };
  ```

  It's also easier to specify the type of a spawned/invoked machine with `ActorRefFrom`:

  ```ts
  import { createMachine, ActorRefFrom } from 'xstate';
  import { useActor } from '@xstate/react';

  const someMachine = createMachine<SomeContext, SomeEvent>({
    // ...
  });

  const Child: React.FC<{ someRef: ActorRefFrom<typeof someMachine> }> = ({
    someRef
  }) => {
    // `state` is typed as `State<SomeContext, SomeEvent>`
    // `send` can be called with `SomeEvent` values
    const [state, send] = useActor(someRef);

    // . ..
  };
  ```

## 1.0.3

### Patch Changes

- [`27db2950`](https://github.com/davidkpiano/xstate/commit/27db295064d42cacb89ff10d55f39eb7609148e1) [#1636](https://github.com/davidkpiano/xstate/pull/1636) Thanks [@Andarist](https://github.com/Andarist)! - Allow React 17 in the specified peer dependency range.

## 1.0.2

### Patch Changes

- [`c7927083`](https://github.com/davidkpiano/xstate/commit/c7927083a651e3c51952ade2ffda793df0391bf6) [#1516](https://github.com/davidkpiano/xstate/pull/1516) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `send` function returned from the `useService()` now can take two arguments (an event type and payload), to match the behavior of `@xstate/react` version 0.x.

* [`db77623a`](https://github.com/davidkpiano/xstate/commit/db77623a48955d762cffa9b624f438220add5eed) [#1516](https://github.com/davidkpiano/xstate/pull/1516) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `send` value returned from the `useService()` hook will now accept a payload, which matches the signature of the `send` value returned from the `useMachine()` hook:

  ```js
  const [state, send] = useService(someService);

  // ...

  // this is OK:
  send('ADD', { value: 3 });

  // which is equivalent to:
  send({ type: 'ADD', value: 3 });
  ```

- [`93f6db02`](https://github.com/davidkpiano/xstate/commit/93f6db02a2d56ec997198ddef0af3d7730bb79bb) [#1594](https://github.com/davidkpiano/xstate/pull/1594) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with internal `setState` in `useService` being called with 2 arguments instead of 1.

* [`72b0880e`](https://github.com/davidkpiano/xstate/commit/72b0880e6444ae009adca72088872bb5c0760ce3) [#1504](https://github.com/davidkpiano/xstate/pull/1504) Thanks [@Andarist](https://github.com/Andarist)! - Fixed issue with `useService` returning an initial state for services in their final states.

## 1.0.1

### Patch Changes

- [`c0bd0407`](https://github.com/davidkpiano/xstate/commit/c0bd040767dcac20ed690e49a8725b4f1011dd5d) [#1493](https://github.com/davidkpiano/xstate/pull/1493) Thanks [@davidkpiano](https://github.com/davidkpiano)! - There will now be a descriptive error when trying to use an actor-like object in the `useService()` hook, where `useActor()` should be preferred:

  > Attempted to use an actor-like object instead of a service in the useService() hook. Please use the useActor() hook instead.

All notable changes to this project will be documented in this file.

## [1.0.0-rc.7]

- The `machine` passed into `useMachine(machine)` can now be passed in lazily:

  ```js
  const [state, send] = useMachine(() => createMachine(/* ... */));

  // ...
  ```

  This has the benefit of avoiding unnecessary machine initializations whenever the component rerenders.

- The `useActor` hook now takes a second argument: `getSnapshot` which is a function that should return the last emitted value:

  ```js
  const [state, send] = useActor(someActor, (actor) => actor.current);
  ```

## [1.0.0-rc.6]

## [1.0.0-rc.5]

- You can now schedule actions in `useEffect` or `useLayoutEffect` via:
  - `asEffect` - queues the action to be executed in `useEffect`
  - `asLayoutEffect` - queues the action to be executed in `useLayoutEffect`

```jsx
import { createMachine } from 'xstate';
import { useMachine, asEffect } from '@xstate/react';

const machine = createMachine({
  initial: 'focused',
  states: {
    focused: {
      entry: 'focus'
    }
  }
});

const Input = () => {
  const inputRef = useRef(null);
  const [state, send] = useMachine(machine, {
    actions: {
      focus: asEffect(() => {
        inputRef.current && inputRef.current.focus();
      })
    }
  });

  return <input ref={inputRef} />;
};
```

## [0.8.1]

- Services are now kept up to date

## [0.8.0]

- The `useActor()` hook is now available.
- Support for persisted states

## [0.7.1]

- Actions passed into `useMachine(..., { actions: { ... } })` will now be kept up-to-date and no longer reference stale data.

## [0.7.0]

### Added

- Machine configuration can now be merged into the options argument of `useMachine(machine, options)`. The following Machine Config options are available: `guards`, `actions`, `activities`, `services`, `delays` and `updates` (NOTE: `context` option is not implemented yet, use `withContext` or `withConfig` instead for the meantime)

```js
const [current, send] = useMachine(someMachine, {
  actions: {
    doThing: doTheThing
  },
  services: {
    /* ... */
  },
  guards: {
    /* ... */
  }
  // ... etc.
});
```
