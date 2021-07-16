import type { ActorRef, Interpreter, SCXML, State, MachineNode } from 'xstate';
import { XStateDevInterface } from 'xstate/dev';
import { InspectMachineEvent } from './inspectMachine';

export type MaybeLazy<T> = T | (() => T);

export type ServiceListener = (service: Interpreter<any>) => void;

export interface InspectorOptions {
  url: string;
  iframe: MaybeLazy<HTMLIFrameElement | null | false>;
  devTools: MaybeLazy<XStateDevInterface>;
}

export interface Inspector extends ActorRef<InspectMachineEvent> {
  /**
   * Disconnects the inspector.
   */
  disconnect: () => void;
}

/**
 * Events that the receiver sends to the inspector
 */
export type ReceiverCommand =
  | { type: 'xstate.event'; event: string; service: string }
  | { type: 'xstate.inspecting' };

/**
 * Events that the receiver receives from the inspector
 */
export type ReceiverEvent =
  | {
      type: 'service.register';
      machine: string;
      state: string;
      id: string;
      sessionId: string;
      parent?: string;
      source?: string;
    }
  | { type: 'service.stop'; sessionId: string }
  | {
      type: 'service.state';
      state: string;
      sessionId: string;
    }
  | { type: 'service.event'; event: string; sessionId: string };

export type ParsedReceiverEvent =
  | {
      type: 'service.register';
      machine: MachineNode<any, any>;
      state: State<any, any>;
      id: string;
      sessionId: string;
      parent?: string;
      source?: string;
    }
  | { type: 'service.stop'; sessionId: string }
  | {
      type: 'service.state';
      state: State<any, any>;
      sessionId: string;
    }
  | { type: 'service.event'; event: SCXML.Event<any>; sessionId: string };

export type InspectReceiver = ActorRef<ReceiverCommand, ParsedReceiverEvent>;

export interface WindowReceiverOptions {
  window: Window;
  targetWindow: Window;
}

export interface WebSocketReceiverOptions {
  server: string;
  protocol?: 'ws' | 'wss';
}
