# ApexStreamCentre

A modern, lightweight streaming studio — a fresh take on what Streamlabs/OBS do:

- 🎬 **Scenes & sources** powered by the proven OBS engine (`libobs`), wrapped in a
  low-footprint **Tauri (Rust)** shell instead of a heavy Electron app.
- ✨ **Interactive overlays** you pick from a gallery and drop straight into a scene.
- 📡 **Multistream** to Twitch, YouTube & Kick from a single upload (server-side
  RTMP fan-out — no extra CPU, no extra upload bandwidth).
- 💬 **Unified chat + alerts** — every platform's chat and sub/follow/raid events in
  one inbox, driving both the studio and your on-stream overlays.

> **Status:** Phase 1 scaffold. The full spine (aggregator → gateway →
> overlays/desktop) runs today; the libobs capture path is wired behind a feature
> flag and finalized on a Windows/macOS dev box. See
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Monorepo layout

```
apps/
  desktop/   Tauri studio (GPLv2 — links libobs)
  overlays/  browser-source overlays: alerts + chat box
  dashboard/ accounts / marketplace / multistream config (P2/P3)
services/
  gateway/          WebSocket hub + ingest + overlay tokens
  chat-aggregator/  Twitch / YouTube / Kick connectors → normalized events
  multistream/      RTMP fan-out control plane
packages/
  shared/       normalized event schema + wire protocol (the spine)
  overlay-sdk/  overlay runtime (WS client)
infra/          MediaMTX restream + docker compose stack
docs/           ARCHITECTURE.md, LICENSING.md
```

## Quick start

```bash
# 1. Install workspace deps (pnpm 10+, Node 20+)
pnpm install

# 2. Build the TypeScript packages, services and overlays
pnpm build

# 3a. Bring up the local stack (MediaMTX + redis + gateway + chat-aggregator)
cp infra/.env.example infra/.env      # set TWITCH_CHANNEL=<login> or SYNTHETIC=1
pnpm dev:stack

# 3b. ...or run pieces individually with hot reload
pnpm dev:gateway       # ws://localhost:8787
pnpm dev:chat          # connectors → gateway   (reads infra/.env? set env inline)
pnpm dev:overlays      # http://localhost:5180  (alerts.html / chatbox.html)
```

Open `http://localhost:5180/chatbox.html` and `/alerts.html` in a browser — with
`SYNTHETIC=1` you'll see demo chat scroll and alerts fire within seconds.

### Desktop studio (dev)

```bash
pnpm --filter @apex/desktop dev       # studio UI in the browser (engine mocked)
pnpm --filter @apex/desktop tauri dev # native shell, StubBackend (no capture)

# Real OBS engine (capture / encode / RTMP) — needs the OBS runtime + a GPU:
cd apps/desktop && pnpm tauri dev --features engine-libobs
```

The native build needs the [Tauri prerequisites](https://tauri.app/start/prerequisites/).
The real capture/encode path is built on **libobs** behind the `engine-libobs`
feature — see **[`docs/NATIVE-ENGINE.md`](docs/NATIVE-ENGINE.md)** for the build,
the worker-thread design, and end-to-end verification steps.

## Licensing

The desktop client is **GPLv2** (it links libobs); the cloud services, overlays and
dashboard are separate programs and may be proprietary. The split is mandatory and
explained in [`docs/LICENSING.md`](docs/LICENSING.md) — read it before contributing.
