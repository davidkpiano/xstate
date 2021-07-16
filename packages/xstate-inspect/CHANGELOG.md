# @xstate/inspect

## 1.0.0-next.0

### Patch Changes

- Updated dependencies [[`7f3b8481`](https://github.com/statelyai/xstate/commit/7f3b84816564d951b6b29afdd7075256f1f59501), [`969a2f4f`](https://github.com/statelyai/xstate/commit/969a2f4fc0bc9147b9a52da25306e5c13b97f159), [`c0a6dcaf`](https://github.com/statelyai/xstate/commit/c0a6dcafa1a11a5ff1660b57e0728675f155c292), [`172d6a7e`](https://github.com/statelyai/xstate/commit/172d6a7e1e4ab0fa73485f76c52675be8a1f3362), [`31bc73e0`](https://github.com/statelyai/xstate/commit/31bc73e05692f29301f5bb5cb4b87b90773e0ef2), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`145539c4`](https://github.com/statelyai/xstate/commit/145539c4cfe1bde5aac247792622428e44342dd6), [`3de36bb2`](https://github.com/statelyai/xstate/commit/3de36bb24e8f59f54d571bf587407b1b6a9856e0), [`9e10660e`](https://github.com/statelyai/xstate/commit/9e10660ec2f1e89cbb09a1094edb4f6b8a273a99), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`97b05690`](https://github.com/statelyai/xstate/commit/97b05690cd8b30824eb176c813a145d3ef0d2a78), [`6043a1c2`](https://github.com/statelyai/xstate/commit/6043a1c28d21ff8cbabc420a6817a02a1a54fcc8), [`0e24ea6d`](https://github.com/statelyai/xstate/commit/0e24ea6d62a5c1a8b7e365f2252dc930d94997c4), [`04e89f90`](https://github.com/statelyai/xstate/commit/04e89f90f97fe25a45b5908c45f25a513f0fd70f), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`b200e0e0`](https://github.com/statelyai/xstate/commit/b200e0e0b7123797086080b75abdfcf2fce45253), [`0038c7b1`](https://github.com/statelyai/xstate/commit/0038c7b1e2050fe7262849aab8fdff4a7ce7cf92), [`b24e47b9`](https://github.com/statelyai/xstate/commit/b24e47b9e7a59a5b0527d4386cea3af16c84ca7a), [`390eaaa5`](https://github.com/statelyai/xstate/commit/390eaaa523cb0dd243e39c6300e671606c1e45fc), [`0c6cfee9`](https://github.com/statelyai/xstate/commit/0c6cfee9a6d603aa1756e3a6d0f76d4da1486caf), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`025a2d6a`](https://github.com/statelyai/xstate/commit/025a2d6a295359a746bee6ffc2953ccc51a6aaad), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`5d16a736`](https://github.com/statelyai/xstate/commit/5d16a73651e97dd0228c5215cb2452a4d9951118), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`53a594e9`](https://github.com/statelyai/xstate/commit/53a594e9a1b49ccb1121048a5784676f83950024), [`31a0d890`](https://github.com/statelyai/xstate/commit/31a0d890f55d8f0b06772c9fd510b18302b76ebb)]:
  - xstate@5.0.0-next.0

## 0.4.1

### Patch Changes

- [`d9282107`](https://github.com/davidkpiano/xstate/commit/d9282107b931b867d9cd297ede71b55fe11eb74d) [#1800](https://github.com/davidkpiano/xstate/pull/1800) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Fixed a bug where services were not being registered by the inspect client, affecting the ability to send events to inspected services.

## 0.4.0

### Minor Changes

- [`63ba888e`](https://github.com/davidkpiano/xstate/commit/63ba888e19bd2b72f9aad2c9cd36cde297e0ffe5) [#1770](https://github.com/davidkpiano/xstate/pull/1770) Thanks [@davidkpiano](https://github.com/davidkpiano)! - It is now easier for developers to create their own XState inspectors, and even inspect services offline.

  A **receiver** is an actor that receives inspector events from a source, such as `"service.register"`, `"service.state"`, `"service.event"`, etc. This update includes two receivers:

  - `createWindowReceiver` - listens to inspector events from a parent window (for both popup and iframe scenarios)
  - 🚧 `createWebSocketReceiver` (experimental) - listens to inspector events from a WebSocket server

  Here's how it works:

  **Application (browser) code**

  ```js
  import { inspect } from '@xstate/inspect';

  inspect(/* options */);

  // ...

  interpret(someMachine, { devTools: true }).start();
  ```

  **Inspector code**

  ```js
  import { createWindowReceiver } from '@xstate/inspect';

  const windowReceiver = createWindowReceiver(/* options? */);

  windowReceiver.subscribe(event => {
    // here, you will receive events like:
    // { type: "service.register", machine: ..., state: ..., sessionId: ... }
    console.log(event);
  });
  ```

  The events you will receive are `ParsedReceiverEvent` types:

  ```ts
  export type ParsedReceiverEvent =
    | {
        type: 'service.register';
        machine: StateMachine<any, any, any>;
        state: State<any, any>;
        id: string;
        sessionId: string;
        parent?: string;
        source?: string;
      }
    | { type: 'service.stop'; sessionId: string }
    | {
        type: 'service.state';
        state: State<any, any>;
        sessionId: string;
      }
    | { type: 'service.event'; event: SCXML.Event<any>; sessionId: string };
  ```

  Given these events, you can visualize the service machines and their states and events however you'd like.

## 0.3.0

### Minor Changes

- [`a473205d`](https://github.com/davidkpiano/xstate/commit/a473205d214563033cd250094d2344113755bd8b) [#1699](https://github.com/davidkpiano/xstate/pull/1699) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `@xstate/inspect` tool now uses [`fast-safe-stringify`](https://www.npmjs.com/package/fast-safe-stringify) for internal JSON stringification of machines, states, and events when regular `JSON.stringify()` fails (e.g., due to circular structures).

## 0.2.0

### Minor Changes

- [`1725333a`](https://github.com/davidkpiano/xstate/commit/1725333a6edcc5c1e178228aa869c907d3907be5) [#1599](https://github.com/davidkpiano/xstate/pull/1599) Thanks [@davidkpiano](https://github.com/davidkpiano)! - The `@xstate/inspect` package is now built with Rollup which has fixed an issue with TypeScript compiler inserting references to `this` in the top-level scope of the output modules and thus making it harder for some tools (like Rollup) to re-bundle dist files as `this` in modules (as they are always in strict mode) is `undefined`.
