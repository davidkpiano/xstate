import { interpret, EventObject, Observer, AnyInterpreter } from 'xstate';
import { XStateDevInterface } from 'xstate/dev';
import { toSCXMLEvent, toEventObject, toObserver } from 'xstate/src/utils';
import { createInspectMachine } from './inspectMachine';
import type {
  Inspector,
  InspectorOptions,
  InspectReceiver,
  ParsedReceiverEvent,
  ServiceListener,
  WebSocketReceiverOptions,
  WindowReceiverOptions
} from './types';
import {
  getLazy,
  isReceiverEvent,
  parseReceiverEvent,
  stringify
} from './utils';

export const serviceMap = new Map<string, AnyInterpreter>();

export function createDevTools(): XStateDevInterface {
  const services = new Set<AnyInterpreter>();
  const serviceListeners = new Set<ServiceListener>();

  return {
    services,
    register: (service) => {
      services.add(service);
      serviceMap.set(service.sessionId, service);
      serviceListeners.forEach((listener) => listener(service));

      service.onStop(() => {
        services.delete(service);
        serviceMap.delete(service.sessionId);
      });
    },
    unregister: (service) => {
      services.delete(service);
      serviceMap.delete(service.sessionId);
    },
    onRegister: (listener) => {
      serviceListeners.add(listener);
      services.forEach((service) => listener(service));

      return {
        unsubscribe: () => {
          serviceListeners.delete(listener);
        }
      };
    }
  };
}

const defaultInspectorOptions: InspectorOptions = {
  url: 'https://statecharts.io/inspect',
  iframe: () =>
    document.querySelector<HTMLIFrameElement>('iframe[data-xstate]'),
  devTools: () => {
    const devTools = createDevTools();
    globalThis.__xstate__ = devTools;
    return devTools;
  }
};

export function inspect(
  options?: Partial<InspectorOptions>
): Inspector | undefined {
  const { iframe, url, devTools } = { ...defaultInspectorOptions, ...options };
  const resolvedIframe = getLazy(iframe);

  if (resolvedIframe === null) {
    console.warn(
      'No suitable <iframe> found to embed the inspector. Please pass an <iframe> element to `inspect(iframe)` or create an <iframe data-xstate></iframe> element.'
    );

    return undefined;
  }

  const resolvedDevTools = getLazy(devTools);
  const inspectMachine = createInspectMachine(resolvedDevTools);
  const inspectService = interpret(inspectMachine).start();
  const listeners = new Set<Observer<any>>();

  const sub = inspectService.subscribe((state) => {
    listeners.forEach((listener) => listener.next?.(state));
  });

  let targetWindow: Window | null | undefined;
  let client: any;

  const messageHandler = (event) => {
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      'type' in event.data
    ) {
      if (resolvedIframe && !targetWindow) {
        targetWindow = resolvedIframe.contentWindow;
      }

      if (!client) {
        client = {
          send: (e: any) => {
            targetWindow!.postMessage(e, url);
          }
        };
      }

      inspectService.send({
        ...event.data,
        client
      });
    }
  };

  window.addEventListener('message', messageHandler);

  window.addEventListener('unload', () => {
    inspectService.send({ type: 'unload' });
  });

  if (resolvedIframe === false) {
    targetWindow = window.open(url, 'xstateinspector');
  }

  resolvedDevTools.onRegister((service) => {
    inspectService.send({
      type: 'service.register',
      machine: stringify(service.machine),
      state: stringify(service.state || service.initialState),
      sessionId: service.sessionId,
      id: service.id,
      parent: (service.parent as AnyInterpreter)?.sessionId
    });

    inspectService.send({
      type: 'service.event',
      event: stringify((service.state || service.initialState)._event),
      sessionId: service.sessionId
    });

    // monkey-patch service.send so that we know when an event was sent
    // to a service *before* it is processed, since other events might occur
    // while the sent one is being processed, which throws the order off
    const originalSend = service.send.bind(service);

    service.send = function inspectSend(event: EventObject, payload?: any) {
      inspectService.send({
        type: 'service.event',
        event: stringify(
          toSCXMLEvent(toEventObject(event as EventObject, payload))
        ),
        sessionId: service.sessionId
      });

      return originalSend(event, payload);
    };

    service.subscribe((state) => {
      inspectService.send({
        type: 'service.state',
        state: stringify(state),
        sessionId: service.sessionId
      });
    });

    service.onStop(() => {
      inspectService.send({
        type: 'service.stop',
        sessionId: service.sessionId
      });
    });
  });

  if (resolvedIframe) {
    resolvedIframe.addEventListener('load', () => {
      targetWindow = resolvedIframe.contentWindow!;
    });

    resolvedIframe.setAttribute('src', url);
  }

  return {
    send: (event) => {
      inspectService.send(event);
    },
    subscribe: (next, onError, onComplete) => {
      const observer = toObserver(next, onError, onComplete);

      listeners.add(observer);

      return {
        unsubscribe: () => {
          listeners.delete(observer);
        }
      };
    },
    disconnect: () => {
      inspectService.send('disconnect');
      window.removeEventListener('message', messageHandler);
      sub.unsubscribe();
    }
  } as Inspector;
}

