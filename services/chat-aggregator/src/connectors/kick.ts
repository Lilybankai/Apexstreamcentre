/**
 * Kick connector (stub — implemented to parity in P4).
 *
 * Plan: resolve the channel's chatroom id via Kick's API, subscribe to the
 * chatroom channel over their Pusher-backed WebSocket, and map ChatMessage /
 * Subscription / GiftedSubscriptions events into normalized events.
 */
import type { Connector, ConnectorContext } from './types.js';

export class KickConnector implements Connector {
  readonly platform = 'kick' as const;

  start(ctx: ConnectorContext): void {
    ctx.log('stub connector — Kick integration lands in P4 (Pusher WS + API)');
  }

  stop(): void {
    /* no-op */
  }
}
