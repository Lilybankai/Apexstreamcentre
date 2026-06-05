import type { OverlayDef } from './types.js';

/**
 * Built-in overlay catalogue shown in the studio's overlay picker. Selecting one
 * adds a browser source pointing at the overlays app. In P3 this is replaced by
 * the marketplace API (browse, install, theme).
 */
export const OVERLAY_CATALOG: OverlayDef[] = [
  {
    id: 'alerts',
    name: 'Alerts',
    description: 'Animated follow / sub / raid / cheer alerts.',
    path: '/alerts.html',
  },
  {
    id: 'chatbox',
    name: 'Chat Box',
    description: 'Unified chat from Twitch, YouTube & Kick.',
    path: '/chatbox.html',
  },
];

/** Base URL where the overlays app is served. */
export const OVERLAYS_BASE = import.meta.env.VITE_OVERLAYS_URL ?? 'http://localhost:5180';
/** Gateway WebSocket origin for the chat dock + overlay tokens. */
export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'ws://localhost:8787';

export function overlayUrl(def: OverlayDef, token = 'dev-token'): string {
  const gw = encodeURIComponent(GATEWAY_URL);
  return `${OVERLAYS_BASE}${def.path}?token=${token}&gateway=${gw}`;
}
