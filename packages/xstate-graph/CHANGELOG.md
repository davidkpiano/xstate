# @xstate/graph

## 2.0.0-next.0

### Patch Changes

- Updated dependencies [[`7f3b8481`](https://github.com/statelyai/xstate/commit/7f3b84816564d951b6b29afdd7075256f1f59501), [`969a2f4f`](https://github.com/statelyai/xstate/commit/969a2f4fc0bc9147b9a52da25306e5c13b97f159), [`c0a6dcaf`](https://github.com/statelyai/xstate/commit/c0a6dcafa1a11a5ff1660b57e0728675f155c292), [`172d6a7e`](https://github.com/statelyai/xstate/commit/172d6a7e1e4ab0fa73485f76c52675be8a1f3362), [`31bc73e0`](https://github.com/statelyai/xstate/commit/31bc73e05692f29301f5bb5cb4b87b90773e0ef2), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`145539c4`](https://github.com/statelyai/xstate/commit/145539c4cfe1bde5aac247792622428e44342dd6), [`3de36bb2`](https://github.com/statelyai/xstate/commit/3de36bb24e8f59f54d571bf587407b1b6a9856e0), [`9e10660e`](https://github.com/statelyai/xstate/commit/9e10660ec2f1e89cbb09a1094edb4f6b8a273a99), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`97b05690`](https://github.com/statelyai/xstate/commit/97b05690cd8b30824eb176c813a145d3ef0d2a78), [`6043a1c2`](https://github.com/statelyai/xstate/commit/6043a1c28d21ff8cbabc420a6817a02a1a54fcc8), [`0e24ea6d`](https://github.com/statelyai/xstate/commit/0e24ea6d62a5c1a8b7e365f2252dc930d94997c4), [`04e89f90`](https://github.com/statelyai/xstate/commit/04e89f90f97fe25a45b5908c45f25a513f0fd70f), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`b200e0e0`](https://github.com/statelyai/xstate/commit/b200e0e0b7123797086080b75abdfcf2fce45253), [`0038c7b1`](https://github.com/statelyai/xstate/commit/0038c7b1e2050fe7262849aab8fdff4a7ce7cf92), [`b24e47b9`](https://github.com/statelyai/xstate/commit/b24e47b9e7a59a5b0527d4386cea3af16c84ca7a), [`390eaaa5`](https://github.com/statelyai/xstate/commit/390eaaa523cb0dd243e39c6300e671606c1e45fc), [`0c6cfee9`](https://github.com/statelyai/xstate/commit/0c6cfee9a6d603aa1756e3a6d0f76d4da1486caf), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`025a2d6a`](https://github.com/statelyai/xstate/commit/025a2d6a295359a746bee6ffc2953ccc51a6aaad), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`5d16a736`](https://github.com/statelyai/xstate/commit/5d16a73651e97dd0228c5215cb2452a4d9951118), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`53a594e9`](https://github.com/statelyai/xstate/commit/53a594e9a1b49ccb1121048a5784676f83950024), [`31a0d890`](https://github.com/statelyai/xstate/commit/31a0d890f55d8f0b06772c9fd510b18302b76ebb)]:
  - xstate@5.0.0-next.0

## 1.3.0

### Minor Changes

- [`111a7d13`](https://github.com/davidkpiano/xstate/commit/111a7d138db909e969629a3c237b952850c008ca) [#1663](https://github.com/davidkpiano/xstate/pull/1663) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Options passed into graph functions (e.g., `getShortestPaths(machine, options)`) can now resolve `.events` based on the `state`:

  ```js
  const countMachine = createMachine({
    initial: 'active',
    context: {
      count: 0
    },
    states: {
      active: {
        on: {
          ADD: {
            actions: assign({
              count: (context, event) => {
                return context.count + event.value;
              }
            })
          }
        }
      }
    }
  });

  const shortestPaths = getShortestPaths(countMachine, {
    events: {
      ADD: state => {
        // contrived example: if `context.count` is >= 10, increment by 10
        return state.context.count >= 10
          ? [{ type: 'ADD', value: 10 }]
          : [{ type: 'ADD', value: 1 }];
      }
    }
  });

  // The keys to the shortest paths will look like:
  // "active" | { count: 0 }
  // "active" | { count: 1 }
  // "active" | { count: 2 }
  // ...
  // "active" | { count: 10 }
  // "active" | { count: 20 }
  // "active" | { count: 30 }
  ```

## 1.2.0

### Minor Changes

- [`142f54e1`](https://github.com/davidkpiano/xstate/commit/142f54e1238919a53c73a40723c415b0044774bb) [#1366](https://github.com/davidkpiano/xstate/pull/1366) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `toDirectedGraph(...)` function was added, which converts a `machine` into an object that can be used in many different graph-based and visualization tools:

  ```js
  import { toDirectedGraph } from '@xstate/graph';

  const machine = createMachine({/* ... */});

  const digraph = toDirectedGraph(machine);

  // returns an object with this structure:
  {
    id: '...',
    stateNode: /* StateNode */,
    children: [
      { id: '...', children: [/* ... */], edges: [/* ... */] },
      { id: '...', /* ... */ },
      // ...
    ],
    edges: [
      { source: /* ... */, target: /* ... */, transition: /* ... */ }
      // ...
    ]
  }
  ```

## 1.1.0

### Minor Changes

- [`137b0cd`](https://github.com/davidkpiano/xstate/commit/137b0cdf71054d67f0c5ba2c11021436ec3739ed) [#1033](https://github.com/davidkpiano/xstate/pull/1033) Thanks [@ZempTime](https://github.com/ZempTime)! - Added ESM build of the package which can be loaded through modern web bundlers (instead of default CommonJS files).

### Patch Changes

- Updated dependencies [[`f3ff150`](https://github.com/davidkpiano/xstate/commit/f3ff150f7c50f402704d25cdc053b76836e447e3), [`6c47b66`](https://github.com/davidkpiano/xstate/commit/6c47b66c3289ff161dc96d9b246873f55c9e18f2), [`1a129f0`](https://github.com/davidkpiano/xstate/commit/1a129f0f35995981c160d756a570df76396bfdbd), [`e88aa18`](https://github.com/davidkpiano/xstate/commit/e88aa18431629e1061b74dfd4a961b910e274e0b), [`88b17b2`](https://github.com/davidkpiano/xstate/commit/88b17b2476ff9a0fbe810df9d00db32c2241cd6e), [`d5f622f`](https://github.com/davidkpiano/xstate/commit/d5f622f68f4065a2615b5a4a1caae6b508b4840e)]:
  - xstate@4.9.0
