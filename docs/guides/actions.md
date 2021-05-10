# Actions

Actions are fire-and-forget ["side effects"](./effects.md). For a machine to be useful in a real-world application, side effects need to occur to make things happen in the real world, such as rendering to a screen.

Actions are _not_ immediately triggered. Instead, [the `State` object](./states.md) returned from `machine.transition(...)` will declaratively provide an array of `.actions` that an interpreter can then execute.

::: danger

All of the action creators documented here have a return type of **action object**; they do not return a function. This means they do _not_ imperatively send an event. An action creator should be viewed more like a "function as value". This is not always obvious given how they are used to configure actions.  The following examples highlight the do's and don'ts of how to use these action creators.

```js
// 🚫 Don't do this!
entry: () => {
  // 🚫 This will do nothing; send() is not an imperative function!
  send('SOME_EVENT');
};

console.log(send('SOME_EVENT'));
// => { type: 'xstate.send', event: { ... } }

// ✅ Do this instead
entry: send('SOME_EVENT');
```

:::

There are three types of actions:

- `entry` actions are executed upon entering a state
- `exit` actions are executed upon exiting a state
- transition actions are executed when a transition is taken.

These are represented in the StateNode definition:

```js {10-11,16-19,27-41}
const triggerMachine = createMachine(
  {
    id: 'trigger',
    initial: 'inactive',
    states: {
      inactive: {
        on: {
          TRIGGER: {
            target: 'active',
            // transition actions
            actions: ['activate', 'sendTelemetry']
          }
        }
      },
      active: {
        // entry actions
        entry: ['notifyActive', 'sendTelemetry'],
        // exit actions
        exit: ['notifyInactive', 'sendTelemetry'],
        on: {
          STOP: 'inactive'
        }
      }
    }
  },
  {
    actions: {
      // action implementations
      activate: (context, event) => {
        console.log('activating...');
      },
      notifyActive: (context, event) => {
        console.log('active!');
      },
      notifyInactive: (context, event) => {
        console.log('inactive!');
      },
      sendTelemetry: (context, event) => {
        console.log('time:', Date.now());
      }
    }
  }
);
```

<details>
  <summary>
    When should I use transition vs. entry/exit actions?
  </summary>

It depends! They mean different things:

- An entry/exit actions means "execute this action **on any transition that enters/exits this state**". Use entry/exit actions when the action is only dependent on the state node that it's in, and not on previous/next state nodes or events.

```js
// ...
{
  idle: {
    on: {
      LOAD: 'loading'
    }
  },
  loading: {
    // this action is executed whenever the 'loading' state is entered
    entry: 'fetchData'
  }
}
// ...
```

- A transition actions mean "execute this action **only on this transition**". Use transition actions when the action is dependent on the event and the state node that it is currently in.

```js
// ...
{
  idle: {
    on: {
      LOAD: {
        target: 'loading',
        // this action is executed only on this transition
        actions: 'fetchData'
    }
  },
  loading: {
    // ...
  }
}
// ...
```

</details>

::: tip
Action implementations can be quickly prototyped by specifying the action function directly in the machine config:

```js {4}
// ...
TRIGGER: {
  target: 'active',
  actions: (context, event) => { console.log('activating...'); }
}
// ...
```

It is _not recommended_ to keep the machine config like this in production code, as this makes it difficult to debug, serialize, test, and accurately visualize actions. Always prefer refactoring inline action implementations in the `actions` property of the machine options, like the previous example.
:::

## Declarative Actions

The `State` instance returned from `machine.transition(...)` has an `.actions` property, which is an array of action objects for the interpreter to execute:

```js {4-9}
const activeState = triggerMachine.transition('inactive', 'TRIGGER');

console.log(activeState.actions);
// [
//   { type: 'activate', exec: ... },
//   { type: 'sendTelemetry', exec: ... },
//   { type: 'notifyActive', exec: ... },
//   { type: 'sendTelemetry', exec: ... }
// ]
```

Each action object has two properties (and others, that you can specify):

- `type` - the action type
- `exec` - the action implementation function

The `exec` function takes three arguments:

