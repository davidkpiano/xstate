import 'react-app-polyfill/ie11';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { ExtViz } from '../src/index';
import { createMachine } from 'xstate';
import { useMachine } from '@xstate/react';

const machine = createMachine({
  initial: 'green',
  id: 'light',
  states: {
    green: {
      on: {
        CLICK: 'yellow',
      },
    },
    yellow: {
      on: {
        CLICK: 'red',
      },
    },
    red: {
      on: {
        CLICK: 'green',
      },
    },
  },
});

const Counter = () => {
  // return null;
  const [state, send] = useMachine(machine, { devTools: true });
  return <h1 onClick={() => send('CLICK')}>{state.value}</h1>;
};

const App = () => {
  return (
    <div>
      <Counter />
      <ExtViz />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
