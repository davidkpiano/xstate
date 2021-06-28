# `@xstate/inspect`

Inspection tools for XState.

- [XState (Vanilla)](https://codesandbox.io/s/xstate-ts-viz-template-qzdvv)
- [XState + TypeScript](https://codesandbox.io/s/xstate-ts-viz-template-qzdvv)
- [XState + Vue](https://codesandbox.io/s/xstate-vue-viz-template-r5wd7)
- [XState + React](https://codesandbox.io/s/xstate-react-viz-template-5wq3q)

![Inspector running from CodeSandbox](https://buttondown.s3.us-west-2.amazonaws.com/images/4c8c0db4-b4d5-408f-8684-57e94ff46c86.png)

[See CodeSandbox example here](https://codesandbox.io/s/xstate-vue-minute-timer-viz-1txmk)

## Installation

1. Install with npm or yarn:

```bash
npm install @xstate/inspect
# or yarn add @xstate/inspect
```

2. Import it at the beginning of your project, before any other code is called:

```js
import { inspect } from '@xstate/inspect';

inspect({
  // options
  // url: 'https://statecharts.io/inspect', // (default)
  iframe: false // open in new window
});
```

3. Add `{ devTools: true }` to any interpreted machines you want to visualize:

```js
import { interpret } from 'xstate';
import { inspect } from '@xstate/inspect';
// ...

const service = interpret(someMachine, { devTools: true });
```

## Inspect Options

```js
// defaults
inspect({
  iframe: () => document.querySelector('iframe[data-xstate]'),
  url: 'https://statecharts.io/inspect'
});

// the above is the same as this:
inspect();
```

**Arguments:** the `options` object passed to `inspect(options)` with the following optional properties:

- `iframe` (function or iframe `Element` or `false`) - resolves to the `iframe` element to display the inspector in. If this is set to `iframe: false`, then a popup window will be used instead.

  ⚠️ Note: you might need to allow popups to display the inspector in a popup window, as they might be blocked by the browser by default.

  By default, the inspector will look for an `<iframe data-xstate>` element anywhere in the document. If you want to target a custom iframe, specify it eagerly or lazily:

  ```js
  // eager
  inspect({
    iframe: document.querySelector('iframe.some-xstate-iframe')
  });
  ```

  ```js
  // lazy
  inspect({
    iframe: () => document.querySelector('iframe.some-xstate-iframe')
  });
  ```

- `url` (string) - the URL of the inspector to connect to. By default, the inspector is running on `http://statecharts.io/inspect`.

**Returns:** an inspector object with the following properties:

- `disconnect` (function) - a function that disconnects the inspector and cleans up any listeners.

## Implementing

You can implement your own inspector by creating a **receiver**. A **receiver** is an actor that receives inspector events from a source (like a parent window or a WebSocket connection):

- `"service.register"`

  ```ts
  type ServiceRegisterEvent = {
    type: 'service.register';
    machine: StateMachine<any, any, any>;
    state: State<any, any>;
    id: string;
    sessionId: string;
    parent?: string;
    source?: string;
  };
  ```

- `"service.stop"`

  ```ts
  type ServiceStopEvent = {
    type: 'service.stop';
    sessionId: string;
  };
  ```

- `"service.state"`

  ```ts
  type ServiceStateEvent = {
    type: 'service.state';
    state: State<any, any>;
    sessionId: string;
  };
  ```

- `"service.event"`

  ```ts
  type ServiceEvent = {
    type: 'service.event';
    event: SCXML.Event<any>;
    sessionId: string;
  };
  ```

To listen to events from an inspected source, create a receiver with the appropriate `create*Receiver(...)` function; for example:

```js
import { createWindowReceiver } from '@xstate/inspect';

const windowReceiver = createWindowReceiver(/* options? */);

windowReceiver.subscribe((event) => {
  // here, you will receive "service.*" events
  console.log(event);
});
```

You can also send events to the receiver:

```js
// ...

// This will send the event to the inspected service
windowReceiver.send({
  type: 'xstate.event',
  event: JSON.stringify({ type: 'someEvent' }),
  service: /* session ID of the service this event is sent to */
});
```

The typical inspection workflow is as follows:

1. The `inspect(/* ... */)` call on the client opens the inspector (e.g., in a separate window, or creates a WebSocket connection)
2. The receiver sends an `"xstate.inspecting"` event to the client
3. The client sends `"service.register"` events to the receiver
4. An inspector listening to the receiver (via `receiver.subscribe(...)`) registers the machine (`event.machine`) by its `event.sessionId`
5. The machine is visually rendered, and its current state (`event.state`) is highlighted
6. As the service at the source receives events and changes state, it will send the receiver `"service.event"` and `"service.state"` events, respectively
7. The inspector can use those events to highlight the current state and keep a log of events sent to that service
8. When the service stops, a `"service.stop"` event is sent to the receiver with the `event.sessionId` to identify the stopped service.

## FAQs

- How do I run the inspector in a NextJS app?

  Ensure that the inspector code only runs on the client, rather than the server:

  ```js
  if (typeof window !== 'undefined') {
    inspect({
      /* options */
    });
  }
  ```
