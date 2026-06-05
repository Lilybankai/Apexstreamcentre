# ApexStreamCentre — Architecture

A modern, lightweight streaming studio: compose scenes, drop in interactive
overlays, multistream to every platform at once, and read unified chat + alerts.

Rather than rebuild a capture/encode engine (a multi-year effort), the desktop app
is built on **`libobs`** — the proven OBS core — the same way Streamlabs Desktop is.
We bring a modern, low-footprint **Tauri (Rust)** shell instead of Electron, and a
cloud layer (multistream, overlays, chat aggregation) around it.

## The four systems

```
                          ┌─────────────────────────────┐
                          │     apps/desktop (Tauri)     │   GPLv2
   display/cam/audio ───▶ │  Rust core ──libobs──▶ RTMP  │ ──────┐
                          │  React UI: scenes, overlays, │       │ one RTMP
                          │  chat dock                   │       │ upload
                          └──────────────┬──────────────┘       ▼
                                         │ browser sources   ┌─────────────┐
                                         │ (overlay URLs)    │  MediaMTX   │ ingest :1935
                                         ▼                   │  restream   │
                          ┌─────────────────────────────┐    │  fan-out    │
                          │     apps/overlays (web)      │    └──────┬──────┘
                          │  alerts.html, chatbox.html   │           │ ffmpeg -c copy
                          └──────────────┬──────────────┘     ┌──────┼───────┐
                                         │ WS (overlay-sdk)   ▼      ▼       ▼
                          ┌──────────────▼──────────────┐  Twitch  YouTube  Kick
                          │     services/gateway         │
                          │  WS hub + ingest + tokens    │ ◀── publish ──┐
                          └──────────────▲──────────────┘               │
                                         │ subscribe                     │
                          ┌──────────────┴──────────────┐   ┌────────────┴───────────┐
                          │   desktop chat dock (WS)     │   │ services/chat-aggregator│
                          └─────────────────────────────┘   │  Twitch/YouTube/Kick    │
                                                             │  -> normalized events   │
                                                             └─────────────────────────┘
```

### 1. Capture / scene / encode — `apps/desktop`
A Tauri app. The React UI (`src/`) calls Rust `#[tauri::command]`s (`src-tauri/`)
through the typed bridge in `src/engine.ts`. The Rust **`engine.rs`** owns the scene
graph and delegates capture/compositing/encoding/output to a `Backend`:
- `StubBackend` (default) — state only; builds and runs anywhere.
- `LibObsBackend` (feature `engine-libobs`) — drives the real OBS engine via the
  `libobs`/`libobs-wrapper` crates. The `Backend` trait maps 1:1 onto libobs calls.

### 2. Multistream — `infra/mediamtx` + `services/multistream`
The desktop uploads **one** RTMP stream to MediaMTX. On stream-ready, MediaMTX runs
`restream.sh`, spawning one `ffmpeg -c copy` per destination — **no re-encode**, so
CPU is negligible and bandwidth (paid by the server) scales linearly with
destinations. The control plane (`services/multistream`) stores per-path destination
profiles and renders the fan-out (`buildFanOut`).

### 3. Interactive overlays — `apps/overlays` + `packages/overlay-sdk`
Overlays are web pages loaded as OBS **browser sources**. Picking one in the studio
adds a browser source whose URL carries the gateway origin + a per-overlay token.
Each overlay uses `overlay-sdk` to open a WebSocket to the gateway and subscribe to
the event kinds it renders — so it reacts live to chat/subs/raids. Ships with
`alerts` and `chatbox`.

### 4. Chat & alerts aggregation — `services/chat-aggregator` + `services/gateway`
Each platform has a `Connector` that translates native payloads into one normalized
**`StreamEvent`** (`packages/shared`). The aggregator publishes events to the gateway
ingest; the gateway fans them out to every matching subscriber (overlays + the
desktop chat dock). Twitch chat works today over anonymous IRC; YouTube/Kick are
stubbed behind the same interface (filled in at P4 with OAuth). A `SyntheticConnector`
(`SYNTHETIC=1`) emits demo events for credential-free local testing.

## The spine: one event type, everywhere
`packages/shared/events.ts` defines `StreamEvent`. **Every** producer normalizes to
it and **every** consumer switches on it. Adding a platform = writing one connector;
no consumer changes. The wire protocol lives in `packages/shared/protocol.ts`.

## Repository map
| Path | Zone | Role |
|---|---|---|
| `apps/desktop` | GPLv2 | Tauri studio: scenes, overlays, chat dock, libobs core |
| `apps/overlays` | Proprietary | Browser-source overlays (alerts, chat box) |
| `apps/dashboard` | Proprietary | Accounts, marketplace, multistream config (P2/P3) |
| `services/gateway` | Proprietary | WebSocket hub + ingest + overlay tokens |
| `services/chat-aggregator` | Proprietary | Platform connectors → normalized events |
| `services/multistream` | Proprietary | RTMP fan-out control plane |
| `packages/shared` | Proprietary | Normalized event schema + wire protocol |
| `packages/overlay-sdk` | Proprietary | Overlay runtime (WS client) |
| `infra` | — | MediaMTX + local docker stack |

See [LICENSING.md](./LICENSING.md) for why the GPLv2 / proprietary split exists and
the rules that keep it valid.

## Roadmap
- **P2** Multistream productionized: dashboard key config, live reconcile via MediaMTX API, stream health telemetry.
- **P3** Overlay marketplace + deeper interactivity (chat-command-driven overlays, theming).
- **P4** Auth + OAuth; YouTube & Kick connectors to parity.
- **P5** iOS: companion app, then mobile broadcaster (ReplayKit + HaishinKit).
- **P6** Packaging: signed Windows installer bundling the libobs runtime; GPL source-offer compliance.
