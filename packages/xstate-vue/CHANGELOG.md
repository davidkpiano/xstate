# @xstate/vue

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
      const service = useInterpret(machine, {}, (nextState) => {
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
