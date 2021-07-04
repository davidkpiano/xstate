# Usage with Ember

The most straightforward way of using XState with Ember.js is through the [ember-statecharts](https://ember-statecharts.com)-addon.
You can also write a custom integration layer yourself if you want to.

The machine used should always be decoupled from implementation details; e.g., it should never know that it is in Ember.js (or React, or Vue, etc.):

```js
import { createMachine } from 'xstate';

// This machine is completely decoupled from Ember
export const toggleMachine = createMachine({
  id: 'toggle',
  context: {
    /* some data */
  },
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
```

## ember-statecharts

Using [ember-statecharts](https://ember-statecharts.com) makes it easy to use
XState in your Ember.js codebase.

The addon provides the `useMachine`-API that you can use to interpret and use
XState machines:

```js
import Component from '@glimmmer/component';
import { action } from '@ember/object';

import { useMachine, matchesState } from 'ember-statecharts';

// @use (https://github.com/emberjs/rfcs/pull/567) is still WIP - polyfill it
import { use } from 'ember-usable';

import toggleMachine from './path/to/toggleMachine';

export default class ToggleComponent extends Component {
  @use statechart = useMachine(toggleMachine);

  @matchesState('active')
  isActive;

  @matchesState('inactive')
  isInactive;

  @action
  toggle() {
    this.statechart.send('TOGGLE');
  }
}
```

## Custom integration

To integrate XState into your Ember.js codebase without using an addon, you can
follow a similar pattern to [Vue](./vue.md):

- The machine can be defined externally;
- The service is placed as a property of the component;
- State changes are observed via `interpreter.onTransition(state => ...)`, where you set some data property to the next `state`;
- The machine's context can be referenced as an external data store by the app. Context changes are also observed via `interpreter.onTransition(state => ...)`, where you set another data property to the updated context;
- The interpreter is started (`interpreter.start()`) when the component is created `constructor()`;
- Events are sent to the interpreter via `interpreter.send(event)`.

::: tip
This example is based on Ember Octane features (Ember 3.13+)
:::

```handlebars
<button type="button" {{on "click" (fn this.transition "TOGGLE")}}>
  {{if this.isInactive "Off" "On"}}
</button>
```

```js
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { interpret } from 'xstate';
import { toggleMachine } from '../path/to/toggleMachine';

export default class ToggleButton extends Component {
  @tracked current;

  get context() {
    return this.current.context;
  }

  get isInactive() {
    return this.current.matches('inactive');
  }

  constructor() {
    super(...arguments);
    this.toggleInterpreter = interpret(toggleMachine);
    this.toggleInterpreter
      .onTransition((state) => (this.current = state))
      .start();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.toggleInterpreter.stop();
  }

  @action
  transition(...args) {
    this.toggleInterpreter.send(...args);
  }
}
```
