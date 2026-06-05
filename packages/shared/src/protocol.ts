/**
 * Wire protocol for the gateway WebSocket hub.
 *
 * Clients (overlays, the desktop chat dock) connect, send a `subscribe` frame
 * declaring which channels + event kinds they care about, then receive `event`
 * frames. The chat-aggregator publishes `event` frames inbound to the hub.
 */
import type { StreamEvent } from './events.js';

/** What a subscriber wants to receive. */
export interface SubscriptionFilter {
  /** Channels to receive events for. Empty => all channels on the token. */
  channels?: string[];
  /** Event kinds to receive: 'chat' | 'alerts' | 'all'. */
  kinds?: Array<'chat' | 'alerts' | 'all'>;
}

/** Frames sent client -> hub. */
export type ClientFrame =
  | { t: 'subscribe'; filter: SubscriptionFilter }
  | { t: 'ping' };

/** Frames sent hub -> client. */
export type ServerFrame =
  | { t: 'ready'; connectionId: string }
  | { t: 'event'; event: StreamEvent }
  | { t: 'pong' };

/** Frames sent by a publisher (chat-aggregator) -> hub ingest endpoint. */
export type PublishFrame = { t: 'publish'; event: StreamEvent };

export const GATEWAY_WS_PATH = '/ws';
export const GATEWAY_INGEST_PATH = '/ingest';
