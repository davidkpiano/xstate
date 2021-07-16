# @xstate/vue

## 1.0.0-next.0

### Patch Changes

- Updated dependencies [[`7f3b8481`](https://github.com/statelyai/xstate/commit/7f3b84816564d951b6b29afdd7075256f1f59501), [`969a2f4f`](https://github.com/statelyai/xstate/commit/969a2f4fc0bc9147b9a52da25306e5c13b97f159), [`c0a6dcaf`](https://github.com/statelyai/xstate/commit/c0a6dcafa1a11a5ff1660b57e0728675f155c292), [`172d6a7e`](https://github.com/statelyai/xstate/commit/172d6a7e1e4ab0fa73485f76c52675be8a1f3362), [`31bc73e0`](https://github.com/statelyai/xstate/commit/31bc73e05692f29301f5bb5cb4b87b90773e0ef2), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`145539c4`](https://github.com/statelyai/xstate/commit/145539c4cfe1bde5aac247792622428e44342dd6), [`3de36bb2`](https://github.com/statelyai/xstate/commit/3de36bb24e8f59f54d571bf587407b1b6a9856e0), [`9e10660e`](https://github.com/statelyai/xstate/commit/9e10660ec2f1e89cbb09a1094edb4f6b8a273a99), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`97b05690`](https://github.com/statelyai/xstate/commit/97b05690cd8b30824eb176c813a145d3ef0d2a78), [`6043a1c2`](https://github.com/statelyai/xstate/commit/6043a1c28d21ff8cbabc420a6817a02a1a54fcc8), [`0e24ea6d`](https://github.com/statelyai/xstate/commit/0e24ea6d62a5c1a8b7e365f2252dc930d94997c4), [`04e89f90`](https://github.com/statelyai/xstate/commit/04e89f90f97fe25a45b5908c45f25a513f0fd70f), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`b200e0e0`](https://github.com/statelyai/xstate/commit/b200e0e0b7123797086080b75abdfcf2fce45253), [`0038c7b1`](https://github.com/statelyai/xstate/commit/0038c7b1e2050fe7262849aab8fdff4a7ce7cf92), [`b24e47b9`](https://github.com/statelyai/xstate/commit/b24e47b9e7a59a5b0527d4386cea3af16c84ca7a), [`390eaaa5`](https://github.com/statelyai/xstate/commit/390eaaa523cb0dd243e39c6300e671606c1e45fc), [`0c6cfee9`](https://github.com/statelyai/xstate/commit/0c6cfee9a6d603aa1756e3a6d0f76d4da1486caf), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`025a2d6a`](https://github.com/statelyai/xstate/commit/025a2d6a295359a746bee6ffc2953ccc51a6aaad), [`e09efc72`](https://github.com/statelyai/xstate/commit/e09efc720f05246b692d0fdf17cf5d8ac0344ee6), [`5d16a736`](https://github.com/statelyai/xstate/commit/5d16a73651e97dd0228c5215cb2452a4d9951118), [`8fcbddd5`](https://github.com/statelyai/xstate/commit/8fcbddd51d66716ab1d326d934566a7664a4e175), [`53a594e9`](https://github.com/statelyai/xstate/commit/53a594e9a1b49ccb1121048a5784676f83950024), [`31a0d890`](https://github.com/statelyai/xstate/commit/31a0d890f55d8f0b06772c9fd510b18302b76ebb)]:
  - xstate@5.0.0-next.0

## 0.8.0

### Minor Changes

- [`b0801662`](https://github.com/statelyai/xstate/commit/b0801662de5df0217c6105650603a1f697b830c8) [#2392](https://github.com/statelyai/xstate/pull/2392) Thanks [@santicros](https://github.com/santicros)! - Just like `useInterpret(...)`, other types of actors can now be spawned from _behaviors_ using `useSpawn(...)`:

  ```vue
  <template>
    <div>
      Count: {{ count }}
      <button @click="send({ type: 'INC' })">Increment</button>
      <button @click="send({ type: 'DEC' })">Decrement</button>
    </div>
  </template>

  <script>
  import { fromReducer } from 'xstate/lib/behaviors';
  import { useActor, useSpawn } from '@xstate/vue';

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

  export default {
    setup() {
      const countActorRef = useSpawn(countBehavior);
      const { state: count, send } = useActor(countActorRef);

      return { count, send };
    }
  };
  </script>
  ```

## 0.7.0

### Minor Changes

- [`742a0bfa`](https://github.com/davidkpiano/xstate/commit/742a0bfa970c94957bf21904fc84b8031369e316) [#2335](https://github.com/davidkpiano/xstate/pull/2335) Thanks [@santicros](https://github.com/santicros)! - The `send` type returned in the object from `useActor(someService)` was an incorrect `never` type; this has been fixed.

  Also adds deprecation notice to `useService`.

## 0.6.0

### Minor Changes

- [`724baae7`](https://github.com/davidkpiano/xstate/commit/724baae76409a3dc6a5b03c47769918d600f478f) [#2230](https://github.com/davidkpiano/xstate/pull/2230) Thanks [@santicros](https://github.com/santicros)! - Added new composable `useSelector(actor, selector)`, which subscribes to actor and returns the selected state derived from selector(snapshot):

  ```js
  import { useSelector } from '@xstate/vue';

  export default {
    props: ['someActor'],
    setup(props) {
      const count = useSelector(props.someActor, state => state.context.count);
      // ...
      return { count };
    }
  };
  ```

## 0.5.0

### Minor Changes

- [`9f6a6e9e`](https://github.com/davidkpiano/xstate/commit/9f6a6e9ea8fdcbdffe0742343eb9c28da1aadb7f) [#1991](https://github.com/davidkpiano/xstate/pull/1991) Thanks [@santicros](https://github.com/santicros)! - Added new `useActor`, which is a composable that subscribes to emitted changes from an existing `actor`:

  ```js
  import { useActor } from '@xstate/vue';

  export default defineComponent({
    props: ['someSpawnedActor'],
    setup(props) {
      const { state, send } = useActor(props.someSpawnedActor);
      return { state, send };
    }
  });
  ```

* [`bfe42972`](https://github.com/davidkpiano/xstate/commit/bfe42972cf624b990a280244e12e5976e5bd3048) [#1991](https://github.com/davidkpiano/xstate/pull/1991) Thanks [@santicros](https://github.com/santicros)! - Fixed the UMD build by externalizing XState & Vue correctly.

- [`4346cabc`](https://github.com/davidkpiano/xstate/commit/4346cabc42963211b471f214056db4d4f7e85539) [#1991](https://github.com/davidkpiano/xstate/pull/1991) Thanks [@santicros](https://github.com/santicros)! - Added new `useInterpret`, which is a low-level composable that interprets the `machine` and returns the `service`:

  ```js
  import { useInterpret } from '@xstate/vue';
  import { someMachine } from '../path/to/someMachine';
  export default defineComponent({
    setup() {
      const state = ref();
      const service = useInterpret(machine, {}, nextState => {
        state.value = nextState.value;
      });
      return { service, state };
    }
  });
  ```

* [`012ef363`](https://github.com/davidkpiano/xstate/commit/012ef3635cc06d8e5199cb85326b4b372714ca89) [#1991](https://github.com/davidkpiano/xstate/pull/1991) Thanks [@santicros](https://github.com/santicros)! - Added a proper ESM file using the`"module"` field in the `package.json`. It helps bundlers to automatically pick this over a file authored using CommonJS and allows them to apply some optimizations easier.

## 0.4.0

### Minor Changes

- [`87d0acd9`](https://github.com/davidkpiano/xstate/commit/87d0acd9e9530079829ad30228558b18b77ea4a2) [#1629](https://github.com/davidkpiano/xstate/pull/1629) Thanks [@sarahdayan](https://github.com/sarahdayan)! - Added support for Vue 3 that has builtin support for the composition API. This means that this package will no longer work with [`@vue/composition-api`](https://github.com/vuejs/composition-api) package. If you are still using Vue 2 you should continue using `@xstate/vue@^0.3.0`.

## 0.3.0

### Minor Changes

- [`8662e543`](https://github.com/davidkpiano/xstate/commit/8662e543393de7e2f8a6d92ff847043781d10f4d) [#1317](https://github.com/davidkpiano/xstate/pull/1317) Thanks [@Andarist](https://github.com/Andarist)! - `useMachine` and `useService` cant be now parametrized with a `TTypestate` parameter which makes leveraging typestates possible on their returned values.

## 0.2.0

### Minor Changes

- [`65c13245`](https://github.com/davidkpiano/xstate/commit/65c132458cdc73b242f9c0b22e61ba9ba7780509) [#1253](https://github.com/davidkpiano/xstate/pull/1253) Thanks [@darrenjennings](https://github.com/darrenjennings)! - Upgraded package for compatibility with the newest `@vue/composition-api@^0.6.0`, which means that a peer dependency requirement has changed to this version, which is a **breaking change**. The only observable behavior change is that exposed refs are now **shallow**.

## 0.1.1

### Patch Changes

- [`c057f38`](https://github.com/davidkpiano/xstate/commit/c057f38aa20d06501fd7e5893eef0d6688e547eb) [#976](https://github.com/davidkpiano/xstate/pull/976) Thanks [@Andarist](https://github.com/Andarist)! - Fixed issue with `useMachine` crashing without providing optional `options` parameter.

- Updated dependencies [[`520580b`](https://github.com/davidkpiano/xstate/commit/520580b4af597f7c83c329757ae972278c2d4494)]:
  - xstate@4.7.8
