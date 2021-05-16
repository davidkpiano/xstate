import { ActionTypes } from './types';

// xstate-specific action types
export const stop = ActionTypes.Stop;
export const raise = ActionTypes.Raise;
export const send = ActionTypes.Send;
export const cancel = ActionTypes.Cancel;
export const nullEvent = ActionTypes.NullEvent;
export const assign = ActionTypes.Assign;
export const after = ActionTypes.After;
export const doneState = ActionTypes.DoneState;
export const log = ActionTypes.Log;
export const init = ActionTypes.Init;
export const invoke = ActionTypes.Invoke;
export const errorExecution = ActionTypes.ErrorExecution;
export const errorPlatform = ActionTypes.ErrorPlatform;
export const error = ActionTypes.ErrorCustom;
export const update = ActionTypes.Update;
export const choose = ActionTypes.Choose;
export const pure = ActionTypes.Pure;
export const each = ActionTypes.Each;
