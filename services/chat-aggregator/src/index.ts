/**
 * Chat aggregator entrypoint.
 *
 * Reads config from env, starts the configured platform connectors, normalizes
 * everything to {@link StreamEvent}, and publishes to the gateway.
 *
 *   GATEWAY_URL   ws://localhost:8787    gateway ingest base
 *   TWITCH_CHANNEL  <login>              channel to read Twitch chat from
 *   SYNTHETIC     1                      also run the demo event generator
 */
import type { Platform, StreamEvent } from '@apex/shared';
import { GatewayBus } from './bus.js';
import type { Connector, ConnectorContext } from './connectors/types.js';
import { TwitchConnector } from './connectors/twitch.js';
import { YouTubeConnector } from './connectors/youtube.js';
import { KickConnector } from './connectors/kick.js';
import { SyntheticConnector } from './connectors/synthetic.js';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'ws://localhost:8787';
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL ?? '';
const YOUTUBE_CHANNEL = process.env.YOUTUBE_CHANNEL ?? '';
const KICK_CHANNEL = process.env.KICK_CHANNEL ?? '';
const SYNTHETIC = process.env.SYNTHETIC === '1';

const bus = new GatewayBus(GATEWAY_URL);
bus.connect();

const connectors: Array<{ connector: Connector; channel: string }> = [];
if (TWITCH_CHANNEL) connectors.push({ connector: new TwitchConnector(), channel: TWITCH_CHANNEL });
if (YOUTUBE_CHANNEL) connectors.push({ connector: new YouTubeConnector(), channel: YOUTUBE_CHANNEL });
if (KICK_CHANNEL) connectors.push({ connector: new KickConnector(), channel: KICK_CHANNEL });
if (SYNTHETIC) connectors.push({ connector: new SyntheticConnector(), channel: TWITCH_CHANNEL || 'demo' });

if (connectors.length === 0) {
  console.warn(
    '[chat-aggregator] no connectors configured. Set TWITCH_CHANNEL=<login> or SYNTHETIC=1.',
  );
}

for (const { connector, channel } of connectors) {
  const ctx: ConnectorContext = {
    channel,
    emit: (event: StreamEvent) => {
      logEvent(connector.platform, event);
      bus.publish(event);
    },
    log: (msg) => console.log(`[${connector.platform}] ${msg}`),
  };
  void connector.start(ctx);
}

function logEvent(platform: Platform, event: StreamEvent): void {
  if (event.type === 'chat') {
    console.log(`[${platform}] ${event.author.displayName}: ${event.text}`);
  } else {
    console.log(`[${platform}] ${event.type.toUpperCase()}`);
  }
}

const shutdown = () => {
  for (const { connector } of connectors) void connector.stop();
  bus.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
