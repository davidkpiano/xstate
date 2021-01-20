# Delayed Events and Transitions

The concept of time and delays in statecharts is declarative - time is an event, just like any other. XState abstracts this notion in two ways: delayed transitions and delayed events. Under the hood, both work the same way.

## Delayed Transitions

Transitions can automatically take place after a delay. This is represented in a state definition in the `after` property, which maps millisecond delays to their transitions:

```js
const lightDelayMachine = Machine({
  id: 'lightDelay',
  initial: 'green',
  states: {
    green: {
      after: {
        // after 1 second, transition to yellow
        1000: 'yellow'
      }
    },
    yellow: {
      after: {
        // after 0.5 seconds, transition to red
        500: 'red'
      }
    },
    red: {
      after: {
        // after 2 seconds, transition to green
        2000: 'green'
      }
    }
  }
});
```

Delayed transitions can be specified in the same way that you specify them on the `on: ...` property. They can be explicit:

```js
// ...
states: {
  green: {
    after: {
      1000: { target: 'yellow' }
    }
  }
}
// ...
```

They can be also be conditional with regard to a single delay value:

```js
// ...
states: {
  green: {
    after: {
      1000: [
        { target: 'yellow', cond: 'trafficIsLight' },
        { target: 'green' } // reenter 'green' state
      ]
    }
  }
}
// ...
```

Or they can be conditional for multiple delays. The first selected delayed transition will be taken, which will prevent later transitions from being taken. In this example, if the `'trafficIsLight'` condition is `true`, then the later `2000: 'yellow'` transition will not be taken:

```js
// ...
states: {
  green: {
    after: {
      1000: { target: 'yellow', cond: 'trafficIsLight' },
      2000: 'yellow' // always transition to 'yellow' after 2 seconds
    }
  }
}
// ...
```

Conditional delayed transitions can also be specified as an array:

```js
// ...
states: {
  green: {
    after: [
      { delay: 1000, target: 'yellow', cond: 'trafficIsLight' },
      { delay: 2000, target: 'yellow' }
    ];
  }
}
// ...
```

### Delay Expressions on Transitions <Badge text="4.4+" />

Delayed transitions specified on the `after: { ... }` property can have dynamic delays, specified either by a string delay reference:

```js
const lightDelayMachine = Machine(
  {
    id: 'lightDelay',
    initial: 'green',
    context: {
      trafficLevel: 'low'
    },
    states: {
      green: {
        after: {
          // after 1 second, transition to yellow
          LIGHT_DELAY: 'yellow'
        }
      },
      yellow: {
        after: {
          YELLOW_LIGHT_DELAY: 'red'
        }
      }
      // ...
    }
  },
  {
    // String delays configured here
    delays: {
      LIGHT_DELAY: (context, event) => {
        return context.trafficLevel === 'low' ? 1000 : 3000;
      },
      YELLOW_LIGHT_DELAY: 500 // static value
    }
  }
);
```

Or directly by a function, just like conditional delayed transitions:

```js
// ...
green: {
  after: [
    {
      delay: (context, event) => {
        return context.trafficLevel === 'low' ? 1000 : 3000;
      },
      target: 'yellow'
    }
  ]
},
// ...
```

However, prefer using string delay references, just like the first example, or in the `delay` property:

```js
// ...
green: {
  after: [
    {
      delay: 'LIGHT_DELAY',
      target: 'yellow'
    }
  ]
},
// ...
```

## Delayed Events

If you just want to send an event after a delay, you can specify the `delay` as an option in the second argument of the `send(...)` action creator:

```js
import { actions } from 'xstate';
const { send } = actions;

// action to send the 'TIMER' event after 1 second
const sendTimerAfter1Second = send('TIMER', { delay: 1000 });
```

You can also prevent those delayed events from being sent by cancelling them. This is done with the `cancel(...)` action creator:

```js
import { actions } from 'xstate';
const { send, cancel } = actions;

// action to send the 'TIMER' event after 1 second
const sendTimerAfter1Second = send('TIMER', {
  delay: 1000,
  id: 'oneSecondTimer' // give the event a unique ID
});

const cancelTimer = cancel('oneSecondTimer'); // pass the ID of event to cancel

const toggleMachine = Machine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      entry: sendTimerAfter1Second,
      on: {
        TIMER: 'active'
        CANCEL: { actions: cancelTimer }
      }
    },
    active: {}
  }
});

// if the CANCEL event is sent before 1 second, the TIMER event will be canceled.
```

## Delay Expressions <Badge text="4.3+" />

The `delay` option can also be evaluated as a delay expression, which is a function that takes in the current `context` and `event` that triggered the `send()` action, and returns the resolved `delay` (in milliseconds):

```js
const dynamicDelayMachine = Machine({
  id: 'dynamicDelay',
  context: {
    initialDelay: 1000
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        ACTIVATE: 'pending'
      }
    },
    pending: {
      entry: send('FINISH', {
        // delay determined from custom event.wait property
        delay: (context, event) => context.initialDelay + event.wait || 0
      }),
      on: {
        FINISH: 'finished'
      }
    },
    finished: { type: 'final' }
  }
});

const dynamicDelayService = interpret(dynamicDelayMachine)
  .onDone(() => console.log('done!'))
  .start();

dynamicDelayService.send({
  type: 'ACTIVATE',
  // arbitrary property
  wait: 2000
});

// after 3000ms (1000 + 2000), console will log:
// => 'done!'
```

## Interpretation

With the XState [interpreter](./interpretation.md), delayed actions will use the native`setTimeout` and `clearTimeout` functions:

```js
import { interpret } from 'xstate';

const service = interpret(lightDelayMachine).onTransition(state =>
  console.log(state.value)
);

service.start();
// => 'green'

// (after 1 second)

// => 'yellow'
```

For testing, the XState interpreter provides a `SimulatedClock`:

```js
import { interpret } from 'xstate';
// import { SimulatedClock } from 'xstate/lib/interpreter'; // < 4.6.0
import { SimulatedClock } from 'xstate/lib/SimulatedClock'; // >= 4.6.0

const simulatedClock = new SimulatedClock();
const service = interpret(lightDelayMachine, {
  clock: simulatedClock
}).onTransition(state => console.log(state.value));

service.start();
// => 'green'

// move the SimulatedClock forward by 1 second
simulatedClock.increment(1000);
// => 'yellow'
```

You can create your own "clock" to provide to the interpreter. The clock interface is an object with two functions/methods:

- `setTimeout` - same arguments as `window.setTimeout(fn, timeout)`
- `clearTimeout` - same arguments as `window.clearTimeout(id)`

## Behind the scenes

The `after: ...` property does not introduce anything new to statechart semantics. Instead, it creates normal transitions that look like this:

```js
// ...
states: {
  green: {
    entry: [
      send(after(1000, 'light.green'), { delay: 1000 }),
      send(after(2000, 'light.green'), { delay: 2000 })
    ],
    onExit: [
      cancel(after(1000, 'light.green')),
      cancel(after(2000, 'light.green'))
    ],
    on: {
      [after(1000, 'light.green')]: {
        target: 'yellow',
        cond: 'trafficIsLight'
      },
      [after(2000, 'light.green')]: {
        target: 'yellow'
      }
    }
  }
}
// ...
```

The interpreted statechart will `send(...)` the `after(...)` events after their `delay`, unless the state node is exited, which will `cancel(...)` those delayed `send(...)` events.
