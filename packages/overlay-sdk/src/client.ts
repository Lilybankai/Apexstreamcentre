/**
 * Overlay runtime client.
 *
 * An overlay is just a web page loaded as an OBS browser source. It uses this
 * client to open a WebSocket to the gateway, authenticate with the per-overlay
 * token embedded in its URL, subscribe to the kinds of events it renders, and
 * receive a typed stream of normalized {@link StreamEvent}s.
 *
 * Works in the browser (uses the global `WebSocket`).
 */
import {
  GATEWAY_WS_PATH,
  type ClientFrame,
  type ServerFrame,
  type StreamEvent,
  type SubscriptionFilter,
} from '@apex/shared';

export interface OverlayClientOptions {
  /** Gateway origin, e.g. "wss://gateway.apexstreamcentre.com". */
  url: string;
  /** Per-overlay signed token (issued by the gateway, carried in the URL). */
  token: string;
  filter: SubscriptionFilter;
  /** Reconnect backoff ceiling in ms. Defaults to 10s. */
  maxBackoffMs?: number;
}

type EventHandler = (event: StreamEvent) => void;

export class OverlayClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private backoff = 500;
  private closed = false;

  constructor(private readonly opts: OverlayClientOptions) {}

  /** Register a handler. Returns an unsubscribe function. */
  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(): void {
    this.closed = false;
    this.open();
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const sep = this.opts.url.includes('?') ? '&' : '?';
    const endpoint = `${this.opts.url}${GATEWAY_WS_PATH}${sep}token=${encodeURIComponent(
      this.opts.token,
    )}`;
    const ws = new WebSocket(endpoint);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.backoff = 500;
      this.send({ t: 'subscribe', filter: this.opts.filter });
    });

    ws.addEventListener('message', (ev) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerFrame;
      } catch {
        return;
      }
      if (frame.t === 'event') {
        for (const h of this.handlers) h(frame.event);
      }
    });

    ws.addEventListener('close', () => this.scheduleReconnect());
    ws.addEventListener('error', () => ws.close());
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const max = this.opts.maxBackoffMs ?? 10_000;
    const delay = Math.min(this.backoff, max);
    this.backoff = Math.min(this.backoff * 2, max);
    setTimeout(() => {
      if (!this.closed) this.open();
    }, delay);
  }

  private send(frame: ClientFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }
}

/**
 * Convenience: read `?token=...` and the gateway URL from the current page so an
 * overlay can boot with one line. Falls back to a local dev gateway.
 */
export function clientFromUrl(filter: SubscriptionFilter): OverlayClient {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? 'dev-token';
  const url = params.get('gateway') ?? defaultGatewayUrl();
  return new OverlayClient({ url, token, filter });
}

function defaultGatewayUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Local dev default — gateway runs on :8787.
  return `${proto}//${window.location.hostname}:8787`;
}
