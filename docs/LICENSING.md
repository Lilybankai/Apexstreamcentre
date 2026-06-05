# Licensing

ApexStreamCentre is deliberately split into two licensing zones. **Read this before
adding a dependency or moving code between zones.**

## Why this matters

The desktop studio is built on **`libobs`**, the core engine of OBS Studio. OBS is
licensed under the **GNU GPL v2**. The GPL is "copyleft": any binary that **links**
libobs (statically or dynamically) is a derivative work and **must itself be
distributed under the GPL**, with **complete corresponding source code made
available** to anyone who receives the binary. This is exactly why Streamlabs
Desktop is open source.

There is no way around this while linking libobs. The standard, fully-legal pattern —
the one we use — is to keep everything that links libobs in one open-source
component, and keep the rest of the product (the cloud services, the marketplace,
billing, hosted overlays) as **separate programs** that communicate over a network
or IPC boundary. Separate programs that merely talk to each other over a socket are
**not** derivative works of each other, so they can carry whatever license you choose.

## Zone A — GPLv2 (open source)

Everything that links libobs:

- `apps/desktop/src-tauri/**` — the Rust engine core (links libobs when the
  `engine-libobs` feature is enabled).
- The desktop UI shipped inside that binary (`apps/desktop/src/**`).

These are distributed under **GPL-2.0-only**. We must publish their source and
provide a written offer for source with every binary release.

## Zone B — Proprietary (your IP / business moat)

Everything that runs as a **separate process** and never links libobs:

- `services/gateway`, `services/chat-aggregator`, `services/multistream`
- `apps/dashboard` (marketplace, accounts, billing)
- `apps/overlays` (hosted overlay web apps)
- `packages/shared`, `packages/overlay-sdk`

These talk to the desktop app only over WebSocket / HTTP / RTMP. They may be kept
closed source and are where the commercial value concentrates (hosted overlays,
multistream service, subscriptions, marketplace).

## Practical rules

1. **Never** `import`/link libobs (or GPL code) from a Zone B package.
2. **Never** copy source from a Zone A file into a Zone B file.
3. Communication between zones is **data over a socket**, never shared linked code.
4. Each desktop release ships with its full source + a source-offer notice.
5. Trademark "ApexStreamCentre" separately — the GPL covers code, not your brand.

> This document is engineering guidance, not legal advice. Have counsel review the
> distribution model before a public release.
