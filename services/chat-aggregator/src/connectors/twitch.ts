/**
 * Twitch connector.
 *
 * Phase 1 reads chat over Twitch's IRC-over-WebSocket gateway using an
 * ANONYMOUS connection (the `justinfan` nick), so it needs no credentials and
 * is perfect for local verification. It parses IRCv3 tags into a normalized
 * {@link ChatEvent}, including emote positions.
 *
 * Subscriptions / bits / raids require EventSub with an authenticated user
 * token; that arrives in P4 (auth/OAuth). The shape below — same Connector,
 * same emit() — does not change when EventSub is added; we just emit more event
 * types from the same connector.
 */
import { WebSocket } from 'ws';
import type { ChatEvent, EmoteToken } from '@apex/shared';
import type { Connector, ConnectorContext } from './types.js';

const IRC_WS = 'wss://irc-ws.chat.twitch.tv:443';

export class TwitchConnector implements Connector {
  readonly platform = 'twitch' as const;
  private ws: WebSocket | null = null;
  private ctx: ConnectorContext | null = null;
  private closed = false;

  start(ctx: ConnectorContext): void {
    this.ctx = ctx;
    this.closed = false;
    this.open();
  }

  stop(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const ws = new WebSocket(IRC_WS);
    this.ws = ws;

    ws.on('open', () => {
      const nick = `justinfan${Math.floor(Math.random() * 80000) + 1000}`;
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send(`NICK ${nick}`);
      ws.send(`JOIN #${ctx.channel.toLowerCase()}`);
      ctx.log(`connected to #${ctx.channel} as ${nick}`);
    });

    ws.on('message', (raw) => {
      for (const line of raw.toString().split('\r\n')) {
        if (line.length === 0) continue;
        if (line.startsWith('PING')) {
          ws.send('PONG :tmi.twitch.tv');
          continue;
        }
        const event = this.parsePrivmsg(line, ctx.channel);
        if (event) ctx.emit(event);
      }
    });

    ws.on('close', () => this.reconnect());
    ws.on('error', (err) => {
      ctx.log(`socket error: ${String(err)}`);
      ws.close();
    });
  }

  private reconnect(): void {
    if (this.closed) return;
    setTimeout(() => this.open(), 2000);
  }

  /** Parse an IRCv3 PRIVMSG line into a normalized ChatEvent (or null). */
  private parsePrivmsg(line: string, channel: string): ChatEvent | null {
    let rest = line;
    let tags: Record<string, string> = {};
    if (rest.startsWith('@')) {
      const sp = rest.indexOf(' ');
      tags = parseTags(rest.slice(1, sp));
      rest = rest.slice(sp + 1);
    }
    // rest: :<user>!<user>@<user>.tmi.twitch.tv PRIVMSG #channel :message
    const privmsgIdx = rest.indexOf(' PRIVMSG ');
    if (privmsgIdx === -1) return null;
    const afterCmd = rest.slice(privmsgIdx + ' PRIVMSG '.length);
    const msgSep = afterCmd.indexOf(' :');
    if (msgSep === -1) return null;
    const text = afterCmd.slice(msgSep + 2);

    const login = rest.startsWith(':') ? rest.slice(1, rest.indexOf('!')) : 'unknown';
    const badges = (tags['badges'] ?? '').split(',').filter(Boolean).map((b) => b.split('/')[0]!);

    return {
      id: tags['id'] ?? `${Date.now()}-${Math.random()}`,
      type: 'chat',
      platform: 'twitch',
      channel,
      timestamp: tags['tmi-sent-ts'] ? Number(tags['tmi-sent-ts']) : Date.now(),
      author: {
        id: tags['user-id'] ?? login,
        displayName: tags['display-name'] || login,
        color: tags['color'] || undefined,
        badges,
        isModerator: tags['mod'] === '1' || badges.includes('moderator'),
        isSubscriber: tags['subscriber'] === '1' || badges.includes('subscriber'),
        isBroadcaster: badges.includes('broadcaster'),
      },
      text,
      emotes: parseEmotes(tags['emotes'], text),
    };
  }
}

function parseTags(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    out[pair.slice(0, eq)] = unescapeTagValue(pair.slice(eq + 1));
  }
  return out;
}

function unescapeTagValue(v: string): string {
  return v
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n');
}

/** Twitch emotes tag: "id:start-end,start-end/id2:start-end". */
function parseEmotes(tag: string | undefined, text: string): EmoteToken[] {
  if (!tag) return [];
  const tokens: EmoteToken[] = [];
  const chars = [...text];
  for (const group of tag.split('/')) {
    const [id, ranges] = group.split(':');
    if (!id || !ranges) continue;
    const positions: Array<[number, number]> = [];
    let name = id;
    for (const range of ranges.split(',')) {
      const [s, e] = range.split('-').map(Number);
      if (s === undefined || e === undefined) continue;
      positions.push([s, e]);
      name = chars.slice(s, e + 1).join('');
    }
    tokens.push({
      id,
      name,
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`,
      positions,
    });
  }
  return tokens;
}