| Argument     | Type         | Description                                                 |
| ------------ | ------------ | ----------------------------------------------------------- |
| `context`    | TContext     | The current machine context                                 |
| `event`      | event object | The event that caused the transition                        |
| `actionMeta` | meta object  | An object containing meta data about the action (see below) |

The `actionMeta` object includes the following properties:

| Property | Type          | Description                                  |
| -------- | ------------- | -------------------------------------------- |
| `action` | action object | The original action object                   |
| `state`  | State         | The resolved machine state, after transition |

The interpreter will call the `exec` function with the `currentState.context`, the `event`, and the `state` that the machine transitioned to. This behavior can be customized. See [executing actions](./interpretation.md#executing-actions) for more details.

## Action order

When interpreting statecharts, the order of actions should not necessarily matter (that is, they should not be dependent on each other). However, the order of the actions in the `state.actions` array is:

1. `exit` actions - all the exit actions of the exited state node(s), from the atomic state node up
2. transition `actions` - all actions defined on the chosen transition
3. `entry` actions - all the entry actions of the entered state node(s), from the parent state down

## Send Action

The `send(event)` action creator creates a special "send" action object that tells a service (i.e., [interpreted machine](./interpretation.md)) to send that event to itself. It queues an event to the running service, in the external event queue. This means the event is sent on the next "step" of the interpreter.

| Argument   | Type                                       | Description                                               |
| ---------- | ------------------------------------------ | --------------------------------------------------------- |
| `event`    | string or event object or event expression | The event to send to the specified `options.to` (or self) |
| `options?` | send options (see below)                   | Options for sending the event.                            |

The send `options` argument is an object containing:

| Property | Type   | Description                                                                                   |
| -------- | ------ | --------------------------------------------------------------------------------------------- |
| `id?`    | string | The send ID (used for cancellation)                                                           |
| `to?`    | string | The target of the event (defaults to self)                                                    |
| `delay?` | number | The timeout (milliseconds) before sending the event, if it is not canceled before the timeout |

::: warning
The `send(...)` function is an **action creator**; it is a pure function that only returns an action object and does _not_ imperatively send an event.
:::

```js
import { createMachine, send } from 'xstate';

const lazyStubbornMachine = createMachine({
  id: 'stubborn',
  initial: 'inactive',
  states: {
    inactive: {
      on: {
        TOGGLE: {
          target: 'active',
          // send the TOGGLE event again to the service
          actions: send('TOGGLE')
        }
      }
    },
    active: {
      on: {
        TOGGLE: 'inactive'
      }
    }
  }
});

const nextState = lazyStubbornMachine.transition('inactive', 'TOGGLE');

nextState.value;
// => 'active'
nextState.actions;
// => [{ type: 'xstate.send', event: { type: 'TOGGLE' }}]

// The service will proceed to send itself the { type: 'TOGGLE' } event.
```

The `event` argument passed to `send(event)` can be:

- A string event, e.g., `send('TOGGLE')`
- An event object, e.g., `send({ type: 'TOGGLE', payload: ... })`
- An event expression, which is a function that takes in the current `context` and `event` that triggered the `send()` action, and returns an event object:

```js
import { send } from 'xstate';

// contrived example - reads from the `context` and sends
// the dynamically created event
const sendName = send((context, event) => ({
  type: 'NAME',
  name: context.user.name
}));

const machine = createMachine({
  // ...
  on: {
    TOGGLE: {
      actions: sendName
    }
  }
  //...
});
```

### Send Targets

An event sent from a `send(...)` action creator can signify that it should be sent to specific targets, such as [invoked services](./communication.md) or [spawned actors](./actors.md). This is done by specifying the `{ to: ... }` property in the `send(...)` action:

```js
// ...
invoke: {
  id: 'some-service-id',
  src: 'someService',
  // ...
},
// ...
// Indicates to send { type: 'SOME_EVENT' } to the invoked service
actions: send('SOME_EVENT', { to: 'some-service-id' })
```

The target in the `to` prop can also be a **target expression**, which is a function that takes in the current `context` and `event` that triggered the action, and returns either a string target or an [actor reference](./actors.md#spawning-actors):

```js
entry: assign({
  someActor: () => {
    const name = 'some-actor-name';

    return {
      name,
      ref: spawn(someMachine, name);
    }
  }
}),
// ...

// Send { type: 'SOME_EVENT' } to the actor ref via string target
{
  actions: send('SOME_EVENT', {
    to: context => context.someActor.name
  })
}
// ...

// Send { type: 'SOME_EVENT' } to the actor ref via ref target
{
  actions: send('SOME_EVENT', {
    to: context => context.someActor.ref
  })
}
```

::: warning
Again, the `send(...)` function is an action creator and **will not imperatively send an event.** Instead, it returns an action object that describes where the event will be sent to:

```js
console.log(send('SOME_EVENT', { to: 'child' }));
// logs:
// {
//   type: 'xstate.send',
//   to: 'child',
//   event: {
//     type: 'SOME_EVENT'
//   }
// }
```

:::

## Raise Action

The `raise()` action creator queues an event to the statechart, in the internal event queue. This means the event is immediately sent on the current "step" of the interpreter.

| Argument | Type                   | Description         |
| -------- | ---------------------- | ------------------- |
| `event`  | string or event object | The event to raise. |

```js
import { createMachine, actions } from 'xstate';
const { raise } = actions;

const raiseActionDemo = createMachine({
  id: 'raisedmo',
  initial: 'entry',
  states: {
    entry: {
      on: {
        STEP: {
          target: 'middle'
        },
        RAISE: {
          target: 'middle',
          // immediately invoke the NEXT event for 'middle'
          actions: raise('NEXT')
        }
      }
    },
    middle: {
      on: {
        NEXT: 'last'
      }
    },
    last: {
      on: {
        RESET: 'entry'
      }
    }
  }
});
```

Click on both `STEP` and `RAISE` events in the [visualizer](https://xstate.js.org/viz/?gist=fd763ff2c161b172f719891e2544d428) to see the difference.

## Respond Action <Badge text="4.7+" />

The `respond()` action creator creates a [`send()` action](#send-action) that is sent to the service that sent the event which triggered the response.

This uses [SCXML events](./events.md#scxml-events) internally to get the `origin` from the event and set the `to` of the `send()` action to the `origin`.

| Argument   | Type                                     | Description                             |
| ---------- | ---------------------------------------- | --------------------------------------- |
| `event`    | string, event object, or send expression | The event to send back to the sender    |
| `options?` | send options object                      | Options to pass into the `send()` event |

**Example:**

This demonstrates some parent service (`authClientMachine`) sending a `'CODE'` event to the invoked `authServerMachine`, and the `authServerMachine` responding with a `'TOKEN'` event.

```js
const authServerMachine = createMachine({
  initial: 'waitingForCode',
  states: {
    waitingForCode: {
      on: {
        CODE: {
          actions: () => respond('TOKEN', { delay: 10 })
        }
      }
    }
  }
});

const authClientMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { AUTH: 'authorizing' }
    },
    authorizing: {
      invoke: {
        id: 'auth-server',
        src: authServerMachine
      },
      entry: send('CODE', { to: 'auth-server' }),
      on: {
        TOKEN: 'authorized'
      }
    },
    authorized: {
      type: 'final'
    }
  }
});
```

See [📖 Sending Responses](./actors.md#sending-responses) for more details.

## Forward To Action <Badge text="4.7+" />

The `forwardTo()` action creator creates a [`send()` action](#send-action) that forwards the most recent event to the specified service via its ID.

| Argument | Type                                    | Description                                          |
| -------- | --------------------------------------- | ---------------------------------------------------- |
| `target` | string or function that returns service | The target service to send the most recent event to. |

**Example:**

```js
import { createMachine, forwardTo, interpret } from 'xstate';

function alertService(_, receive) {
  receive((event) => {
    if (event.type === 'ALERT') {
      alert(event.message);
    }
  });
}

const parentMachine = createMachine({
  id: 'parent',
  invoke: {
    id: 'alerter',
    src: () => alertService
  },
  on: {
    ALERT: { actions: forwardTo('alerter') }
  }
});

const parentService = interpret(parentMachine).start();

parentService.send('ALERT', { message: 'hello world' });
// => alerts "hello world"
```

## Escalate Action <Badge text="4.7+" />

The `escalate()` action creator escalates an error by sending it to the parent machine. This is sent as a special error event that is recognized by the machine.

| Argument    | Type | Description                                      |
| ----------- | ---- | ------------------------------------------------ |
| `errorData` | any  | The error data to escalate (send) to the parent. |

**Example:**

```js
import { createMachine, actions } from 'xstate';
const { escalate } = actions;

const childMachine = createMachine({
  // ...
  // This will be sent to the parent machine that invokes this child
  entry: escalate({ message: 'This is some error' })
});

const parentMachine = createMachine({
  // ...
  invoke: {
    src: childMachine,
    onError: {
      actions: (context, event) => {
        console.log(event.data);
        //  {
        //    type: ...,
        //    data: {
        //      message: 'This is some error'
        //    }
        //  }
      }
    }
  }
});
```

## Log Action

The `log()` action creator is a declarative way of logging anything related to the current state `context` and/or `event`. It takes two optional arguments:

| Argument | Type               | Description                                                                                                     |
| -------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `expr?`  | string or function | A plain string or a function that takes the `context` and `event` as arguments and returns a value to be logged |
| `label?` | string             | A string to label the logged message                                                                            |

```js {9,14-17,28-34}
import { createMachine, actions } from 'xstate';
const { log } = actions;

const loggingMachine = createMachine({
  id: 'logging',
  context: { count: 42 },
  initial: 'start',
  states: {
    start: {
      entry: log('started!'),
      on: {
        FINISH: {
          target: 'end',
          actions: log(
            (context, event) => `count: ${context.count}, event: ${event.type}`,
            'Finish label'
          )
        }
      }
    },
    end: {}
  }
});

const endState = loggingMachine.transition('start', 'FINISH');

endState.actions;
// [
//   {
//     type: 'xstate.log',
//     label: 'Finish label',
//     expr: (context, event) => ...
//   }
// ]

// The interpreter would log the action's evaluated expression
// based on the current state context and event.
```

Without any arguments, `log()` is an action that logs an object with `context` and `event` properties, containing the current context and triggering event, respectively.

## Choose Action

The `choose()` action creator creates an action that specifies which actions should be executed based on some conditions.

| Argument | Type  | Description                                                                                       |
| -------- | ----- | ------------------------------------------------------------------------------------------------- |
| `conds`  | array | An array of objects containing the `actions` to execute when the given `cond` is true (see below) |

**Returns:**

A special `"xstate.choose"` action object that is internally evaluated to conditionally determine which action objects should be executed.

Each "conditional actions" object in `cond` has these properties:

- `actions` - the action objects to execute
- `cond?` - the condition for executing those `actions`

::: warning
Do not use the `choose()` action creator to execute actions that can otherwise be represented as non-conditional actions executed in certain states/transitions via `entry`, `exit`, or `actions`.
:::

```js
import { actions } from 'xstate';

const { choose, log } = actions;

const maybeDoThese = choose([
  {
    cond: 'cond1',
    actions: [
      // selected when "cond1" is true
      log('cond1 chosen!')
    ]
  },
  {
    cond: 'cond2',
    actions: [
      // selected when "cond1" is false and "cond2" is true
      log((context, event) => {
        /* ... */
      }),
      log('another action')
    ]
  },
  {
    cond: (context, event) => {
      // some condition
      return false;
    },
    actions: [
      // selected when "cond1" and "cond2" are false and the inline `cond` is true
      (context, event) => {
        // some other action
      }
    ]
  },
  {
    actions: [
      log('fall-through action')
      // selected when "cond1", "cond2", and "cond3" are false
    ]
  }
]);
```

This is analogous to the SCXML `<if>`, `<elseif>`, and `<else>` elements: [www.w3.org/TR/scxml/#if](https://www.w3.org/TR/scxml/#if)

## Pure Action

The `pure()` action creator is a pure function (hence the name) that returns the action object(s) to be executed based on the current state `context` and `event` that triggered the action. This allows you to dynamically define which actions should be executed.

| Argument     | Type     | Description                                                                                                      |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `getActions` | function | A function that returns the action object(s) to be executed based on the given `context` and `event` (see below) |

**Returns:**

A special `"xstate.pure"` action object that will internally evaluate the `get` property to determine the action objects that should be executed.

Arguments for `getActions(context, event)`:

| Argument  | Type         | Description                                 |
| --------- | ------------ | ------------------------------------------- |
| `context` | object       | The current state `context`                 |
| `event`   | event object | The event object that triggered the actions |

**Returns:**

A single action object, an array of action objects, or `undefined` that represents no action objects.

```js
import { createMachine, actions } from 'xstate';

const { pure } = actions;

// Dynamically send an event to every invoked sample actor
const sendToAllSampleActors = pure((context, event) => {
  return context.sampleActors.map((sampleActor) => {
    return send('SOME_EVENT', { to: sampleActor });
  });
});
// => {
//   type: ActionTypes.Pure,
//   get: () => ... // evaluates to array of send() actions
// }

const machine = createMachine({
  // ...
  states: {
    active: {
      entry: sendToAllSampleActors
    }
  }
});
```

## Actions on self-transitions

A [self-transition](./transitions.md#self-transitions) is when a state transitions to itself, in which it _may_ exit and then reenter itself. Self-transitions can either be an **internal** or **external** transition:

- An internal transition will _not_ exit and reenter itself, so the state node's `entry` and `exit` actions will not be executed again.
  - Internal transitions are indicated with `{ internal: true }`, or by leaving the `target` as `undefined`.
  - Actions defined on the transition's `actions` property will be executed.
- An external transition _will_ exit and reenter itself, so the state node's `entry` and `exit` actions will be executed again.
  - All transitions are external by default. To be explicit, you can indicate them with `{ internal: false }`.
  - Actions defined on the transition's `actions` property will be executed.

For example, this counter machine has one `'counting'` state with internal and external transitions:

```js {9-12}
const counterMachine = createMachine({
  id: 'counter',
  initial: 'counting',
  states: {
    counting: {
      entry: 'enterCounting',
      exit: 'exitCounting',
      on: {
        // self-transitions
        INC: { actions: 'increment' }, // internal (implicit)
        DEC: { target: 'counting', actions: 'decrement' }, // external
        DO_NOTHING: { internal: true, actions: 'logNothing' } // internal (explicit)
      }
    }
  }
});

// External transition (exit + transition actions + entry)
const stateA = counterMachine.transition('counting', 'DEC');
stateA.actions;
// ['exitCounting', 'decrement', 'enterCounting']

// Internal transition (transition actions)
const stateB = counterMachine.transition('counting', 'DO_NOTHING');
stateB.actions;
// ['logNothing']

const stateC = counterMachine.transition('counting', 'INC');
stateB.actions;
// ['increment']
```

## SCXML

Executable actions in transitions are equivalent to the `<script>` element. The `entry` and `exit` properties are equivalent to the `<onentry>` and `<onexit>` elements, respectively.

```js
{
  start: {
    entry: 'showStartScreen',
    exit: 'logScreenChange',
    on: {
      STOP: {
        target: 'stop',
        actions: ['logStop', 'stopEverything']
      }
    }
  }
}
```

```xml
<state id="start">
  <onentry>
    <script>showStartScreen();</script>
  </onentry>
  <onexit>
    <script>logScreenChange();</script>
  </onexit>
  <transition event="STOP" target="stop">
    <script>logStop();</script>
    <script>stopEverything();</script>
  </transition>
</state>
```

- [https://www.w3.org/TR/scxml/#script](https://www.w3.org/TR/scxml/#script) - the definition of the `<script>` element
- [https://www.w3.org/TR/scxml/#onentry](https://www.w3.org/TR/scxml/#onentry) - the definition of the `<onentry>` element
- [https://www.w3.org/TR/scxml/#onexit](https://www.w3.org/TR/scxml/#onexit) - the definition of the `<onexit>` element
