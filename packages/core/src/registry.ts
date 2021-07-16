import { ActorRef } from './types';

const children = new Map<string, ActorRef<any>>();

let sessionIdIndex = 0;

export interface Registry {
  bookId(): string;
  register(id: string, actor: ActorRef<any>): string;
  get(id: string): ActorRef<any> | undefined;
  free(id: string): void;
}

export const registry: Registry = {
  bookId() {
    return `x:${sessionIdIndex++}`;
  },
  register(id, actor) {
    children.set(id, actor);
    return id;
  },
  get(id) {
    return children.get(id);
  },
  free(id) {
    children.delete(id);
  }
};
