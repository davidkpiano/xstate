import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';

function createTSCofig() {
  return typescript({
    tsconfigOverride: {
      compilerOptions: {
        declaration: false
      }
    }
  });
}

function createUmdConfig({ input, output: file, name }) {
  return {
    input,
    output: {
      file,
      format: 'umd',
      name,
      globals: {
        xstate: 'XState',
        '@xstate/react': 'XStateReact',
        '@react/composition-api': 'reactCompositionApi'
      }
    },
    plugins: [createTSCofig(), terser({ include: [/^.+\.min\.js$/] })]
  };
}

export default [
  createUmdConfig({
    name: 'XStateReact',
    input: 'src/index.ts',
    output: 'dist/xstate-react.js'
  }),
  createUmdConfig({
    name: 'XStateReact',
    input: 'src/index.ts',
    output: 'dist/xstate-react.min.js'
  }),
  createUmdConfig({
    name: 'XStateReactFSM',
    input: 'src/fsm.ts',
    output: 'dist/xstate-react.fsm.js'
  }),
  createUmdConfig({
    name: 'XStateReactFSM',
    input: 'src/fsm.ts',
    output: 'dist/xstate-react.fsm.min.js'
  })
];
