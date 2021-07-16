# xstate

## 5.0.0-next.0

### Major Changes

- [`7f3b8481`](https://github.com/statelyai/xstate/commit/7f3b84816564d951b6b29afdd7075256f1f59501) [#1045](https://github.com/statelyai/xstate/pull/1045) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - The third argument of `machine.transition(state, event)` has been removed. The `context` should always be given as part of the `state`.

  - There is a new method: `machine.microstep(state, event)` which returns the resulting intermediate `State` object that represents a single microstep being taken when transitioning from `state` via the `event`. This is the `State` that does not take into account transient transitions nor raised events, and is useful for debugging.

  - The `state.events` property has been removed from the `State` object, and is replaced internally by `state._internalQueue`, which represents raised events to be processed in a macrostep loop. The `state._internalQueue` property should be considered internal (not used in normal development).

  - The `state.historyValue` property now more closely represents the original SCXML algorithm, and is a mapping of state node IDs to their historic descendent state nodes. This is used for resolving history states, and should be considered internal.

  - The `stateNode.isTransient` property is removed from `StateNode`.

  - The `.initial` property of a state node config object can now contain executable content (i.e., actions):

  ```js
  // ...
  initial: {
    target: 'someTarget',
    actions: [/* initial actions */]
  }
  ```

  - Assign actions (via `assign()`) will now be executed "in order", rather than automatically prioritized. They will be evaluated after previously defined actions are evaluated, and actions that read from `context` will have those intermediate values applied, rather than the final resolved value of all `assign()` actions taken, which was the previous behavior.

  This shouldn't change the behavior for most state machines. To maintain the previous behavior, ensure that `assign()` actions are defined before any other actions.

* [`969a2f4f`](https://github.com/statelyai/xstate/commit/969a2f4fc0bc9147b9a52da25306e5c13b97f159) [#1669](https://github.com/statelyai/xstate/pull/1669) Thanks [@davidkpiano](https://github.com/davidkpiano)! - An error will be thrown if an `initial` state key is not specified for compound state nodes. For example:

  ```js
  const lightMachine = createMachine({
    id: 'light',
    initial: 'green',
    states: {
      green: {},
      yellow: {},
      red: {
        // Forgotten initial state:
        // initial: 'walk',
        states: {
          walk: {},
          wait: {}
        }
      }
    }
  });
  ```

  You will get the error:

  ```
  No initial state specified for state node "#light.red". Try adding { initial: "walk" } to the state config.
  ```

- [`c0a6dcaf`](https://github.com/statelyai/xstate/commit/c0a6dcafa1a11a5ff1660b57e0728675f155c292) [#2294](https://github.com/statelyai/xstate/pull/2294) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The machine's `context` is now restricted to an `object`. This was the most common usage, but now the typings prevent `context` from being anything but an object:

  ```ts
  const machine = createMachine({
    // This will produce the TS error:
    // "Type 'string' is not assignable to type 'object | undefined'"
    context: 'some string'
  });
  ```

  If `context` is `undefined`, it will now default to an empty object `{}`:

  ```ts
  const machine = createMachine({
    // No context
  });

  machine.initialState.context;
  // => {}
  ```

* [`172d6a7e`](https://github.com/statelyai/xstate/commit/172d6a7e1e4ab0fa73485f76c52675be8a1f3362) [#1260](https://github.com/statelyai/xstate/pull/1260) Thanks [@davidkpiano](https://github.com/davidkpiano)! - All generic types containing `TContext` and `TEvent` will now follow the same, consistent order:

  1. `TContext`
  2. `TEvent`
  3. ... All other generic types, including `TStateSchema,`TTypestate`, etc.

  ```diff
  -const service = interpret<SomeCtx, SomeSchema, SomeEvent>(someMachine);
  +const service = interpret<SomeCtx, SomeEvent, SomeSchema>(someMachine);
  ```

- [`31bc73e0`](https://github.com/statelyai/xstate/commit/31bc73e05692f29301f5bb5cb4b87b90773e0ef2) [#1808](https://github.com/statelyai/xstate/pull/1808) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Renamed `machine.withConfig(...)` to `machine.provide(...)`.

* [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6) [#878](https://github.com/statelyai/xstate/pull/878) Thanks [@Andarist](https://github.com/Andarist)! - Removed third parameter (context) from Machine's transition method. If you want to transition with a particular context value you should create appropriate `State` using `State.from`. So instead of this - `machine.transition('green', 'TIMER', { elapsed: 100 })`, you should do this - `machine.transition(State.from('green', { elapsed: 100 }), 'TIMER')`.

- [`145539c4`](https://github.com/statelyai/xstate/commit/145539c4cfe1bde5aac247792622428e44342dd6) [#1203](https://github.com/statelyai/xstate/pull/1203) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - The `execute` option for an interpreted service has been removed. If you don't want to execute actions, it's recommended that you don't hardcode implementation details into the base `machine` that will be interpreted, and extend the machine's `options.actions` instead. By default, the interpreter will execute all actions according to SCXML semantics (immediately upon transition).

  - Dev tools integration has been simplified, and Redux dev tools support is no longer the default. It can be included from `xstate/devTools/redux`:

  ```js
  import { interpret } from 'xstate';
  import { createReduxDevTools } from 'xstate/devTools/redux';

  const service = interpret(someMachine, {
    devTools: createReduxDevTools({
      // Redux Dev Tools options
    })
  });
  ```

  By default, dev tools are attached to the global `window.__xstate__` object:

  ```js
  const service = interpret(someMachine, {
    devTools: true // attaches via window.__xstate__.register(service)
  });
  ```

  And creating your own custom dev tools adapter is a function that takes in the `service`:

  ```js
  const myCustomDevTools = service => {
    console.log('Got a service!');

    service.subscribe(state => {
      // ...
    });
  };

  const service = interpret(someMachine, {
    devTools: myCustomDevTools
  });
  ```

  - These handlers have been removed, as they are redundant and can all be accomplished with `.onTransition(...)` and/or `.subscribe(...)`:

    - `service.onEvent()`
    - `service.onSend()`
    - `service.onChange()`

  - The `service.send(...)` method no longer returns the next state. It is a `void` function (fire-and-forget).

  - The `service.sender(...)` method has been removed as redundant. Use `service.send(...)` instead.

* [`3de36bb2`](https://github.com/statelyai/xstate/commit/3de36bb24e8f59f54d571bf587407b1b6a9856e0) [#953](https://github.com/statelyai/xstate/pull/953) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Support for getters as a transition target (instead of referencing state nodes by ID or relative key) has been removed.

  The `Machine()` and `createMachine()` factory functions no longer support passing in `context` as a third argument.

  The `context` property in the machine configuration no longer accepts a function for determining context (which was introduced in 4.7). This might change as the API becomes finalized.

  The `activities` property was removed from `State` objects, as activities are now part of `invoke` declarations.

  The state nodes will not show the machine's `version` on them - the `version` property is only available on the root machine node.

  The `machine.withContext({...})` method now permits providing partial context, instead of the entire machine context.

- [`9e10660e`](https://github.com/statelyai/xstate/commit/9e10660ec2f1e89cbb09a1094edb4f6b8a273a99) [#1443](https://github.com/statelyai/xstate/pull/1443) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `in: ...` property for transitions is removed and replaced with guards. It is recommended to use `stateIn()` and `stateNotIn()` guard creators instead:

  ```diff
  + import { stateIn } from 'xstate/guards';

  // ...
  on: {
    SOME_EVENT: {
      target: 'somewhere',
  -   in: '#someState'
  +   cond: stateIn('#someState')
    }
  }
  // ...
  ```

* [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175) [#1456](https://github.com/statelyai/xstate/pull/1456) Thanks [@davidkpiano](https://github.com/davidkpiano)! - There is now support for higher-level guards, which are guards that can compose other guards:

  - `and([guard1, guard2, /* ... */])` returns `true` if _all_ guards evaluate to truthy, otherwise `false`
  - `or([guard1, guard2, /* ... */])` returns `true` if _any_ guard evaluates to truthy, otherwise `false`
  - `not(guard1)` returns `true` if a single guard evaluates to `false`, otherwise `true`

  ```js
  import { and, or, not } from 'xstate/guards';

  const someMachine = createMachine({
    // ...
    on: {
      EVENT: {
        target: 'somewhere',
        guard: and([
          'stringGuard',
          or([{ type: 'anotherGuard' }, not(() => false)])
        ])
      }
    }
  });
  ```

- [`97b05690`](https://github.com/statelyai/xstate/commit/97b05690cd8b30824eb176c813a145d3ef0d2a78) [#901](https://github.com/statelyai/xstate/pull/901) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Simplified invoke definition: the `invoke` property of a state definition will now only accept an `InvokeCreator`, which is a function that takes in context, event, and meta (parent, id, etc.) and returns an `Actor`.

  ```diff
  - invoke: someMachine
  + invoke: spawnMachine(someMachine)

  - invoke: (ctx, e) => somePromise
  + invoke: spawnPromise((ctx, e) => somePromise)

  - invoke: (ctx, e) => (cb, receive) => { ... }
  + invoke: spawnCallback((ctx, e) => (cb, receive) => { ... })

  - invoke: (ctx, e) => someObservable$
  + invoke: spawnObservable((ctx, e) => someObservable$)
  ```

  This also includes a helper function for spawning activities:

  ```diff
  - activity: (ctx, e) => { ... }
  + invoke: spawnActivity((ctx, e) => { ... })
  ```

* [`6043a1c2`](https://github.com/statelyai/xstate/commit/6043a1c28d21ff8cbabc420a6817a02a1a54fcc8) [#1240](https://github.com/statelyai/xstate/pull/1240) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `in: '...'` transition property can now be replaced with `stateIn(...)` and `stateNotIn(...)` guards, imported from `xstate/guards`:

  ```diff
  import {
    createMachine,
  + stateIn
  } from 'xstate/guards';

  const machine = createMachine({
    // ...
    on: {
      SOME_EVENT: {
        target: 'anotherState',
  -     in: '#someState',
  +     cond: stateIn('#someState')
      }
    }
  })
  ```

  The `stateIn(...)` and `stateNotIn(...)` guards also can be used the same way as `state.matches(...)`:

  ```js
  // ...
  SOME_EVENT: {
    target: 'anotherState',
    cond: stateNotIn({ red: 'stop' })
  }
  ```

  ---

  An error will now be thrown if the `assign(...)` action is executed when the `context` is `undefined`. Previously, there was only a warning.

  ---

  The SCXML event `error.execution` will be raised if assignment in an `assign(...)` action fails.

  ---

  Error events raised by the machine will be _thrown_ if there are no error listeners registered on a service via `service.onError(...)`.

- [`0e24ea6d`](https://github.com/statelyai/xstate/commit/0e24ea6d62a5c1a8b7e365f2252dc930d94997c4) [#987](https://github.com/statelyai/xstate/pull/987) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `internal` property will no longer have effect for transitions on atomic (leaf-node) state nodes. In SCXML, `internal` only applies to complex (compound and parallel) state nodes:

  > Determines whether the source state is exited in transitions whose target state is a descendant of the source state. [See 3.13 Selecting and Executing Transitions for details.](https://www.w3.org/TR/scxml/#SelectingTransitions)

  ```diff
  // ...
  green: {
    on: {
      NOTHING: {
  -     target: 'green',
  -     internal: true,
        actions: doSomething
      }
    }
  }
  ```

* [`04e89f90`](https://github.com/statelyai/xstate/commit/04e89f90f97fe25a45b5908c45f25a513f0fd70f) [#987](https://github.com/statelyai/xstate/pull/987) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The history resolution algorithm has been refactored to closely match the SCXML algorithm, which changes the shape of `state.historyValue` to map history state node IDs to their most recently resolved target state nodes.

- [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175) [#1456](https://github.com/statelyai/xstate/pull/1456) Thanks [@davidkpiano](https://github.com/davidkpiano)! - BREAKING: The `cond` property in transition config objects has been renamed to `guard`. This unifies terminology for guarded transitions and guard predicates (previously called "cond", or "conditional", predicates):

  ```diff
  someState: {
    on: {
      EVENT: {
        target: 'anotherState',
  -     cond: 'isValid'
  +     guard: 'isValid'
      }
    }
  }
  ```

* [`b200e0e0`](https://github.com/statelyai/xstate/commit/b200e0e0b7123797086080b75abdfcf2fce45253) [#2060](https://github.com/statelyai/xstate/pull/2060) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `Machine()` function has been removed. Use the `createMachine()` function instead.

  ```diff
  -import { Machine } from 'xstate';
  +import { createMachine } from 'xstate';

  -const machine = Machine({
  +const machine = createMachine({
    // ...
  });
  ```

- [`0038c7b1`](https://github.com/statelyai/xstate/commit/0038c7b1e2050fe7262849aab8fdff4a7ce7cf92) [#2191](https://github.com/statelyai/xstate/pull/2191) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `StateSchema` type has been removed from all generic type signatures.

* [`390eaaa5`](https://github.com/statelyai/xstate/commit/390eaaa523cb0dd243e39c6300e671606c1e45fc) [#1163](https://github.com/statelyai/xstate/pull/1163) Thanks [@davidkpiano](https://github.com/davidkpiano)! - **Breaking:** Activities are no longer a separate concept. Instead, activities are invoked. Internally, this is how activities worked. The API is consolidated so that `activities` are no longer a property of the state node or machine options:

  ```diff
  import { createMachine } from 'xstate';
  +import { invokeActivity } from 'xstate/invoke';

  const machine = createMachine(
    {
      // ...
  -   activities: 'someActivity',
  +   invoke: {
  +     src: 'someActivity'
  +   }
    },
    {
  -   activities: {
  +   actors: {
  -     someActivity: ((context, event) => {
  +     someActivity: invokeActivity((context, event) => {
          // ... some continuous activity

          return () => {
            // dispose activity
          }
        })
      }
    }
  );
  ```

  **Breaking:** The `services` option passed as the second argument to `createMachine(config, options)` is renamed to `actors`. Each value in `actors`should be a function that takes in `context` and `event` and returns a [behavior](TODO: link) for an actor. The provided invoke creators are:

  - `invokeActivity`
  - `invokePromise`
  - `invokeCallback`
  - `invokeObservable`
  - `invokeMachine`

  ```diff
  import { createMachine } from 'xstate';
  +import { invokePromise } from 'xstate/invoke';

  const machine = createMachine(
    {
      // ...
      invoke: {
        src: 'fetchFromAPI'
      }
    },
    {
  -   services: {
  +   actors: {
  -     fetchFromAPI: ((context, event) => {
  +     fetchFromAPI: invokePromise((context, event) => {
          // ... (return a promise)
        })
      }
    }
  );
  ```

  **Breaking:** The `state.children` property is now a mapping of invoked actor IDs to their `ActorRef` instances.

  **Breaking:** The way that you interface with invoked/spawned actors is now through `ActorRef` instances. An `ActorRef` is an opaque reference to an `Actor`, which should be never referenced directly.

  **Breaking:** The `src` of an `invoke` config is now either a string that references the machine's `options.actors`, or a `BehaviorCreator`, which is a function that takes in `context` and `event` and returns a `Behavior`:

  ```diff
  import { createMachine } from 'xstate';
  +import { invokePromise } from 'xstate/invoke';

  const machine = createMachine({
    // ...
    invoke: {
  -   src: (context, event) => somePromise
  +   src: invokePromise((context, event) => somePromise)
    }
    // ...
  });
  ```

  **Breaking:** The `origin` of an `SCXML.Event` is no longer a string, but an `ActorRef` instance.

- [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6) [#878](https://github.com/statelyai/xstate/pull/878) Thanks [@Andarist](https://github.com/Andarist)! - Support for compound string state values has been dropped from Machine's transition method. It's no longer allowed to call transition like this - `machine.transition('a.b', 'NEXT')`, instead it's required to use "state value" representation like this - `machine.transition({ a: 'b' }, 'NEXT')`.

* [`025a2d6a`](https://github.com/statelyai/xstate/commit/025a2d6a295359a746bee6ffc2953ccc51a6aaad) [#898](https://github.com/statelyai/xstate/pull/898) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - Breaking: activities removed (can be invoked)

  Since activities can be considered invoked services, they can be implemented as such. Activities are services that do not send any events back to the parent machine, nor do they receive any events, other than a "stop" signal when the parent changes to a state where the activity is no longer active. This is modeled the same way as a callback service is modeled.

- [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6) [#878](https://github.com/statelyai/xstate/pull/878) Thanks [@Andarist](https://github.com/Andarist)! - Removed previously deprecated config properties: `onEntry`, `onExit`, `parallel` and `forward`.

* [`5d16a736`](https://github.com/statelyai/xstate/commit/5d16a73651e97dd0228c5215cb2452a4d9951118) [#1811](https://github.com/statelyai/xstate/pull/1811) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Prefix wildcard event descriptors are now supported. These are event descriptors ending with `".*"` which will match all events that start with the prefix (the partial event type before `".*"`):

  ```js
  // ...
  on: {
    'mouse.click': {/* ... */},
    // Matches events such as:
    // "pointer.move"
    // "pointer.move.out"
    // "pointer"
    'pointer.*': {/* ... */}
  }
  // ...
  ```

  Note: wildcards are only valid as the entire event type (`"*"`) or at the end of an event type, preceded by a period (`".*"`):

  - ✅ `"*"`
  - ✅ `"event.*"`
  - ✅ `"event.something.*"`
  - ❌ ~`"event.*.something"`~
  - ❌ ~`"event*"`~
  - ❌ ~`"event*.some*thing"`~
  - ❌ ~`"*.something"`~

- [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175) [#1456](https://github.com/statelyai/xstate/pull/1456) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The interface for guard objects has changed. Notably, all guard parameters should be placed in the `params` property of the guard object:

  Example taken from [Custom Guards](https://xstate.js.org/docs/guides/guards.html#custom-guards):

  ```diff
  -cond: {
  +guard: {
  - name: 'searchValid', // `name` property no longer used
    type: 'searchValid',
  - minQueryLength: 3
  + params: {
  +   minQueryLength: 3
  + }
  }
  ```

* [`53a594e9`](https://github.com/statelyai/xstate/commit/53a594e9a1b49ccb1121048a5784676f83950024) [#1054](https://github.com/statelyai/xstate/pull/1054) Thanks [@Andarist](https://github.com/Andarist)! - `Machine#transition` no longer handles invalid state values such as values containing non-existent state regions. If you rehydrate your machines and change machine's schema then you should migrate your data accordingly on your own.

- [`31a0d890`](https://github.com/statelyai/xstate/commit/31a0d890f55d8f0b06772c9fd510b18302b76ebb) [#1002](https://github.com/statelyai/xstate/pull/1002) Thanks [@Andarist](https://github.com/Andarist)! - Removed support for `service.send(type, payload)`. We are using `send` API at multiple places and this was the only one supporting this shape of parameters. Additionally, it had not strict TS types and using it was unsafe (type-wise).

### Minor Changes

- [`b24e47b9`](https://github.com/statelyai/xstate/commit/b24e47b9e7a59a5b0527d4386cea3af16c84ca7a) [#1041](https://github.com/statelyai/xstate/pull/1041) Thanks [@Andarist](https://github.com/Andarist)! - Support for specifying states deep in the hierarchy has been added for the `initial` property. It's also now possible to specify multiple states as initial ones - so you can enter multiple descandants which have to be **parallel** to each other. Keep also in mind that you can only target descendant states with the `initial` property - it's not possible to target states from another regions.

  Those are now possible:

  ```js
  {
    initial: '#some_id',
    initial: ['#some_id', '#another_id'],
    initial: { target: '#some_id' },
    initial: { target: ['#some_id', '#another_id'] },
  }
  ```

* [`0c6cfee9`](https://github.com/statelyai/xstate/commit/0c6cfee9a6d603aa1756e3a6d0f76d4da1486caf) [#1028](https://github.com/statelyai/xstate/pull/1028) Thanks [@Andarist](https://github.com/Andarist)! - Added support for expressions to `cancel` action.

## 4.23.0

### Minor Changes

- [`7dc7ceb8`](https://github.com/statelyai/xstate/commit/7dc7ceb8707569b48ceb35069125763a701a0a58) [#2379](https://github.com/statelyai/xstate/pull/2379) Thanks [@davidkpiano](https://github.com/davidkpiano)! - There is a new `.preserveActionOrder` (default: `false`) setting in the machine configuration that preserves the order of actions when set to `true`. Normally, actions are executed in order _except_ for `assign(...)` actions, which are prioritized and executed first. When `.preserveActionOrder` is set to `true`, `assign(...)` actions will _not_ be prioritized, and will instead run in order. As a result, actions will capture the **intermediate `context` values** instead of the resulting `context` value from all `assign(...)` actions.

  ```ts
  // With `.preserveActionOrder: true`
  const machine = createMachine({
    context: { count: 0 },
    entry: [
      ctx => console.log(ctx.count), // 0
      assign({ count: ctx => ctx.count + 1 }),
      ctx => console.log(ctx.count), // 1
      assign({ count: ctx => ctx.count + 1 }),
      ctx => console.log(ctx.count) // 2
    ],
    preserveActionOrder: true
  });

  // With `.preserveActionOrder: false` (default)
  const machine = createMachine({
    context: { count: 0 },
    entry: [
      ctx => console.log(ctx.count), // 2
      assign({ count: ctx => ctx.count + 1 }),
      ctx => console.log(ctx.count), // 2
      assign({ count: ctx => ctx.count + 1 }),
      ctx => console.log(ctx.count) // 2
    ]
    // preserveActionOrder: false
  });
  ```

### Patch Changes

- [`4e305372`](https://github.com/statelyai/xstate/commit/4e30537266eb082ccd85f050c9372358247b4167) [#2361](https://github.com/statelyai/xstate/pull/2361) Thanks [@woutermont](https://github.com/woutermont)! - Add type for `Symbol.observable` to the `Interpreter` to improve the compatibility with RxJS.

* [`1def6cf6`](https://github.com/statelyai/xstate/commit/1def6cf6109867a87b4323ee83d20a9ee0c49d7b) [#2374](https://github.com/statelyai/xstate/pull/2374) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Existing actors can now be identified in `spawn(...)` calls by providing an `id`. This allows them to be referenced by string:

  ```ts
  const machine = createMachine({
    context: () => ({
      someRef: spawn(someExistingRef, 'something')
    }),
    on: {
      SOME_EVENT: {
        actions: send('AN_EVENT', { to: 'something' })
      }
    }
  });
  ```

- [`da6861e3`](https://github.com/statelyai/xstate/commit/da6861e34a2b28bf6eeaa7c04a2d4cf9a90f93f1) [#2391](https://github.com/statelyai/xstate/pull/2391) Thanks [@davidkpiano](https://github.com/davidkpiano)! - There are two new helper types for extracting `context` and `event` types:

  - `ContextFrom<T>` which extracts the `context` from any type that uses context
  - `EventFrom<T>` which extracts the `event` type (which extends `EventObject`) from any type which uses events

## 4.22.0

### Minor Changes

- [`1b32aa0d`](https://github.com/statelyai/xstate/commit/1b32aa0d3a0eca11ffcb7ec9d710eb8828107aa0) [#2356](https://github.com/statelyai/xstate/pull/2356) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The model created from `createModel(...)` now provides a `.createMachine(...)` method that does not require passing any generic type parameters:

  ```diff
  const model = createModel(/* ... */);

  -const machine = createMachine<typeof model>(/* ... */);
  +const machine = model.createMachine(/* ... */);
  ```

* [`432b60f7`](https://github.com/statelyai/xstate/commit/432b60f7bcbcee9510e0d86311abbfd75b1a674e) [#2280](https://github.com/statelyai/xstate/pull/2280) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Actors can now be invoked/spawned from reducers using the `fromReducer(...)` behavior creator:

  ```ts
  import { fromReducer } from 'xstate/lib/behaviors';

  type CountEvent = { type: 'INC' } | { type: 'DEC' };

  const countReducer = (count: number, event: CountEvent): number => {
    if (event.type === 'INC') {
      return count + 1;
    } else if (event.type === 'DEC') {
      return count - 1;
    }

    return count;
  };

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
  ```

- [`f9bcea2c`](https://github.com/davidkpiano/xstate/commit/f9bcea2ce909ac59fcb165b352a7b51a8b29a56d) [#2366](https://github.com/davidkpiano/xstate/pull/2366) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Actors can now be spawned directly in the initial `machine.context` using lazy initialization, avoiding the need for intermediate states and unsafe typings for immediately spawned actors:

  ```ts
  const machine = createMachine<{ ref: ActorRef<SomeEvent> }>({
    context: () => ({
      ref: spawn(anotherMachine, 'some-id') // spawn immediately!
    })
    // ...
  });
  ```

## 4.20.2

### Patch Changes

- [`1ef29e83`](https://github.com/davidkpiano/xstate/commit/1ef29e83e14331083279d50fd3a8907eb63793eb) [#2343](https://github.com/davidkpiano/xstate/pull/2343) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Eventless ("always") transitions will no longer be ignored if an event is sent to a machine in a state that does not have any enabled transitions for that event.

## 4.20.1

### Patch Changes

- [`99bc5fb9`](https://github.com/davidkpiano/xstate/commit/99bc5fb9d1d7be35f4c767dcbbf5287755b306d0) [#2275](https://github.com/davidkpiano/xstate/pull/2275) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `SpawnedActorRef` TypeScript interface has been deprecated in favor of a unified `ActorRef` interface, which contains the following:

  ```ts
  interface ActorRef<TEvent extends EventObject, TEmitted = any>
    extends Subscribable<TEmitted> {
    send: (event: TEvent) => void;
    id: string;
    subscribe(observer: Observer<T>): Subscription;
    subscribe(
      next: (value: T) => void,
      error?: (error: any) => void,
      complete?: () => void
    ): Subscription;
    getSnapshot: () => TEmitted | undefined;
  }
  ```

  For simpler actor-ref-like objects, the `BaseActorRef<TEvent>` interface has been introduced.

  ```ts
  interface BaseActorRef<TEvent extends EventObject> {
    send: (event: TEvent) => void;
  }
  ```

* [`38e6a5e9`](https://github.com/davidkpiano/xstate/commit/38e6a5e98a1dd54b4f2ef96942180ec0add88f2b) [#2334](https://github.com/davidkpiano/xstate/pull/2334) Thanks [@davidkpiano](https://github.com/davidkpiano)! - When using a model type in `createMachine<typeof someModel>(...)`, TypeScript will no longer compile machines that are missing the `context` property in the machine configuration:

  ```ts
  const machine = createMachine<typeof someModel>({
    // missing context - will give a TS error!
    // context: someModel.initialContext,
    initial: 'somewhere',
    states: {
      somewhere: {}
    }
  });
  ```

- [`5f790ba5`](https://github.com/davidkpiano/xstate/commit/5f790ba5478cb733a59e3b0603e8976c11bcdd04) [#2320](https://github.com/davidkpiano/xstate/pull/2320) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The typing for `InvokeCallback` have been improved for better event constraints when using the `sendBack` parameter of invoked callbacks:

  ```ts
  invoke: () => (sendBack, receive) => {
    // Will now be constrained to events that the parent machine can receive
    sendBack({ type: 'SOME_EVENT' });
  };
  ```

* [`2de3ec3e`](https://github.com/davidkpiano/xstate/commit/2de3ec3e994e0deb5a142aeac15e1eddeb18d1e1) [#2272](https://github.com/davidkpiano/xstate/pull/2272) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `state.meta` value is now calculated directly from `state.configuration`. This is most useful when starting a service from a persisted state:

  ```ts
    const machine = createMachine({
      id: 'test',
      initial: 'first',
      states: {
        first: {
          meta: {
            name: 'first state'
          }
        },
        second: {
          meta: {
            name: 'second state'
          }
        }
      }
    });

    const service = interpret(machine);

    service.start('second'); // `meta` will be computed

    // the state will have
    // meta: {
    //   'test.second': {
    //     name: 'second state'
    //   }
    // }
  });
  ```

## 4.20.0

### Minor Changes

- [`28059b9f`](https://github.com/davidkpiano/xstate/commit/28059b9f09926d683d80b7d816f5b703c0667a9f) [#2197](https://github.com/davidkpiano/xstate/pull/2197) Thanks [@davidkpiano](https://github.com/davidkpiano)! - All spawned and invoked actors now have a `.getSnapshot()` method, which allows you to retrieve the latest value emitted from that actor. That value may be `undefined` if no value has been emitted yet.

  ```js
  const machine = createMachine({
    context: {
      promiseRef: null
    },
    initial: 'pending',
    states: {
      pending: {
        entry: assign({
          promiseRef: () => spawn(fetch(/* ... */), 'some-promise')
        })
      }
    }
  });

  const service = interpret(machine)
    .onTransition(state => {
      // Read promise value synchronously
      const resolvedValue = state.context.promiseRef?.getSnapshot();
      // => undefined (if promise not resolved yet)
      // => { ... } (resolved data)
    })
    .start();

  // ...
  ```

### Patch Changes

- [`4ef03465`](https://github.com/davidkpiano/xstate/commit/4ef03465869e27dc878ec600661c9253d90f74f0) [#2240](https://github.com/davidkpiano/xstate/pull/2240) Thanks [@VanTanev](https://github.com/VanTanev)! - Preserve StateMachine type when .withConfig() and .withContext() modifiers are used on a machine.

## 4.19.2

### Patch Changes

- [`18789aa9`](https://github.com/davidkpiano/xstate/commit/18789aa94669e48b71e2ae22e524d9bbe9dbfc63) [#2107](https://github.com/davidkpiano/xstate/pull/2107) Thanks [@woutermont](https://github.com/woutermont)! - This update restricts invoked `Subscribable`s to `EventObject`s,
  so that type inference can be done on which `Subscribable`s are
  allowed to be invoked. Existing `MachineConfig`s that invoke
  `Subscribable<any>`s that are not `Subscribable<EventObject>`s
  should be updated accordingly.

* [`38dcec1d`](https://github.com/davidkpiano/xstate/commit/38dcec1dad60c62cf8c47c88736651483276ff87) [#2149](https://github.com/davidkpiano/xstate/pull/2149) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Invocations and entry actions for _combinatorial_ machines (machines with only a single root state) now behave predictably and will not re-execute upon targetless transitions.

## 4.19.1

### Patch Changes

- [`64ab1150`](https://github.com/davidkpiano/xstate/commit/64ab1150e0a383202f4af1d586b28e081009c929) [#2173](https://github.com/davidkpiano/xstate/pull/2173) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with tags not being set correctly after sending an event to a machine that didn't result in selecting any transitions.

## 4.19.0

### Minor Changes

- [`4f2f626d`](https://github.com/davidkpiano/xstate/commit/4f2f626dc84f45bb18ded6dd9aad3b6f6a2190b1) [#2143](https://github.com/davidkpiano/xstate/pull/2143) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Tags can now be added to state node configs under the `.tags` property:

  ```js
  const machine = createMachine({
    initial: 'green',
    states: {
      green: {
        tags: 'go' // single tag
      },
      yellow: {
        tags: 'go'
      },
      red: {
        tags: ['stop', 'other'] // multiple tags
      }
    }
  });
  ```

  You can query whether a state has a tag via `state.hasTag(tag)`:

  ```js
  const canGo = state.hasTag('go');
  // => `true` if in 'green' or 'red' state
  ```

### Patch Changes

- [`a61d01ce`](https://github.com/davidkpiano/xstate/commit/a61d01cefab5734adf9bfb167291f5b0ba712684) [#2125](https://github.com/davidkpiano/xstate/pull/2125) Thanks [@VanTanev](https://github.com/VanTanev)! - In callback invokes, the types of `callback` and `onReceive` are properly scoped to the machine TEvent.

## 4.18.0

### Minor Changes

- [`d0939ec6`](https://github.com/davidkpiano/xstate/commit/d0939ec60161c34b053cecdaeb277606b5982375) [#2046](https://github.com/davidkpiano/xstate/pull/2046) Thanks [@SimeonC](https://github.com/SimeonC)! - Allow machines to communicate with the inspector even in production builds.

* [`e37fffef`](https://github.com/davidkpiano/xstate/commit/e37fffefb742f45765945c02727edfbd5e2f9d47) [#2079](https://github.com/davidkpiano/xstate/pull/2079) Thanks [@davidkpiano](https://github.com/davidkpiano)! - There is now support for "combinatorial machines" (state machines that only have one state):

  ```js
  const testMachine = createMachine({
    context: { value: 42 },
    on: {
      INC: {
        actions: assign({ value: ctx => ctx.value + 1 })
      }
    }
  });
  ```

  These machines omit the `initial` and `state` properties, as the entire machine is treated as a single state.

### Patch Changes

- [`6a9247d4`](https://github.com/davidkpiano/xstate/commit/6a9247d4d3a39e6c8c4724d3368a13fcdef10907) [#2102](https://github.com/davidkpiano/xstate/pull/2102) Thanks [@VanTanev](https://github.com/VanTanev)! - Provide a convenience type for getting the `Interpreter` type based on the `StateMachine` type by transferring all generic parameters onto it. It can be used like this: `InterpreterFrom<typeof machine>`

## 4.17.1

### Patch Changes

- [`33302814`](https://github.com/davidkpiano/xstate/commit/33302814c38587d0044afd2ae61a4ff4779416c6) [#2041](https://github.com/davidkpiano/xstate/pull/2041) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with creatorless models not being correctly matched by `createMachine`'s overload responsible for using model-induced types.

## 4.17.0

### Minor Changes

- [`7763db8d`](https://github.com/davidkpiano/xstate/commit/7763db8d3615321d03839b2bd31c9b118ddee50c) [#1977](https://github.com/davidkpiano/xstate/pull/1977) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `schema` property has been introduced to the machine config passed into `createMachine(machineConfig)`, which allows you to provide metadata for the following:

  - Context
  - Events
  - Actions
  - Guards
  - Services

  This metadata can be accessed as-is from `machine.schema`:

  ```js
  const machine = createMachine({
    schema: {
      // Example in JSON Schema (anything can be used)
      context: {
        type: 'object',
        properties: {
          foo: { type: 'string' },
          bar: { type: 'number' },
          baz: {
            type: 'object',
            properties: {
              one: { type: 'string' }
            }
          }
        }
      },
      events: {
        FOO: { type: 'object' },
        BAR: { type: 'object' }
      }
    }
    // ...
  });
  ```

  Additionally, the new `createSchema()` identity function allows any schema "metadata" to be represented by a specific type, which makes type inference easier without having to specify generic types:

  ```ts
  import { createSchema, createMachine } from 'xstate';

  // Both `context` and `events` are inferred in the rest of the machine!
  const machine = createMachine({
    schema: {
      context: createSchema<{ count: number }>(),
      // No arguments necessary
      events: createSchema<{ type: 'FOO' } | { type: 'BAR' }>()
    }
    // ...
  });
  ```

* [`5febfe83`](https://github.com/davidkpiano/xstate/commit/5febfe83a7e5e866c0a4523ea4f86a966af7c50f) [#1955](https://github.com/davidkpiano/xstate/pull/1955) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Event creators can now be modeled inside of the 2nd argument of `createModel()`, and types for both `context` and `events` will be inferred properly in `createMachine()` when given the `typeof model` as the first generic parameter.

  ```ts
  import { createModel } from 'xstate/lib/model';

  const userModel = createModel(
    // initial context
    {
      name: 'David',
      age: 30
    },
    // creators (just events for now)
    {
      events: {
        updateName: (value: string) => ({ value }),
        updateAge: (value: number) => ({ value }),
        anotherEvent: () => ({}) // no payload
      }
    }
  );

  const machine = createMachine<typeof userModel>({
    context: userModel.initialContext,
    initial: 'active',
    states: {
      active: {
        on: {
          updateName: {
            /* ... */
          },
          updateAge: {
            /* ... */
          }
        }
      }
    }
  });

  const nextState = machine.transition(
    undefined,
    userModel.events.updateName('David')
  );
  ```

## 4.16.2

### Patch Changes

- [`4194ffe8`](https://github.com/davidkpiano/xstate/commit/4194ffe84cfe7910e2c183701e36bc5cac5c9bcc) [#1710](https://github.com/davidkpiano/xstate/pull/1710) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Stopping an already stopped interpreter will no longer crash. See [#1697](https://github.com/davidkpiano/xstate/issues/1697) for details.

## 4.16.1

### Patch Changes

- [`af6b7c70`](https://github.com/davidkpiano/xstate/commit/af6b7c70015db29d84f79dfd29ea0dc221b8f3e6) [#1865](https://github.com/davidkpiano/xstate/pull/1865) Thanks [@Andarist](https://github.com/Andarist)! - Improved `.matches(value)` inference for typestates containing union types as values.

## 4.16.0

### Minor Changes

- [`d2e328f8`](https://github.com/davidkpiano/xstate/commit/d2e328f8efad7e8d3500d39976d1153a26e835a3) [#1439](https://github.com/davidkpiano/xstate/pull/1439) Thanks [@davidkpiano](https://github.com/davidkpiano)! - An opt-in `createModel()` helper has been introduced to make it easier to work with typed `context` and events.

  - `createModel(initialContext)` creates a `model` object
  - `model.initialContext` returns the `initialContext`
  - `model.assign(assigner, event?)` creates an `assign` action that is properly scoped to the `event` in TypeScript

  See https://github.com/davidkpiano/xstate/pull/1439 for more details.

  ```js
  import { createMachine } from 'xstate';
  import { createModel } from 'xstate/lib/model'; // opt-in, not part of main build

  interface UserContext {
    name: string;
    age: number;
  }

  type UserEvents =
    | { type: 'updateName'; value: string }
    | { type: 'updateAge'; value: number }

  const userModel = createModel<UserContext, UserEvents>({
    name: 'David',
    age: 30
  });

  const assignName = userModel.assign({
    name: (_, e) => e.value // correctly typed to `string`
  }, 'updateName'); // restrict to 'updateName' event

  const machine = createMachine<UserContext, UserEvents>({
    context: userModel.context,
    initial: 'active',
    states: {
      active: {
        on: {
          updateName: {
            actions: assignName
          }
        }
      }
    }
  });
  ```

## 4.15.4

### Patch Changes

- [`0cb8df9b`](https://github.com/davidkpiano/xstate/commit/0cb8df9b6c8cd01ada82afe967bf1015e24e75d9) [#1816](https://github.com/davidkpiano/xstate/pull/1816) Thanks [@Andarist](https://github.com/Andarist)! - `machine.resolveState(state)` calls should resolve to the correct value of `.done` property now.

## 4.15.3

### Patch Changes

- [`63ba888e`](https://github.com/davidkpiano/xstate/commit/63ba888e19bd2b72f9aad2c9cd36cde297e0ffe5) [#1770](https://github.com/davidkpiano/xstate/pull/1770) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Instead of referencing `window` directly, XState now internally calls a `getGlobal()` function that will resolve to the proper `globalThis` value in all environments. This affects the dev tools code only.

## 4.15.2

### Patch Changes

- [`497c543d`](https://github.com/davidkpiano/xstate/commit/497c543d2980ea1a277b30b340a7bcd3dd0b3cb6) [#1766](https://github.com/davidkpiano/xstate/pull/1766) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with events received from callback actors not having the appropriate `_event.origin` set.

## 4.15.1

### Patch Changes

- [`8a8cfa32`](https://github.com/davidkpiano/xstate/commit/8a8cfa32d99aedf11f4af93ba56fa9ba68925c74) [#1704](https://github.com/davidkpiano/xstate/pull/1704) Thanks [@blimmer](https://github.com/blimmer)! - The default `clock` methods (`setTimeout` and `clearTimeout`) are now invoked properly with the global context preserved for those invocations which matter for some JS environments. More details can be found in the corresponding issue: [#1703](https://github.com/davidkpiano/xstate/issues/1703).

## 4.15.0

### Minor Changes

- [`6596d0ba`](https://github.com/davidkpiano/xstate/commit/6596d0ba163341fc43d214b48115536cb4815b68) [#1622](https://github.com/davidkpiano/xstate/pull/1622) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Spawned/invoked actors and interpreters are now typed as extending `ActorRef` (e.g., `SpawnedActorRef`) rather than `Actor` or `Interpreter`. This unification of types should make it more straightforward to provide actor types:

  ```diff
  import {
  - Actor
  + ActorRef
  } from 'xstate';

  // ...

  interface SomeContext {
  - server?: Actor;
  + server?: ActorRef<ServerEvent>;
  }
  ```

  It's also easier to specify the type of a spawned/invoked machine with `ActorRefFrom`:

  ```diff
  import {
    createMachine,
  - Actor
  + ActorRefFrom
  } from 'xstate';

  const serverMachine = createMachine<ServerContext, ServerEvent>({
    // ...
  });

  interface SomeContext {
  - server?: Actor; // difficult to type
  + server?: ActorRefFrom<typeof serverMachine>;
  }
  ```

### Patch Changes

- [`75a91b07`](https://github.com/davidkpiano/xstate/commit/75a91b078a10a86f13edc9eec3ac1d6246607002) [#1692](https://github.com/davidkpiano/xstate/pull/1692) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with history state entering a wrong state if the most recent visit in its parent has been caused by a transient transition.

## 4.14.1

### Patch Changes

- [`02c76350`](https://github.com/davidkpiano/xstate/commit/02c763504da0808eeb281587981a5baf8ba884a1) [#1656](https://github.com/davidkpiano/xstate/pull/1656) Thanks [@Andarist](https://github.com/Andarist)! - Exit actions will now be properly called when a service gets canceled by calling its `stop` method.

## 4.14.0

### Minor Changes

- [`119db8fb`](https://github.com/davidkpiano/xstate/commit/119db8fbccd08f899e1275a502d8c4c51b5a130e) [#1577](https://github.com/davidkpiano/xstate/pull/1577) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Expressions can now be used in the `stop()` action creator:

  ```js
  // ...
  actions: stop(context => context.someActor);
  ```

### Patch Changes

- [`8c78e120`](https://github.com/davidkpiano/xstate/commit/8c78e1205a729d933e30db01cd4260d82352a9be) [#1570](https://github.com/davidkpiano/xstate/pull/1570) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The return type of `spawn(machine)` will now be `Actor<State<TContext, TEvent>, TEvent>`, which is a supertype of `Interpreter<...>`.

* [`602687c2`](https://github.com/davidkpiano/xstate/commit/602687c235c56cca552c2d5a9d78adf224f522d8) [#1566](https://github.com/davidkpiano/xstate/pull/1566) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Exit actions will now be properly called when an invoked machine reaches its final state. See [#1109](https://github.com/davidkpiano/xstate/issues/1109) for more details.

- [`6e44d02a`](https://github.com/davidkpiano/xstate/commit/6e44d02ad03af4041046120dd6c975e3b5b3772a) [#1553](https://github.com/davidkpiano/xstate/pull/1553) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `state.children` property now properly shows all spawned and invoked actors. See [#795](https://github.com/davidkpiano/xstate/issues/795) for more details.

* [`72b0880e`](https://github.com/davidkpiano/xstate/commit/72b0880e6444ae009adca72088872bb5c0760ce3) [#1504](https://github.com/davidkpiano/xstate/pull/1504) Thanks [@Andarist](https://github.com/Andarist)! - Added `status` property on the `Interpreter` - this can be used to differentiate not started, running and stopped interpreters. This property is best compared to values on the new `InterpreterStatus` export.

## 4.13.0

### Minor Changes

- [`f51614df`](https://github.com/davidkpiano/xstate/commit/f51614dff760cfe4511c0bc7cca3d022157c104c) [#1409](https://github.com/davidkpiano/xstate/pull/1409) Thanks [@jirutka](https://github.com/jirutka)! - Fix type `ExtractStateValue` so that it generates a type actually describing a `State.value`

### Patch Changes

- [`b1684ead`](https://github.com/davidkpiano/xstate/commit/b1684eadb1f859db5c733b8d403afc825c294948) [#1402](https://github.com/davidkpiano/xstate/pull/1402) Thanks [@Andarist](https://github.com/Andarist)! - Improved TypeScript type-checking performance a little bit by using distributive conditional type within `TransitionsConfigArray` declarations instead of a mapped type. Kudos to [@amcasey](https://github.com/amcasey), some discussion around this can be found [here](https://github.com/microsoft/TypeScript/issues/39826#issuecomment-675790689)

* [`ad3026d4`](https://github.com/davidkpiano/xstate/commit/ad3026d4309e9a1c719e09fd8c15cdfefce22055) [#1407](https://github.com/davidkpiano/xstate/pull/1407) Thanks [@tomenden](https://github.com/tomenden)! - Fixed an issue with not being able to run XState in Web Workers due to assuming that `window` or `global` object is available in the executing environment, but none of those are actually available in the Web Workers context.

- [`4e949ec8`](https://github.com/davidkpiano/xstate/commit/4e949ec856349062352562c825beb0654e528f81) [#1401](https://github.com/davidkpiano/xstate/pull/1401) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with spawned actors being spawned multiple times when they got spawned in an initial state of a child machine that is invoked in the initial state of a parent machine.

  <details>
  <summary>
  Illustrating example for curious readers.
  </summary>

  ```js
  const child = createMachine({
    initial: 'bar',
    context: {},
    states: {
      bar: {
        entry: assign({
          promise: () => {
            return spawn(() => Promise.resolve('answer'));
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
          src: child,
          onDone: 'end'
        }
      },
      end: { type: 'final' }
    }
  });

  interpret(parent).start();
  ```

  </details>

## 4.12.0

### Minor Changes

- [`b72e29dd`](https://github.com/davidkpiano/xstate/commit/b72e29dd728b4c1be4bdeaec93909b4e307db5cf) [#1354](https://github.com/davidkpiano/xstate/pull/1354) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `Action` type was simplified, and as a result, you should see better TypeScript performance.

* [`4dbabfe7`](https://github.com/davidkpiano/xstate/commit/4dbabfe7d5ba154e852b4d460a2434c6fc955726) [#1320](https://github.com/davidkpiano/xstate/pull/1320) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `invoke.src` property now accepts an object that describes the invoke source with its `type` and other related metadata. This can be read from the `services` option in the `meta.src` argument:

  ```js
  const machine = createMachine(
    {
      initial: 'searching',
      states: {
        searching: {
          invoke: {
            src: {
              type: 'search',
              endpoint: 'example.com'
            }
            // ...
          }
          // ...
        }
      }
    },
    {
      services: {
        search: (context, event, { src }) => {
          console.log(src);
          // => { endpoint: 'example.com' }
        }
      }
    }
  );
  ```

  Specifying a string for `invoke.src` will continue to work the same; e.g., if `src: 'search'` was specified, this would be the same as `src: { type: 'search' }`.

- [`8662e543`](https://github.com/davidkpiano/xstate/commit/8662e543393de7e2f8a6d92ff847043781d10f4d) [#1317](https://github.com/davidkpiano/xstate/pull/1317) Thanks [@Andarist](https://github.com/Andarist)! - All `TTypestate` type parameters default to `{ value: any; context: TContext }` now and the parametrized type is passed correctly between various types which results in more accurate types involving typestates.

### Patch Changes

- [`3ab3f25e`](https://github.com/davidkpiano/xstate/commit/3ab3f25ea297e4d770eef512e9583475c943845d) [#1285](https://github.com/davidkpiano/xstate/pull/1285) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with initial state of invoked machines being read without custom data passed to them which could lead to a crash when evaluating transient transitions for the initial state.

* [`a7da1451`](https://github.com/davidkpiano/xstate/commit/a7da14510fd1645ad041836b567771edb5b90827) [#1290](https://github.com/davidkpiano/xstate/pull/1290) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The "Attempted to spawn an Actor [...] outside of a service. This will have no effect." warnings are now silenced for "lazily spawned" actors, which are actors that aren't immediately active until the function that creates them are called:

  ```js
  // ⚠️ "active" actor - will warn
  spawn(somePromise);

  // 🕐 "lazy" actor - won't warn
  spawn(() => somePromise);

  // 🕐 machines are also "lazy" - won't warn
  spawn(someMachine);
  ```

  It is recommended that all `spawn(...)`-ed actors are lazy, to avoid accidentally initializing them e.g., when reading `machine.initialState` or calculating otherwise pure transitions. In V5, this will be enforced.

- [`c1f3d260`](https://github.com/davidkpiano/xstate/commit/c1f3d26069ee70343f8045a48411e02a68f98cbd) [#1317](https://github.com/davidkpiano/xstate/pull/1317) Thanks [@Andarist](https://github.com/Andarist)! - Fixed a type returned by a `raise` action - it's now `RaiseAction<TEvent> | SendAction<TContext, AnyEventObject, TEvent>` instead of `RaiseAction<TEvent> | SendAction<TContext, TEvent, TEvent>`. This makes it comaptible in a broader range of scenarios.

* [`8270d5a7`](https://github.com/davidkpiano/xstate/commit/8270d5a76c71add3a5109e069bd85716b230b5d4) [#1372](https://github.com/davidkpiano/xstate/pull/1372) Thanks [@christianchown](https://github.com/christianchown)! - Narrowed the `ServiceConfig` type definition to use a specific event type to prevent compilation errors on strictly-typed `MachineOptions`.

- [`01e3e2dc`](https://github.com/davidkpiano/xstate/commit/01e3e2dcead63dce3eef5ab745395584efbf05fa) [#1320](https://github.com/davidkpiano/xstate/pull/1320) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The JSON definition for `stateNode.invoke` objects will no longer include the `onDone` and `onError` transitions, since those transitions are already merged into the `transitions` array. This solves the issue of reviving a serialized machine from JSON, where before, the `onDone` and `onError` transitions for invocations were wrongly duplicated.

## 4.11.0

### Minor Changes

- [`36ed8d0a`](https://github.com/davidkpiano/xstate/commit/36ed8d0a3adf5b7fd187b0abe198220398e8b056) [#1262](https://github.com/davidkpiano/xstate/pull/1262) Thanks [@Andarist](https://github.com/Andarist)! - Improved type inference for `InvokeConfig['data']`. This has required renaming `data` property on `StateNode` instances to `doneData`. This property was never meant to be a part of the public API, so we don't consider this to be a breaking change.

* [`2c75ab82`](https://github.com/davidkpiano/xstate/commit/2c75ab822e49cb1a23c1e14eb7bd04548ab143eb) [#1219](https://github.com/davidkpiano/xstate/pull/1219) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The resolved value of the `invoke.data` property is now available in the "invoke meta" object, which is passed as the 3rd argument to the service creator in `options.services`. This will work for all types of invoked services now, including promises, observables, and callbacks.

  ```js
  const machine = createMachine({
    initial: 'pending',
    context: {
      id: 42
    },
    states: {
      pending: {
        invoke: {
          src: 'fetchUser',
          data: {
            userId: (context) => context.id
          },
          onDone: 'success'
        }
      },
      success: {
        type: 'final'
      }
    }
  },
  {
    services: {
      fetchUser: (ctx, _, { data }) => {
        return fetch(`some/api/user/${data.userId}`)
          .then(response => response.json());
      }
    }
  }
  ```

- [`a6c78ae9`](https://github.com/davidkpiano/xstate/commit/a6c78ae960acba36b61a41a5d154ea59908010b0) [#1249](https://github.com/davidkpiano/xstate/pull/1249) Thanks [@davidkpiano](https://github.com/davidkpiano)! - New property introduced for eventless (transient) transitions: **`always`**, which indicates a transition that is always taken when in that state. Empty string transition configs for [transient transitions](https://xstate.js.org/docs/guides/transitions.html#transient-transitions) are deprecated in favor of `always`:

  ```diff
  // ...
  states: {
    playing: {
  +   always: [
  +     { target: 'win', cond: 'didPlayerWin' },
  +     { target: 'lose', cond: 'didPlayerLose' },
  +   ],
      on: {
        // ⚠️ Deprecation warning
  -     '': [
  -       { target: 'win', cond: 'didPlayerWin' },
  -       { target: 'lose', cond: 'didPlayerLose' },
  -     ]
      }
    }
  }
  // ...
  ```

  The old empty string syntax (`'': ...`) will continue to work until V5.

### Patch Changes

- [`36ed8d0a`](https://github.com/davidkpiano/xstate/commit/36ed8d0a3adf5b7fd187b0abe198220398e8b056) [#1262](https://github.com/davidkpiano/xstate/pull/1262) Thanks [@Andarist](https://github.com/Andarist)! - `StateMachine<any, any, any>` is no longer a part of the `InvokeConfig` type, but rather it creates a union with `InvokeConfig` in places where it is needed. This change shouldn't affect consumers' code.

## 4.10.0

### Minor Changes

- [`0133954`](https://github.com/davidkpiano/xstate/commit/013395463b955e950ab24cb4be51faf524b0de6e) [#1178](https://github.com/davidkpiano/xstate/pull/1178) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The types for the `send()` and `sendParent()` action creators have been changed to fix the issue of only being able to send events that the machine can receive. In reality, a machine can and should send events to other actors that it might not be able to receive itself. See [#711](https://github.com/davidkpiano/xstate/issues/711) for more information.

* [`a1f1239`](https://github.com/davidkpiano/xstate/commit/a1f1239e20e05e338ed994d031e7ef6f2f09ad68) [#1189](https://github.com/davidkpiano/xstate/pull/1189) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Previously, `state.matches(...)` was problematic because it was casting `state` to `never` if it didn't match the state value. This is now fixed by making the `Typestate` resolution more granular.

- [`dbc6a16`](https://github.com/davidkpiano/xstate/commit/dbc6a161c068a3e12dd12452b68a66fe3f4fb8eb) [#1183](https://github.com/davidkpiano/xstate/pull/1183) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Actions from a restored state provided as a custom initial state to `interpret(machine).start(initialState)` are now executed properly. See #1174 for more information.

### Patch Changes

- [`a10d604`](https://github.com/davidkpiano/xstate/commit/a10d604a6afcf39048b02be5436acdd197f16c2b) [#1176](https://github.com/davidkpiano/xstate/pull/1176) Thanks [@itfarrier](https://github.com/itfarrier)! - Fix passing state schema into State generic

* [`326db72`](https://github.com/davidkpiano/xstate/commit/326db725e50f7678af162626c6c7491e4364ec07) [#1185](https://github.com/davidkpiano/xstate/pull/1185) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with invoked service not being correctly started if other service got stopped in a subsequent microstep (in response to raised or null event).

- [`c3a496e`](https://github.com/davidkpiano/xstate/commit/c3a496e1f92ec27db0643fd1ddc32d683db4e751) [#1160](https://github.com/davidkpiano/xstate/pull/1160) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Delayed transitions defined using `after` were previously causing a circular dependency when the machine was converted using `.toJSON()`. This has now been fixed.

* [`e16e48e`](https://github.com/davidkpiano/xstate/commit/e16e48e05e6243a3eacca58a13d3e663cd641f55) [#1153](https://github.com/davidkpiano/xstate/pull/1153) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with `choose` and `pure` not being able to use actions defined in options.

- [`d496ecb`](https://github.com/davidkpiano/xstate/commit/d496ecb11b26011f2382d1ce6c4433284a7b3e9b) [#1165](https://github.com/davidkpiano/xstate/pull/1165) Thanks [@davidkpiano](https://github.com/davidkpiano)! - XState will now warn if you define an `.onDone` transition on the root node. Root nodes which are "done" represent the machine being in its final state, and can no longer accept any events. This has been reported as confusing in [#1111](https://github.com/davidkpiano/xstate/issues/1111).

## 4.9.1

### Patch Changes

- [`8a97785`](https://github.com/davidkpiano/xstate/commit/8a97785055faaeb1b36040dd4dc04e3b90fa9ec2) [#1137](https://github.com/davidkpiano/xstate/pull/1137) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Added docs for the `choose()` and `pure()` action creators, as well as exporting the `pure()` action creator in the `actions` object.

* [`e65dee9`](https://github.com/davidkpiano/xstate/commit/e65dee928fea60df1e9f83c82fed8102dfed0000) [#1131](https://github.com/davidkpiano/xstate/pull/1131) Thanks [@wKovacs64](https://github.com/wKovacs64)! - Include the new `choose` action in the `actions` export from the `xstate` core package. This was missed in v4.9.0.

## 4.9.0

### Minor Changes

- [`f3ff150`](https://github.com/davidkpiano/xstate/commit/f3ff150f7c50f402704d25cdc053b76836e447e3) [#1103](https://github.com/davidkpiano/xstate/pull/1103) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Simplify the `TransitionConfigArray` and `TransitionConfigMap` types in order to fix excessively deep type instantiation TypeScript reports. This addresses [#1015](https://github.com/davidkpiano/xstate/issues/1015).

* [`6c47b66`](https://github.com/davidkpiano/xstate/commit/6c47b66c3289ff161dc96d9b246873f55c9e18f2) [#1076](https://github.com/davidkpiano/xstate/pull/1076) Thanks [@Andarist](https://github.com/Andarist)! - Added support for conditional actions. It's possible now to have actions executed based on conditions using following:

  ```js
  entry: [
    choose([
      { cond: ctx => ctx > 100, actions: raise('TOGGLE') },
      {
        cond: 'hasMagicBottle',
        actions: [assign(ctx => ({ counter: ctx.counter + 1 }))]
      },
      { actions: ['fallbackAction'] }
    ])
  ];
  ```

  It works very similar to the if-else syntax where only the first matched condition is causing associated actions to be executed and the last ones can be unconditional (serving as a general fallback, just like else branch).

### Patch Changes

- [`1a129f0`](https://github.com/davidkpiano/xstate/commit/1a129f0f35995981c160d756a570df76396bfdbd) [#1073](https://github.com/davidkpiano/xstate/pull/1073) Thanks [@Andarist](https://github.com/Andarist)! - Cleanup internal structures upon receiving termination events from spawned actors.

* [`e88aa18`](https://github.com/davidkpiano/xstate/commit/e88aa18431629e1061b74dfd4a961b910e274e0b) [#1085](https://github.com/davidkpiano/xstate/pull/1085) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with data expressions of root's final nodes being called twice.

- [`88b17b2`](https://github.com/davidkpiano/xstate/commit/88b17b2476ff9a0fbe810df9d00db32c2241cd6e) [#1090](https://github.com/davidkpiano/xstate/pull/1090) Thanks [@rjdestigter](https://github.com/rjdestigter)! - This change carries forward the typestate type information encoded in the arguments of the following functions and assures that the return type also has the same typestate type information:

  - Cloned state machine returned by `.withConfig`.
  - `.state` getter defined for services.
  - `start` method of services.

* [`d5f622f`](https://github.com/davidkpiano/xstate/commit/d5f622f68f4065a2615b5a4a1caae6b508b4840e) [#1069](https://github.com/davidkpiano/xstate/pull/1069) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Loosened event type for `SendAction<TContext, AnyEventObject>`

## 4.8.0

### Minor Changes

- [`55aa589`](https://github.com/davidkpiano/xstate/commit/55aa589648a9afbd153e8b8e74cbf2e0ebf573fb) [#960](https://github.com/davidkpiano/xstate/pull/960) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The machine can now be safely JSON-serialized, using `JSON.stringify(machine)`. The shape of this serialization is defined in `machine.schema.json` and reflected in `machine.definition`.

  Note that `onEntry` and `onExit` have been deprecated in the definition in favor of `entry` and `exit`.

### Patch Changes

- [`1ae31c1`](https://github.com/davidkpiano/xstate/commit/1ae31c17dc81fb63e699b4b9bf1cf4ead023001d) [#1023](https://github.com/davidkpiano/xstate/pull/1023) Thanks [@Andarist](https://github.com/Andarist)! - Fixed memory leak - `State` objects had been retained in closures.

## 4.7.8

### Patch Changes

- [`520580b`](https://github.com/davidkpiano/xstate/commit/520580b4af597f7c83c329757ae972278c2d4494) [#967](https://github.com/davidkpiano/xstate/pull/967) Thanks [@andrewgordstewart](https://github.com/andrewgordstewart)! - Add context & event types to InvokeConfig

## 4.7.7

### Patch Changes

- [`c8db035`](https://github.com/davidkpiano/xstate/commit/c8db035b90a7ab4a557359d493d3dd7973dacbdd) [#936](https://github.com/davidkpiano/xstate/pull/936) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `escalate()` action can now take in an expression, which will be evaluated against the `context`, `event`, and `meta` to return the error data.

* [`2a3fea1`](https://github.com/davidkpiano/xstate/commit/2a3fea18dcd5be18880ad64007d44947cc327d0d) [#952](https://github.com/davidkpiano/xstate/pull/952) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The typings for the raise() action have been fixed to allow any event to be raised. This typed behavior will be refined in version 5, to limit raised events to those that the machine accepts.

- [`f86d419`](https://github.com/davidkpiano/xstate/commit/f86d41979ed108e2ac4df63299fc16f798da69f7) [#957](https://github.com/davidkpiano/xstate/pull/957) Thanks [@Andarist](https://github.com/Andarist)! - Fixed memory leak - each created service has been registered in internal map but it was never removed from it. Registration has been moved to a point where Interpreter is being started and it's deregistered when it is being stopped.

## 4.7.6

### Patch Changes

- dae8818: Typestates are now propagated to interpreted services.

## 4.7.5

### Patch Changes

- 6b3d767: Fixed issue with delayed transitions scheduling a delayed event for each transition defined for a single delay.

## 4.7.4

### Patch Changes

- 9b043cd: The initial state is now cached inside of the service instance instead of the machine, which was the previous (faulty) strategy. This will prevent entry actions on initial states from being called more than once, which is important for ensuring that actors are not spawned more than once.

## 4.7.3

### Patch Changes

- 2b134eee: Fixed issue with events being forwarded to children after being processed by the current machine. Events are now always forwarded first.
- 2b134eee: Fixed issue with not being able to spawn an actor when processing an event batch.
