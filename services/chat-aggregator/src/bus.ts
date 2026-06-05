/**
 * Publisher that forwards normalized events to the gateway ingest endpoint.
 * Buffers while disconnected and reconnects with a fixed backoff. In P2 this is
 * replaced by a Redis publish so multiple aggregator instances fan in.
 */
import { WebSocket } from 'ws';
import { GATEWAY_INGEST_PATH, type PublishFrame, type StreamEvent } from '@apex/shared';

export class GatewayBus {
  private ws: WebSocket | null = null;
  private queue: StreamEvent[] = [];
  private closed = false;

  constructor(private readonly gatewayUrl: string) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  publish(event: StreamEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'publish', event } satisfies PublishFrame));
    } else {
      // Cap the buffer so a long outage can't exhaust memory.
      if (this.queue.length < 1000) this.queue.push(event);
    }
  }

  private open(): void {
    const ws = new WebSocket(`${this.gatewayUrl}${GATEWAY_INGEST_PATH}`);
    this.ws = ws;
    ws.on('open', () => {
      console.log(`[bus] connected to gateway ingest at ${this.gatewayUrl}`);
      const pending = this.queue;
      this.queue = [];
      for (const e of pending) this.publish(e);
    });
    ws.on('close', () => {
      if (!this.closed) setTimeout(() => this.open(), 2000);
    });
    ws.on('error', () => ws.close());
  }
}
