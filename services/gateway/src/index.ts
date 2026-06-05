/**
 * ApexStreamCentre gateway.
 *
 * Two responsibilities for Phase 1:
 *   1. WebSocket hub at GATEWAY_WS_PATH  — subscribers (overlays, desktop dock).
 *   2. WebSocket ingest at GATEWAY_INGEST_PATH — publishers (chat-aggregator).
 * Plus a tiny REST surface: health + overlay-token issuance.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GATEWAY_INGEST_PATH,
  GATEWAY_WS_PATH,
  type ClientFrame,
  type PublishFrame,
  type ServerFrame,
} from '@apex/shared';
import { Hub } from './hub.js';
import { issueToken, verifyToken } from './tokens.js';

const PORT = Number(process.env.PORT ?? 8787);
const hub = new Hub();

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, subscribers: hub.size });
  }
  if (req.method === 'POST' && url.pathname === '/overlay-token') {
    // Dev stub: issue a token scoped to all channels.
    return json(res, 200, { token: issueToken({ channels: [] }) });
  }
  json(res, 404, { error: 'not_found' });
});

// Subscriber hub (overlays + desktop chat dock).
const subWss = new WebSocketServer({ noServer: true });
subWss.on('connection', (ws: WebSocket, claimsChannels: string[]) => {
  let subId: string | null = null;

  ws.on('message', (raw) => {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw.toString()) as ClientFrame;
    } catch {
      return;
    }
    if (frame.t === 'ping') return reply(ws, { t: 'pong' });
    if (frame.t === 'subscribe') {
      if (subId) hub.remove(subId);
      // Intersect requested channels with the token's allowed channels.
      const allowed = claimsChannels.length > 0 ? claimsChannels : frame.filter.channels;
      subId = hub.add({ ...frame.filter, channels: allowed }, (event) =>
        reply(ws, { t: 'event', event }),
      );
      reply(ws, { t: 'ready', connectionId: subId });
    }
  });

  ws.on('close', () => {
    if (subId) hub.remove(subId);
  });
});

// Ingest endpoint (publishers).
const ingestWss = new WebSocketServer({ noServer: true });
ingestWss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw) => {
    let frame: PublishFrame;
    try {
      frame = JSON.parse(raw.toString()) as PublishFrame;
    } catch {
      return;
    }
    if (frame.t === 'publish') hub.publish(frame.event);
  });
});

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname === GATEWAY_WS_PATH) {
    const claims = verifyToken(url.searchParams.get('token'));
    if (!claims) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    subWss.handleUpgrade(req, socket, head, (ws) => subWss.emit('connection', ws, claims.channels));
    return;
  }
  if (url.pathname === GATEWAY_INGEST_PATH) {
    // Ingest is reachable only inside the private network; no token in Phase 1.
    ingestWss.handleUpgrade(req, socket, head, (ws) => ingestWss.emit('connection', ws));
    return;
  }
  socket.destroy();
});

httpServer.listen(PORT, () => {
  console.log(`[gateway] http+ws listening on :${PORT}`);
  console.log(`[gateway]   subscribers -> ws://localhost:${PORT}${GATEWAY_WS_PATH}?token=...`);
  console.log(`[gateway]   ingest      -> ws://localhost:${PORT}${GATEWAY_INGEST_PATH}`);
});

function reply(ws: WebSocket, frame: ServerFrame): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
}

function json(res: ServerResponse<IncomingMessage>, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
