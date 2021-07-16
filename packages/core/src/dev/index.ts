import { AnyInterpreter, DevToolsAdapter } from '../types';

interface DevInterface {
  services: Set<AnyInterpreter>;
  register(service: AnyInterpreter): void;
  onRegister(listener: ServiceListener): void;
}
type ServiceListener = (service: AnyInterpreter) => void;

export interface XStateDevInterface {
  register: (service: AnyInterpreter) => void;
  unregister: (service: AnyInterpreter) => void;
  onRegister: (
    listener: ServiceListener
  ) => {
    unsubscribe: () => void;
  };
  services: Set<AnyInterpreter>;
}

// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis
export function getGlobal(): any {
  if (typeof self !== 'undefined') {
    return self;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }

  return undefined;
}

function getDevTools(): DevInterface | undefined {
  const w = getGlobal();
  if (!!w.__xstate__) {
    return w.__xstate__;
  }

  return undefined;
}

export function registerService(service: AnyInterpreter) {
  if (typeof window === 'undefined') {
    return;
  }

  const devTools = getDevTools();

  if (devTools) {
    devTools.register(service);
  }
}

export const devToolsAdapter: DevToolsAdapter = (service) => {
  if (typeof window === 'undefined') {
    return;
  }

  const devTools = getDevTools();

  if (devTools) {
    devTools.register(service);
  }
};
