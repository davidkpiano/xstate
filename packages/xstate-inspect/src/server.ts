import * as WebSocket from 'ws';
import { ActorRef, EventObject, interpret, Interpreter } from 'xstate';
import { toEventObject, toSCXMLEvent } from 'xstate/src/utils';
import { toActorRef } from 'xstate/actor';

import { createInspectMachine } from './inspectMachine';
import { Inspector } from './types';
import { stringify } from './utils';

const services = new Set<Interpreter<any>>();
const serviceMap = new Map<string, Interpreter<any>>();
const serviceListeners = new Set<any>();

function createDevTools() {
  globalThis.__xstate__ = {
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

interface ServerInspectorOptions {
  server: WebSocket.Server;
}

export function inspect(options: ServerInspectorOptions): Inspector {
  const { server } = options;
  createDevTools();
  const inspectService = interpret(
    createInspectMachine(globalThis.__xstate__)
  ).start();
  let client: ActorRef<any>;

  server.on('connection', function connection(wss) {
    client = toActorRef({
      send: (event: any) => {
        server.clients.forEach((ws) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
          }
        });
      },
      subscribe: () => {
        return { unsubscribe: () => void 0 };
      }
    });

    wss.on('message', function incoming(message) {
      if (typeof message !== 'string') {
        return;
      }
      const jsonMessage = JSON.parse(message);
      inspectService.send({
        ...jsonMessage,
        client
      });
    });
  });

  globalThis.__xstate__.onRegister((service: Interpreter<any>) => {
    inspectService.send({
      type: 'service.register',
      machine: JSON.stringify(service.machine),
      state: JSON.stringify(service.state || service.initialState),
      id: service.id,
      sessionId: service.sessionId
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

    service.subscribe((state) => {
      inspectService.send({
        type: 'service.state',
        state: JSON.stringify(state),
        sessionId: service.sessionId
      });
    });
  });

  const inspector: Inspector = {
    name: 'inspector',
    getSnapshot: () => undefined,
    send: (event) => {
      inspectService.send(event);
    },
    subscribe: () => {
      return {
        unsubscribe: () => void 0
      };
    },
    disconnect: () => {
      server.close();
      inspectService.stop();
    }
  };

  server.on('close', () => {
    inspectService.stop();
  });

  return inspector;
}
