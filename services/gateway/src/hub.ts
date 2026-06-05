/**
 * In-memory fan-out hub.
 *
 * Subscribers (overlays, desktop chat dock) register with a filter; publishers
 * (the chat-aggregator) push normalized events. The hub routes each event to
 * every subscriber whose filter matches. This is intentionally simple and
 * single-process for Phase 1 — P2 swaps the internals for Redis pub/sub so it
 * scales horizontally without changing this interface.
 */
import { randomUUID } from 'node:crypto';
import { isAlertEvent, type StreamEvent, type SubscriptionFilter } from '@apex/shared';

export interface Subscriber {
  id: string;
  filter: SubscriptionFilter;
  send: (event: StreamEvent) => void;
}

export class Hub {
  private subscribers = new Map<string, Subscriber>();

  add(filter: SubscriptionFilter, send: (event: StreamEvent) => void): string {
    const id = randomUUID();
    this.subscribers.set(id, { id, filter, send });
    return id;
  }

  remove(id: string): void {
    this.subscribers.delete(id);
  }

  get size(): number {
    return this.subscribers.size;
  }

  publish(event: StreamEvent): void {
    for (const sub of this.subscribers.values()) {
      if (matches(sub.filter, event)) sub.send(event);
    }
  }
}

export function matches(filter: SubscriptionFilter, event: StreamEvent): boolean {
  if (filter.channels && filter.channels.length > 0 && !filter.channels.includes(event.channel)) {
    return false;
  }
  const kinds = filter.kinds && filter.kinds.length > 0 ? filter.kinds : ['all'];
  if (kinds.includes('all')) return true;
  if (kinds.includes('chat') && event.type === 'chat') return true;
  if (kinds.includes('alerts') && isAlertEvent(event)) return true;
  return false;
}
