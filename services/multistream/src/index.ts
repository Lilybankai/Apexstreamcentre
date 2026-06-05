/**
 * Multistream control plane (Phase 1).
 *
 * A small REST service that stores per-path restream profiles in memory and can
 * render the fan-out command set. In P2 this persists profiles, authenticates
 * the broadcaster, and reconciles live (start/stop ffmpeg children as
 * destinations are toggled mid-stream).
 *
 *   GET  /health
 *   GET  /profiles/:path            -> RestreamProfile
 *   PUT  /profiles/:path            <- RestreamProfile (body) ; stores it
 *   GET  /profiles/:path/fanout     -> { commands: string[][] }
 */
import { createServer, type ServerResponse } from 'node:http';
import { buildFanOut, type RestreamProfile } from './destinations.js';

const PORT = Number(process.env.PORT ?? 8790);
const MEDIAMTX_RTMP = process.env.MEDIAMTX_RTMP ?? 'rtmp://localhost:1935';

const profiles = new Map<string, RestreamProfile>();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, profiles: profiles.size });
  }

  if (parts[0] === 'profiles' && parts[1]) {
    const path = parts[1];
    if (req.method === 'PUT' && parts.length === 2) {
      const body = (await readBody(req)) as RestreamProfile;
      profiles.set(path, { ...body, path });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && parts.length === 2) {
      const profile = profiles.get(path);
      return profile ? json(res, 200, profile) : json(res, 404, { error: 'not_found' });
    }
    if (req.method === 'GET' && parts[2] === 'fanout') {
      const profile = profiles.get(path);
      if (!profile) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { commands: buildFanOut(profile, MEDIAMTX_RTMP) });
    }
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`[multistream] control plane on :${PORT}`));

function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
