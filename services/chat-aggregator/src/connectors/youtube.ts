/**
 * YouTube Live connector (stub — implemented to parity in P4).
 *
 * Plan: OAuth the broadcaster, resolve the active liveChatId, poll
 * liveChatMessages.list (chat + super-chat + membership events), and map each
 * into normalized events. The Connector contract is identical to Twitch's, so
 * nothing downstream changes when this is filled in.
 */
import type { Connector, ConnectorContext } from './types.js';

export class YouTubeConnector implements Connector {
  readonly platform = 'youtube' as const;

  start(ctx: ConnectorContext): void {
    ctx.log('stub connector — YouTube Live integration lands in P4 (OAuth + Live Chat API)');
  }

  stop(): void {
    /* no-op */
  }
}
