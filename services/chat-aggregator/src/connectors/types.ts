/**
 * The connector contract. Every platform implements this and nothing else —
 * the rest of the system only ever sees normalized {@link StreamEvent}s.
 */
import type { Platform, StreamEvent } from '@apex/shared';

export interface ConnectorContext {
  /** Channel/broadcaster to follow on this platform. */
  channel: string;
  /** Push a normalized event onto the bus. */
  emit: (event: StreamEvent) => void;
  /** Structured logging scoped to the connector. */
  log: (msg: string) => void;
}

export interface Connector {
  readonly platform: Platform;
  start(ctx: ConnectorContext): Promise<void> | void;
  stop(): Promise<void> | void;
}
