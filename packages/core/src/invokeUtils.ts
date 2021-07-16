import { actionTypes } from './actions';
import {
  EventObject,
  InvokeConfig,
  InvokeDefinition,
  InvokeSourceDefinition,
  MachineContext
} from './types';

export function toInvokeSource(
  src: string | InvokeSourceDefinition
): InvokeSourceDefinition {
  if (typeof src === 'string') {
    return { type: src };
  }

  return src;
}

export function toInvokeDefinition<
  TContext extends MachineContext,
  TEvent extends EventObject
>(
  invokeConfig: InvokeConfig<TContext, TEvent> & {
    src: string | InvokeSourceDefinition;
    id: string;
  }
): InvokeDefinition<TContext, TEvent> {
  return {
    // type: actionTypes.invoke,
    ...invokeConfig,
    src: toInvokeSource(invokeConfig.src),
    toJSON() {
      const { onDone, onError, ...invokeDef } = invokeConfig;
      return {
        ...invokeDef,
        type: actionTypes.invoke,
        src: toInvokeSource(invokeConfig.src)
      };
    }
  };
}
