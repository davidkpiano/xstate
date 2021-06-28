# Context

[:rocket: Quick Reference](#quick-reference)

While _finite_ states are well-defined in finite state machines and statecharts, state that represents _quantitative data_ (e.g., arbitrary strings, numbers, objects, etc.) that can be potentially infinite is represented as [extended state](https://en.wikipedia.org/wiki/UML_state_machine#Extended_states) instead. This makes statecharts much more useful for real-life applications.

In XState, extended state is known as **context**. Below is an example of how `context` is used to simulate filling a glass of water:

```ts
import { createMachine, assign, ConditionPredicate } from 'xstate';

interface Context {
  amount: number;
}
type Event = { type: 'FILL' };

// Action to increment the context amount
const addWater = assign<Context, Event>({
  amount: (context) => context.amount + 1
});

// Guard to check if the glass is full
const glassIsFull: ConditionPredicate<Context, Event> = (context) =>
  context.amount >= 10;

const glassMachine = createMachine<Context, Event>(
  {
    id: 'glass',
    // the initial context (extended state) of the statechart
    context: {
      amount: 0
    },
    initial: 'empty',
    states: {
      empty: {
        on: {
          FILL: {
            target: 'filling',
            actions: 'addWater'
          }
        }
      },
      filling: {
        // Transient transition
        always: {
          target: 'full',
          cond: 'glassIsFull'
        },
        on: {
          FILL: {
            target: 'filling',
            actions: 'addWater'
          }
        }
      },
      full: {}
    }
  },
  {
    actions: { addWater },
    guards: { glassIsFull }
  }
);
```

The current context is referenced on the `State` as `state.context`:

```js
const nextState = glassMachine.transition(glassMachine.initialState, {
  type: 'FILL'
});

nextState.context;
// => { amount: 1 }
```

## Initial Context

The initial context is specified on the `context` property of the `Machine`:

```ts
const counterMachine = createMachine({
  id: 'counter',
  // initial context
  context: {
    count: 0,
    message: 'Currently empty',
    user: {
      name: 'David'
    },
    allowedToIncrement: true
    // ... etc.
  },
  states: {
    // ...
  }
});
```

For dynamic `context` (that is, `context` whose initial value is retrieved or provided externally), you can use a machine factory function that creates the machine with the provided context values (implementation may vary):

```ts
const createCounterMachine = (count, time) => {
  return createMachine({
    id: 'counter',
    // values provided from function arguments
    context: {
      count,
      time
    }
    // ...
  });
};

const counterMachine = createCounterMachine(42, Date.now());
```

Or for existing machines, `machine.withContext(...)` should be used:

```ts
const counterMachine = createMachine({
  /* ... */
});

// retrieved dynamically
const someContext = { count: 42, time: Date.now() };

const dynamicCounterMachine = counterMachine.withContext(someContext);
```

The initial context of a machine can be retrieved from its initial state:

```js
dynamicCounterMachine.initialState.context;
// => { count: 42, time: 1543687816981 }
```

This is preferred to accessing `machine.context` directly, since the initial state is computed with initial `assign(...)` actions and transient transitions, if any.

## Assign Action

The `assign()` action is used to update the machine's `context`. It takes the context "assigner", which represents how values in the current context should be assigned.

| Argument   | Type               | Description                                                                                |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `assigner` | object or function | The object assigner or function assigner which assigns values to the `context` (see below) |

The "assigner" can be an object (recommended):

```js
import { createMachine, assign } from 'xstate';
// example: property assigner

// ...
  actions: assign({
    // increment the current count by the event value
    count: (context, event) => context.count + event.value,

    // assign static value to the message (no function needed)
    message: 'Count changed'
  }),
// ...
```

Or it can be a function that returns the updated state:

```js
// example: context assigner

// ...

  // return a partial (or full) updated context
  actions: assign((context, event) => {
    return {
      count: context.count + event.value,
      message: 'Count changed'
    }
  }),
// ...
```

Both the property assigner and context assigner function signatures above are given 3 arguments: the `context`, `event`, and `meta`:

| Argument                     | Type        | Description                                         |
| ---------------------------- | ----------- | --------------------------------------------------- |
| `context`                    | TContext    | The current context (extended state) of the machine |
| `event`                      | EventObject | The event that triggered the `assign` action        |
| `meta` <Badge text="4.7+" /> | AssignMeta  | an object with meta data (see below)                |

The `meta` object contains:

- `state` - the current state in a normal transition (`undefined` for the initial state transition)
- `action` - the assign action

::: warning
The `assign(...)` function is an **action creator**; it is a pure function that only returns an action object and does _not_ imperatively make assignments to the context.
:::

## Action Order

Custom actions are always executed with regard to the _next state_ in the transition. When a state transition has `assign(...)` actions, those actions are always batched and computed _first_, to determine the next state. This is because a state is a combination of the finite state and the extended state (context).

For example, in this counter machine, the custom actions will not work as expected:

```ts
interface Context {
  count: number;
}

const counterMachine = createMachine<Context>({
  id: 'counter',
  context: { count: 0 },
  initial: 'active',
  states: {
    active: {
      on: {
        INC_TWICE: {
          actions: [
            (context) => console.log(`Before: ${context.count}`),
            assign({ count: (context) => context.count + 1 }), // count === 1
            assign({ count: (context) => context.count + 1 }), // count === 2
            (context) => console.log(`After: ${context.count}`)
          ]
        }
      }
    }
  }
});

interpret(counterMachine).send({ type: 'INC_TWICE' });
// => "Before: 2"
// => "After: 2"
```

This is because both `assign(...)` actions are batched in order and executed first (in the microstep), so the next state `context` is `{ count: 2 }`, which is passed to both custom actions. Another way of thinking about this transition is reading it like:

> When in the `active` state and the `INC_TWICE` event occurs, the next state is the `active` state with `context.count` updated, and _then_ these custom actions are executed on that state.

A good way to refactor this to get the desired result is modeling the `context` with explicit _previous_ values, if those are needed:

```ts
interface Context {
  count: number;
  prevCount: number | undefined;
}

const counterMachine = createMachine<Context>({
  id: 'counter',
  context: { count: 0, prevCount: undefined },
  initial: 'active',
  states: {
    active: {
      on: {
        INC_TWICE: {
          actions: [
            (context) => console.log(`Before: ${context.prevCount}`),
            assign({
              count: (context) => context.count + 1,
              prevCount: (context) => context.count
            }), // count === 1, prevCount === 0
            assign({ count: (context) => context.count + 1 }), // count === 2
            (context) => console.log(`After: ${context.count}`)
          ]
        }
      }
    }
  }
});

interpret(counterMachine).send({ type: 'INC_TWICE' });
// => "Before: 0"
// => "After: 2"
```

The benefits of this are:

1. The extended state (context) is modeled more explicitly
2. There are no implicit intermediate states, preventing hard-to-catch bugs
3. The action order is more independent (the "Before" log can even go after the "After" log!)
4. Facilitates testing and examining the state

## Notes

- 🚫 Never mutate the machine's `context` externally. Everything happens for a reason, and every context change should happen explicitly due to an event.
- Prefer the object syntax of `assign({ ... })`. This makes it possible for future analysis tools to predict _how_ certain properties can change declaratively.
- Assignments can be stacked, and will run sequentially:

```js
// ...
  actions: [
    assign({ count: 3 }), // context.count === 3
    assign({ count: context => context.count * 2 }) // context.count === 6
  ],
// ...
```

- Just like with `actions`, it's best to represent `assign()` actions as strings or functions, and then reference them in the machine options:

```ts {9}
interface Context {
  count: number;
}

const countMachine = createMachine<Context>(
  {
    initial: 'start',
    context: { count: 0 },
    states: {
      start: {
        entry: 'increment'
      }
    }
  },
  {
    actions: {
      increment: assign({ count: (context) => context.count + 1 }),
      decrement: assign({ count: (context) => context.count - 1 })
    }
  }
);
```

Or as named functions (same result as above):

```ts {13}
interface Context {
  count: number;
}

const increment = assign<Context>({ count: (context) => context.count + 1 });
const decrement = assign<Context>({ count: (context) => context.count - 1 });

const countMachine = createMachine<Context>({
  initial: 'start',
  context: { count: 0 },
  states: {
    start: {
      // Named function
      entry: increment
    }
  }
});
```

- Ideally, the `context` should be representable as a plain JavaScript object; i.e., it should be serializable as JSON.
- Since `assign()` actions are _raised_, the context is updated before other actions are executed. This means that other actions within the same step will get the _updated_ `context` rather than what it was before the `assign()` action was executed. You shouldn't rely on action order for your states, but keep this in mind. See [action order](#action-order) for more details.

## TypeScript

For proper type inference, add the context type as the first type parameter to `createMachine<TContext, ...>`:

```ts
interface CounterContext {
  count: number;
  user?: {
    name: string;
  };
}

const machine = createMachine<CounterContext>({
  // ...
  context: {
    count: 0,
    user: undefined
  }
  // ...
});
```

When applicable, you can also use `typeof ...` as a shorthand:

```ts
const context = {
  count: 0,
  user: { name: '' }
};

const machine = createMachine<typeof context>({
  // ...
  context
  // ...
});
```

In most cases, the types for `context` and `event` in `assign(...)` actions will be automatically inferred from the type parameters passed into `createMachine<TContext, TEvent>`:

```ts
interface CounterContext {
  count: number;
}
type CounterEvent = { type: 'INCREMENT' } | { type: 'RESET' };

const machine = createMachine<CounterContext>({
  // ...
  context: {
    count: 0
  },
  on: {
    INCREMENT: {
      // Inferred automatically in most cases
      actions: assign({
        count: (context) => {
          // context: { count: number }
          return context.count + 1;
        }
      })
    }
  }
});
```

However, TypeScript inference isn't perfect, so the responsible thing to do is to add the context and event as generics into `assign<Context, Event>(...)`. This is especially necessary for assigns that do not use the context parameter:

```ts {13}
interface CounterContext {
  count: number;
}
type CounterEvent = { type: 'INCREMENT' } | { type: 'RESET' };

const machine = createMachine<CounterContext>({
  context: {
    count: 0
  },
  on: {
    RESET: {
      // Generics guarantee proper inference
      actions: assign<CounterContext, CounterEvent>({
        count: () => {
          return 0;
        }
      })
    }
  }
});
```

## Quick Reference

**Set initial context**

```ts
const machine = createMachine({
  // ...
  context: {
    count: 0,
    user: undefined
    // ...
  }
});
```

**Set dynamic initial context**

```ts
const createSomeMachine = (count, user) => {
  return createMachine({
    // ...
    // Provided from arguments; your implementation may vary
    context: {
      count,
      user
      // ...
    }
  });
};
```

**Set custom initial context**

```ts
interface Context {
  count: number;
  user: { name: string } | undefined;
}

const machine = createMachine<Context>({
  // ...
  // Provided from arguments; your implementation may vary
  context: {
    count: 0,
    user: undefined
    // ...
  }
});

const myMachine = machine.withContext({
  count: 10,
  user: {
    name: 'David'
  }
});
```

**Assign to context**

```ts
interface Context {
  count: number;
  user: { name: string } | undefined;
}

const machine = createMachine<Context>({
  // ...
  context: {
    count: 0,
    user: undefined
    // ...
  },
  // ...
  on: {
    INCREMENT: {
      actions: assign({
        count: (context) => context.count + 1
      })
    }
  }
});
```

**Assignment (static)**

```js
// ...
actions: assign({
  counter: 42
}),
// ...
```

**Assignment (property)**

```js
// ...
actions: assign({
  counter: (context, event) => {
    return context.count + event.value;
  }
}),
// ...
```

**Assignment (context)**

```js
// ...
actions: assign((context, event) => {
  return {
    counter: context.count + event.value,
    time: event.time,
    // ...
  }
}),
// ...
```

**Assignment (multiple)**

```js
// ...
// assume context.count === 1
actions: [
  // assigns context.count to 1 + 1 = 2
  assign({ count: (context) => context.count + 1 }),
  // assigns context.count to 2 * 3 = 6
  assign({ count: (context) => context.count * 3 })
],
// ...
```