export function createWindowReceiver(
  options?: Partial<WindowReceiverOptions>
): InspectReceiver {
  const {
    window: ownWindow = window,
    targetWindow = window.self === window.top ? window.opener : window.parent
  } = options || {};
  const observers = new Set<Observer<ParsedReceiverEvent>>();
  let latestEvent: ParsedReceiverEvent;

  const handler = (event: MessageEvent) => {
    const { data } = event;
    if (isReceiverEvent(data)) {
      latestEvent = parseReceiverEvent(data);
      observers.forEach((listener) => listener.next?.(latestEvent));
    }
  };

  ownWindow.addEventListener('message', handler);

  const actorRef: InspectReceiver = {
    name: 'xstate.windowReceiver',
    send(event) {
      if (!targetWindow) {
        return;
      }
      targetWindow.postMessage(event, '*');
    },
    subscribe(next, onError?, onComplete?) {
      const observer = toObserver(next, onError, onComplete);

      observers.add(observer);

      return {
        unsubscribe: () => {
          observers.delete(observer);
        }
      };
    },
    stop() {
      observers.clear();

      ownWindow.removeEventListener('message', handler);
    },
    getSnapshot() {
      return latestEvent;
    }
  };

  actorRef.send({
    type: 'xstate.inspecting'
  });

  return actorRef;
}

export function createWebSocketReceiver(
  options: WebSocketReceiverOptions
): InspectReceiver {
  const { protocol = 'ws' } = options;
  const ws = new WebSocket(`${protocol}://${options.server}`);
  const observers = new Set<Observer<ParsedReceiverEvent>>();
  let latestEvent: ParsedReceiverEvent;

  const actorRef: InspectReceiver = {
    name: 'xstate.webSocketReceiver',
    send(event) {
      ws.send(JSON.stringify(event));
    },
    subscribe(next, onError?, onComplete?) {
      const observer = toObserver(next, onError, onComplete);

      observers.add(observer);

      return {
        unsubscribe: () => {
          observers.delete(observer);
        }
      };
    },
    getSnapshot() {
      return latestEvent;
    }
  };

  ws.onopen = () => {
    actorRef.send({
      type: 'xstate.inspecting'
    });
  };

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') {
      return;
    }

    try {
      const eventObject = JSON.parse(event.data);

      if (isReceiverEvent(latestEvent)) {
        latestEvent = parseReceiverEvent(eventObject);
        observers.forEach((observer) => {
          observer.next?.(latestEvent);
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  ws.onerror = (err) => {
    observers.forEach((observer) => {
      observer.error?.(err);
    });
  };

  return actorRef;
}
