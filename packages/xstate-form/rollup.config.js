import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import replace from 'rollup-plugin-replace';
import pkg from './package.json';

function createTSConfig() {
  return typescript({
    tsconfigOverride: {
      compilerOptions: {
        declaration: false
      }
    }
  });
}

const makeExternalPredicate = (externalArr) => {
  if (externalArr.length === 0) {
    return () => false;
  }
  const pattern = new RegExp(`^(${externalArr.join('|')})($|/)`);
  return (id) => pattern.test(id);
};

function createUmdConfig({ input, output: file, name }) {
  return {
    input,
    external: makeExternalPredicate(Object.keys(pkg.peerDependencies)),
    output: {
      file,
      format: 'umd',
      name,
      globals: {
        xstate: 'XState'
      }
    },
    plugins: [
      commonjs(),
      nodeResolve({
        browser: true
      }),
      replace({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      createTSConfig(),
      terser()
    ]
  };
}

export default [
  createUmdConfig({
    name: 'XStateForm',
    input: 'src/index.ts',
    output: 'dist/xstate-form.umd.min.js'
  })
];
