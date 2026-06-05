/**
 * Overlay token issuance (Phase 1 stub).
 *
 * Overlays are loaded with a per-overlay token in their URL. In production this
 * is a signed JWT scoping the overlay to a user's channels; here we issue an
 * opaque random token and accept any non-empty token, so the local stack works
 * without an auth provider. Replace `issueToken`/`verifyToken` in P4 (auth).
 */
import { randomBytes } from 'node:crypto';

export interface TokenClaims {
  /** Channels this overlay may receive events for. Empty => all (dev only). */
  channels: string[];
}

export function issueToken(_claims: TokenClaims): string {
  return randomBytes(24).toString('base64url');
}

export function verifyToken(token: string | null): TokenClaims | null {
  if (!token || token.length === 0) return null;
  // Dev stub: accept any token, grant all channels.
  return { channels: [] };
}
