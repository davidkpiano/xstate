# Actors <Badge text="4.6+"/>

[:rocket: Quick Reference](#quick-reference)

[[toc]]

The [Actor model](https://en.wikipedia.org/wiki/Actor_model) is a mathematical model of message-based computation that simplifies how multiple "entities" (or "actors") communicate with each other. Actors communicate by sending messages (events) to each other. An actor's local state is private, unless it wishes to share it with another actor, by sending it as an event.

When an actor receives an event, three things can happen:

- A finite number of messages can be **sent** to other actors
- A finite number of new actors can be created (or **spawned**)
- The actor's local state may change (determined by its **behavior**)

State machines and statecharts work very well with the actor model, as they are event-based models of behavior and logic. Remember: when a state machine transitions due to an event, the next state contains:

- The next `value` and `context` (an actor's local state)
- The next `actions` to be executed (potentially newly spawned actors or messages sent to other actors)

Actors can be _spawned_ or [_invoked_](./communication.md). Spawned actors have two major differences from invoked actors:

- They can be _spawned_ at any time (via `spawn(...)` instead of an `assign(...)` action)
- They can be _stopped_ at any time (via a `stop(...)` action)

## Actor API

An actor (as implemented in XState) has an interface of:

- An `id` property, which uniquely identifies the actor in the local system
- A `.send(...)` method, which is used to send events to this actor
- A `.getSnapshot()` method, which synchronously returns the actor's last emitted value.

They may have optional methods:

- A `.stop()` method which stops the actor and performs any necessary cleanup
- A `.subscribe(...)` method for actors that are [Observable](https://github.com/tc39/proposal-observable).

All the existing invoked service patterns fit this interface:

- [Invoked promises](./communication.md#invoking-promises) are actors that ignore any received events and send at most one event back to the parent
- [Invoked callbacks](./communication.md#invoking-callbacks) are actors that can send events to the parent (first `callback` argument), receive events (second `onReceive` argument), and act on them
- [Invoked machines](./communication.md#invoking-machines) are actors that can send events to the parent (`sendParent(...)` action) or other actors it has references to (`send(...)` action), receive events, act on them (state transitions and actions), spawn new actors (`spawn(...)` function), and stop actors.
- [Invoked observables](./communication.md#invoking-observables) are actors whose emitted values represent events to be sent back to the parent.

## Spawning Actors

Just as in Actor-model-based languages like [Akka](https://doc.akka.io/docs/akka/current/guide/introduction.html) or [Erlang](http://www.erlang.org/docs), actors are spawned and referenced in `context` (as the result of an `assign(...)` action).

1. Import the `spawn` function from `'xstate'`
2. In an `assign(...)` action, create a new actor reference with `spawn(...)`

The `spawn(...)` function creates an **actor reference** by providing 1 or 2 arguments:

- `entity` - the (reactive) value or machine that represents the behavior of the actor. Possible types for `entity`:
  - [Machine](./communication.md#invoking-machines)
  - [Promise](./communication.md#invoking-promises)
  - [Callback](./communication.md#invoking-callbacks)
  - [Observable](./communication.md#invoking-observables)
- `name` (optional) - a string uniquely identifying the actor. This should be unique for all spawned actors and invoked services.

Alternatively `spawn` accepts an options object as the second argument which may contain the following options:

- `name` (optional) - a string uniquely identifying the actor. This should be unique for all spawned actors and invoked services.
- `autoForward` - (optional) `true` if all events sent to this machine should also be sent (or _forwarded_) to the invoked child (`false` by default)
- `sync` - (optional) `true` if this machine should be automatically subscribed to the spawned child machine's state, the state will be stored as `.state` on the child machine ref

```js {13-14}
import { createMachine, spawn } from 'xstate';
import { todoMachine } from './todoMachine';

const todosMachine = createMachine({
  // ...
  on: {
    'NEW_TODO.ADD': {
      actions: assign({
        todos: (context, event) => [
          ...context.todos,
          {
            todo: event.todo,
            // add a new todoMachine actor with a unique name
            ref: spawn(todoMachine, `todo-${event.id}`)
          }
        ]
      })
    }
    // ...
  }
});
```

If you do not provide a `name` argument to `spawn(...)`, a unique name will be automatically generated. This name will be nondeterministic :warning:.

::: tip
Treat `const actorRef = spawn(someMachine)` as just a normal value in `context`. You can place this `actorRef` anywhere within `context`, based on your logic requirements. As long as it's within an assignment function in `assign(...)`, it will be scoped to the service from where it was spawned.
:::

::: warning
Do not call `spawn(...)` outside of an assignment function. This will produce an orphaned actor (without a parent) which will have no effect.

```js
// ❌ Never call spawn(...) externally
const someActorRef = spawn(someMachine);

// ❌ spawn(...) is not an action creator
{
  actions: spawn(someMachine);
}

// ❌ Do not assign spawn(...) outside of an assignment function
{
  actions: assign({
    // remember: this is called immediately, before a service starts
    someActorRef: spawn(someMachine)
  });
}

// ✅ Assign spawn(...) inside an assignment function
{
  actions: assign({
    someActorRef: () => spawn(someMachine)
  });
}
```

:::

Different types of values can be spawned as actors.

## Sending Events to Actors

With the [`send()` action](./actions.md#send-action), events can be sent to actors via a [target expression](./actions.md#send-targets):

```js {13}
const machine = createMachine({
  // ...
  states: {
    active: {
      entry: assign({
        someRef: () => spawn(someMachine)
      }),
      on: {
        SOME_EVENT: {
          // Use a target expression to send an event
          // to the actor reference
          actions: send({ type: 'PING' }, { to: (context) => context.someRef })
        }
      }
    }
  }
});
```

::: tip
If you provide an unique `name` argument to `spawn(...)`, you can reference it in the target expression:

```js
const loginMachine = createMachine({
  // ...
  entry: assign({
    formRef: () => spawn(formMachine, 'form')
  }),
  states: {
    idle: {
      on: {
        LOGIN: {
          actions: send({ type: 'SUBMIT' }, { to: 'form' })
        }
      }
    }
  }
});
```

:::

## Stopping Actors

Actors are stopped using the `stop(...)` action creator:

```js
const someMachine = createMachine({
  // ...
  entry: [
    // Stopping an actor by reference
    stop((context) => context.someActorRef),
    // Stopping an actor by ID
    stop('some-actor')
  ]
});
```

## Spawning Promises

Just like [invoking promises](./communication.md#invoking-promises), promises can be spawned as actors. The event sent back to the machine will be a `'done.invoke.<ID>'` action with the promise response as the `data` property in the payload:

```js {11}
// Returns a promise
const fetchData = (query) => {
  return fetch(`http://example.com?query=${event.query}`).then((data) =>
    data.json()
  );
};

// ...
{
  actions: assign({
    ref: (_, event) => spawn(fetchData(event.query))
  });
}
// ...
```

::: warning
It is not recommended to spawn promise actors, as [invoking promises](./communication.md#invoking-promises) is a better pattern for this, since they are dependent on state (self-cancelling) and have more predictable behavior.
:::

## Spawning Callbacks

Just like [invoking callbacks](./communication.md#invoking-callbacks), callbacks can be spawned as actors. This example models a counter-interval actor that increments its own count every second, but can also react to `{ type: 'INC' }` events.

```js {22}
const counterInterval = (callback, receive) => {
  let count = 0;

  const intervalId = setInterval(() => {
    callback({ type: 'COUNT.UPDATE', count });
    count++;
  }, 1000);

  receive(event => {
    if (event.type === 'INC') {
      count++;
    }
  });

  return () => { clearInterval(intervalId); }
}

const machine = createMachine({
  // ...
  {
    actions: assign({
      counterRef: () => spawn(counterInterval)
    })
  }
  // ...
});
```

Events can then be sent to the actor:

```js {5-7}
const machine = createMachine({
  // ...
  on: {
    'COUNTER.INC': {
      actions: send({ type: 'INC' }, { to: (context) => context.counterRef })
    }
  }
  // ...
});
```

## Spawning Observables

Just like [invoking observables](./communication.md#invoking-observables), observables can be spawned as actors:

```js {22}
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

const createCounterObservable = (ms) => interval(ms)
  .pipe(map(count => ({ type: 'COUNT.UPDATE', count })))

const machine = createMachine({
  context: { ms: 1000 },
  // ...
  {
    actions: assign({
      counterRef: ({ ms }) => spawn(createCounterObservable(ms))
    })
  }
  // ...
  on: {
    'COUNT.UPDATE': { /* ... */ }
  }
});
```

## Spawning Machines

Machines are the most effective way to use actors, since they offer the most capabilities. Spawning machines is just like [invoking machines](./communication.md#invoking-machines), where a `machine` is passed into `spawn(machine)`:

```js {13,26,30-32}
const remoteMachine = createMachine({
  id: 'remote',
  initial: 'offline',
  states: {
    offline: {
      on: {
        WAKE: 'online'
      }
    },
    online: {
      after: {
        1000: {
          actions: sendParent('REMOTE.ONLINE')
        }
      }
    }
  }
});

const parentMachine = createMachine({
  id: 'parent',
  initial: 'waiting',
  context: {
    localOne: null
  },
  states: {
    waiting: {
      entry: assign({
        localOne: () => spawn(remoteMachine)
      }),
      on: {
        'LOCAL.WAKE': {
          actions: send({ type: 'WAKE' }, { to: (context) => context.localOne })
        },
        'REMOTE.ONLINE': { target: 'connected' }
      }
    },
    connected: {}
  }
});

const parentService = interpret(parentMachine)
  .onTransition((state) => console.log(state.value))
  .start();

parentService.send({ type: 'LOCAL.WAKE' });
// => 'waiting'
// ... after 1000ms
// => 'connected'
```

### Stopping Spawned Machines

The object returned from a successful `spawn` action is an `Interpreter`. It implements the `actor` interface, but has slightly different behavior. If you call `stop()` on an `Interpreter` it does not clean up any ongoing `activities` in the active `StateNode`. To properly stop spawned machines you must additionally send them an action using `actions.stop()`.

Further, as `assign` actions are run in advance of custom user actions, by the time you would usually attempt to stop a spawned machine, you may need to take care that the reference to the machine in `context` is not overwritten.

For actions which do not have side effects (such as mutating `context`), you can use `actions.pure()` to ensure that your custom actions is run in order of definition, and before `assign` actions' updates are applied to `context`. Depending upon why you need to stop a spawned machine, this technique may be required.

The below machine demonstrates how to use `actions.pure()` and `actions.stop()` to properly stop a consistently respawned machine.

```js {18-20,27-29,35}
const childMachine = Machine({
  id: 'child-machine',
  initial: 'idle',
  states: {
    idle: {
      /* ... */
    }
  }
});

const parentMachine = Machine({
  id: 'stoppable-machine',
  initial: 'spawn',
  context: {},

  states: {
    reset: {
      always: {
        target: 'spawn',
        actions: actions.pure((context) => {
          context.childMachine.stop();
          return actions.stop(context.childMachine.id);
        })
      }
    },

    spawn: {
      always: {
        target: 'waiting',
        actions: assign({
          childMachine: () => spawn(childMachine)
        })
      }
    },

    waiting: {
      after: {
        2000: 'reset'
      }
    }
  }
});
```

Using `actions.pure()` results in the properly interleaved ordering:

1. `assign({ childMachine: () => spawn(childMachine) })` (First time through.)
1. `actions.stop(context.childMachine.id)` (Second time through.)
1. `assign({ childMachine: () => spawn(childMachine) })` (Second time through.)
1. `actions.stop(context.childMachine.id)` (Third time through.)
1. `assign({ childMachine: () => spawn(childMachine) })` (Third time through.)

If you were to omit `actions.pure()` the order of actions would be:

1. `assign({ childMachine: () => spawn(childMachine) })` (First time through.)
1. `assign({ childMachine: () => spawn(childMachine) })` (Second time through.)
1. `actions.stop(context.childMachine.id)` (Second time through.)
1. `assign({ childMachine: () => spawn(childMachine) })` (Third time through.)
1. `actions.stop(context.childMachine.id)` (Third time through.)

This results in immediately stopping all spawned machines except for the first one, which instead continues running.

## Syncing and Reading State <Badge text="4.6.1+"/>

One of the main tenets of the Actor model is that actor state is _private_ and _local_ - it is never shared unless the actor chooses to share it, via message passing. Sticking with this model, an actor can _notify_ its parent whenever its state changes by sending it a special "update" event with its latest state. In other words, parent actors can subscribe to their child actors' states.

To do this, set `{ sync: true }` as an option to `spawn(...)`:

```js {4}
// ...
{
  actions: assign({
    // Actor will send update event to parent whenever its state changes
    someRef: () => spawn(todoMachine, { sync: true })
  });
}
// ...
```

This will automatically subscribe the machine to the spawned child machine's state, which is kept updated in `ref.state`:

```js
someService.onTransition((state) => {
  const { someRef } = state.context;

  console.log(someRef.state);
  // => State {
  //   value: ...,
  //   context: ...
  // }
});
```

::: warning
By default, `sync` is set to `false`. Never read an actor's `.state` when `sync` is disabled; otherwise, you will end up referencing stale state.
:::

## Sending Updates <Badge text="4.7+" />

For actors that are not synchronized with the parent, the actor can send an explicit event to its parent machine via `sendUpdate()`:

```js
import { createMachine, sendUpdate } from 'xstate';

const childMachine = createMachine({
  // ...
  on: {
    SOME_EVENT: {
      actions: [
        // ...
        // Creates an action that sends an update event to parent
        sendUpdate()
      ]
    }
  }
});
```

::: tip
Prefer sending events to the parent explicitly (`sendUpdate()`) rather than subscribing to every state change. Syncing with spawned machines can result in "chatty" event logs, since every update from the child results in a new `"xstate.update"` event sent from the child to the parent.
:::

## Quick Reference

**Import `spawn`** to spawn actors:

```js
import { spawn } from 'xstate';
```

**Spawn actors** in `assign` action creators:

```js
// ...
{
  actions: assign({
    someRef: (context, event) => spawn(someMachine)
  });
}
// ...
```

**Spawn different types** of actors:

```js
// ...
{
  actions: assign({
    // From a promise
    promiseRef: (context, event) =>
      spawn(
        new Promise((resolve, reject) => {
          // ...
        }),
        'my-promise'
      ),

    // From a callback
    callbackRef: (context, event) =>
      spawn((callback, receive) => {
        // send to parent
        callback('SOME_EVENT');

        // receive from parent
        receive((event) => {
          // handle event
        });

        // disposal
        return () => {
          /* do cleanup here */
        };
      }),

    // From an observable
    observableRef: (context, event) => spawn(someEvent$),

    // From a machine
    machineRef: (context, event) =>
      spawn(
        createMachine({
          // ...
        })
      )
  });
}
// ...
```

**Sync state** with an actor:

```js
// ...
{
  actions: assign({
    someRef: () => spawn(someMachine, { sync: true })
  });
}
// ...
```

**Getting a snapshot** from an actor: <Badge text="4.20.0+"/>

```js
service.onTransition((state) => {
  const { someRef } = state.context;

  someRef.getSnapshot();
  // => State { ... }
});
```

**Send event to actor** with `send` action creator:

```js
// ...
{
  actions: send(
    { type: 'SOME_EVENT' },
    {
      to: (context) => context.someRef
    }
  );
}
// ...
```

**Send event with data to actor** using a `send` expression:

```js
// ...
{
  actions: send((context, event) => ({ ...event, type: 'SOME_EVENT' }), {
    to: (context) => context.someRef
  });
}
// ...
```

**Send event from actor** to parent with `sendParent` action creator:

```js
// ...
{
  actions: sendParent({ type: 'ANOTHER_EVENT' });
}
// ...
```

**Send event with data from actor** to parent using a `sendParent` expression:

```js
// ...
{
  actions: sendParent((context, event) => ({
    ...context,
    type: 'ANOTHER_EVENT'
  }));
}
// ...
```

**Reference actors** from `context`:

```js
someService.onTransition((state) => {
  const { someRef } = state.context;

  console.log(someRef);
  // => { id: ..., send: ... }
});
```
