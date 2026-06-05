/**
 * Synthetic connector — generates fake chat + alert events on a timer.
 *
 * This exists so the whole spine (aggregator -> gateway -> overlays/desktop)
 * can be demoed and verified locally with zero platform credentials. Enable it
 * with SYNTHETIC=1. Not shipped in production builds.
 */
import type { StreamEvent } from '@apex/shared';
import type { Connector, ConnectorContext } from './types.js';

const NAMES = ['NeonFox', 'PixelWizard', 'GG_Gamer', 'StreamSnail', 'LootGoblin', 'VodWatcher'];
const LINES = ['hello chat!', 'POG', 'first time here, love it', 'lol', 'gg', 'what game is this?'];

export class SyntheticConnector implements Connector {
  readonly platform = 'twitch' as const;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(ctx: ConnectorContext): void {
    ctx.log('SYNTHETIC connector active — emitting demo events every 3s');
    this.timer = setInterval(() => ctx.emit(this.next(ctx.channel)), 3000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private next(channel: string): StreamEvent {
    const name = pick(NAMES);
    const roll = Math.random();
    const base = { id: `syn-${Date.now()}`, platform: 'twitch' as const, channel, timestamp: Date.now() };

    if (roll < 0.7) {
      return {
        ...base,
        type: 'chat',
        author: {
          id: name,
          displayName: name,
          color: '#a970ff',
          badges: [],
          isModerator: false,
          isSubscriber: roll < 0.2,
          isBroadcaster: false,
        },
        text: pick(LINES),
        emotes: [],
      };
    }
    if (roll < 0.85) {
      return { ...base, type: 'follow', user: { id: name, displayName: name } };
    }
    if (roll < 0.95) {
      return { ...base, type: 'subscribe', user: { id: name, displayName: name }, tier: 1 };
    }
    return { ...base, type: 'raid', from: { id: name, displayName: name }, viewers: 42 };
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
