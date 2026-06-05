# ApexStreamCentre — Task List / What's Next

Phase 1 (scaffold) is on PR #1. This is the running backlog for everything after.
Checkboxes are roughly ordered; **bold** items are the recommended next pickups.

Legend: 🟢 small (≤1 day) · 🟡 medium (2–4 days) · 🔴 large (1–2+ weeks)

---

## Phase 1.5 — Harden the foundation (do these first)
- [ ] **🟢 Wire the native engine: add `libobs`/`libobs-wrapper` deps and implement `LibObsBackend`** (replace the stub in `apps/desktop/src-tauri/src/engine.rs`). Validate on a Windows dev box: startup, scene create, display-capture source, preview surface, RTMP output.
- [ ] **🟡 Stand up real auth in the gateway** — replace the token stub in `services/gateway/src/tokens.ts` with signed JWTs scoping overlays to a user's channels; verify on WS upgrade.
- [ ] 🟢 Add unit tests for the spine: `hub.matches()` filtering, Twitch IRC tag parsing (`twitch.ts`), and `buildFanOut()` in `services/multistream`.
- [ ] 🟢 Add a `cargo clippy` + `cargo check` CI job (install Tauri Linux deps + build frontend first so `generate_context!` finds `dist`).
- [ ] 🟢 Add ESLint config + a `lint` job to CI (root already exposes `pnpm lint`).
- [ ] 🟢 Replace the in-memory `Hub` with **Redis pub/sub** so the gateway scales horizontally (interface already isolated in `hub.ts`).
- [ ] 🟢 Add `.env` validation + a single typed config module per service.

## Phase 2 — Multistream, productionized 🔴
- [ ] Dashboard UI to connect platform stream keys (Twitch/YouTube/Kick) and toggle destinations.
- [ ] Persist `RestreamProfile`s (Postgres) instead of in-memory map in `services/multistream`.
- [ ] Reconcile live: start/stop `ffmpeg` children as destinations are toggled **mid-stream** (drive via the MediaMTX API at `:9997`, not just `runOnReady`).
- [ ] Per-destination stream health + bitrate/drop telemetry surfaced in the studio.
- [ ] Auto-provision per-user ingest paths + ingest auth (stream keys for *our* server).
- [ ] Decide hosting topology for MediaMTX (regional ingest, bandwidth budgeting — fan-out is N× upload).

## Phase 3 — Overlay marketplace & deeper interactivity 🔴
- [ ] Marketplace API + gallery UI (browse, preview, install-to-scene).
- [ ] Overlay theming/config (colours, fonts, sounds, durations) persisted per user.
- [ ] **Interactive** overlays: chat-command-driven widgets (polls, goal bars, emote rains, TTS).
- [ ] Alert customization editor (per-event-type templates, animations, audio).
- [ ] Overlay versioning + safe rollout; creator-submitted overlays (sandboxing).
- [ ] Expand `packages/overlay-sdk` with helpers (queueing, sound, asset preload, test-event injection).

## Phase 4 — Auth & full platform parity 🔴
- [ ] OAuth flows for Twitch, YouTube, Kick (token storage + refresh).
- [ ] **Twitch EventSub** (WebSocket) for subs/bits/raids/follows — extend `connectors/twitch.ts` (chat already works anonymously).
- [ ] Implement `connectors/youtube.ts` — resolve `liveChatId`, poll Live Chat API, map super-chat/membership events.
- [ ] Implement `connectors/kick.ts` — Pusher WS + API for chat/subs/gifts.
- [ ] Emote providers: BTTV / FFZ / 7TV resolution in the normalizer.
- [ ] Account system: users, channels, sessions, billing hooks (Stripe).

## Phase 5 — iOS 🔴
- [ ] **Companion app** first: read unified chat, fire/manage overlays, monitor stream health from the phone (reuses gateway + `overlay-sdk` event pipeline).
- [ ] Mobile **broadcaster**: capture camera/screen via ReplayKit + encode/stream via HaishinKit (RTMP/SRT) to our ingest.
- [ ] Shared auth + push notifications for alerts.

## Phase 6 — Packaging, distribution & compliance 🟡
- [ ] Signed Windows installer (Tauri bundle) that ships/downloads the libobs runtime.
- [ ] macOS build (Apple Silicon) — engine path already cross-platform via libobs.
- [ ] Auto-update channel for the desktop app.
- [ ] **GPLv2 compliance**: publish desktop source + written source-offer with every release (see `docs/LICENSING.md`).
- [ ] Trademark "ApexStreamCentre"; finalize the proprietary/GPL boundary with counsel before public launch.

---

## Cross-cutting / ops
- [ ] Observability: structured logging, metrics, error tracking across services.
- [ ] `docker-compose` → production deploy (Postgres, Redis, gateway, aggregator, MediaMTX) + IaC.
- [ ] Load test the gateway fan-out (thousands of concurrent overlay/chat-dock subscribers).
- [ ] Security review of overlay token scoping + ingest auth before any public beta.
- [ ] End-to-end test harness using the `SyntheticConnector` in CI.

## Known follow-ups from Phase 1
- [ ] Twitch connector retries every 2s on connect error — add capped backoff + surface status to the UI.
- [ ] Desktop overlay-source URL is attached client-side in the mock; persist `Source.url` natively in the Rust core.
- [ ] `apps/dashboard` is a placeholder — becomes the real account/marketplace/multistream UI in P2/P3.
