type Listener = (...args: any[]) => void;
type EventName = string | symbol;

/**
 * Small browser-compatible subset of Node's EventEmitter API.
 *
 * The frontend only needs listener registration and notification. Keeping this
 * local avoids relying on a Node core-module polyfill in the browser bundle.
 */
class EventEmitter {
  private listeners = new Map<EventName, Set<Listener>>();

  on(event: EventName, listener: Listener): this {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);
    return this;
  }

  off(event: EventName, listener: Listener): this {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  once(event: EventName, listener: Listener): this {
    const onceListener: Listener = (...args) => {
      this.off(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }

  emit(event: EventName, ...args: any[]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      return false;
    }
    for (const listener of [...listeners]) {
      listener(...args);
    }
    return true;
  }

  setMaxListeners(_maxListeners: number): this {
    return this;
  }
}

export default EventEmitter;
