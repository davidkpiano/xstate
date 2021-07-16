import { EventObject, ActorRef, Behavior } from './types';
import { ActorContext, startSignal, stopSignal } from './behaviors';
import { Actor } from './actor';
import { CapturedState } from './capturedState';
import { toSCXMLEvent } from './utils';
import { SCXML } from '.';

export class ObservableActorRef<TEvent extends EventObject, TEmitted>
  implements ActorRef<TEvent, TEmitted> {
  private current: TEmitted;
  public deferred = true;
  private context: ActorContext<TEvent, TEmitted>;
  private actor: Actor<TEvent, TEmitted>;
  public name: string;

  constructor(behavior: Behavior<TEvent, TEmitted>, name: string) {
    this.name = name;
    this.context = {
      self: this,
      name: this.name,
      observers: new Set(),
      parent: CapturedState.current?.actorRef,
      _event: toSCXMLEvent({ type: 'xstate.init' }) as SCXML.Event<TEvent> // TODO: fix
    };
    this.actor = new Actor(behavior, name, this.context);
    this.current = this.actor.current;
  }
  public start() {
    this.deferred = false;
    this.actor.receive(startSignal);

    return this;
  }
  public stop() {
    this.actor.receive(stopSignal);

    return this;
  }
  public subscribe(observer) {
    return this.actor.subscribe(observer);
  }
  public send(event) {
    this.actor.receive(event);
  }
  public toJSON() {
    return {
      name: this.name,
      current: this.current
    };
  }
  public getSnapshot() {
    return this.actor.current;
  }
}
