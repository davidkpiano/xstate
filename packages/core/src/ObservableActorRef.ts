import { EventObject, ActorRef } from './types';
import { Behavior, ActorContext } from './behavior';
import { Actor } from './Actor';

export class ObservableActorRef<TEvent extends EventObject, TEmitted>
  implements ActorRef<TEvent, TEmitted> {
  private current: TEmitted;
  public deferred = true;
  private context: ActorContext;
  private actor: Actor<TEvent, TEmitted>;
  public name: string;

  constructor(behavior: Behavior<TEvent, TEmitted>, name: string) {
    this.name = name;
    this.context = {
      self: this,
      name: this.name
    };
    this.actor = new Actor(behavior, name, this.context);
    this.current = this.actor.current;
  }
  public start() {
    this.deferred = false;
    this.actor.start();

    return this;
  }
  public stop() {
    this.actor.stop();

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
    return this.current;
  }
}
