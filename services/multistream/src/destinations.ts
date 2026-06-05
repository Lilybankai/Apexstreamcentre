/**
 * Multistream destinations + fan-out command generation.
 *
 * The model: the desktop app uploads ONE RTMP stream to our MediaMTX ingest.
 * When that path becomes ready, MediaMTX's `runOnReady` hook invokes the
 * fan-out script (see infra/mediamtx/restream.sh), which spawns one ffmpeg per
 * destination doing a pure stream copy (`-c copy`) — no re-encode, so CPU is
 * negligible and quality is identical to the source. Bandwidth scales linearly
 * with destination count, paid by the server, not the creator.
 */
import type { Platform } from '@apex/shared';

/** Well-known RTMP ingest endpoints per platform. */
export const PLATFORM_RTMP: Record<Platform, string> = {
  twitch: 'rtmp://live.twitch.tv/app',
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
  kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app',
};

export interface Destination {
  platform: Platform;
  /** Stream key issued by the platform to the broadcaster. */
  streamKey: string;
  enabled: boolean;
}

export interface RestreamProfile {
  /** The MediaMTX ingest path this profile fans out (e.g. a per-user id). */
  path: string;
  destinations: Destination[];
}

/** Full RTMP URL for a destination. */
export function destinationUrl(d: Destination): string {
  return `${PLATFORM_RTMP[d.platform]}/${d.streamKey}`;
}

/**
 * Build one ffmpeg argv per enabled destination. Each copies the codecs and
 * republishes via RTMP/RTMPS. The source is the local MediaMTX RTMP path.
 */
export function buildFanOut(profile: RestreamProfile, mediaMtxRtmp = 'rtmp://localhost:1935'): string[][] {
  const source = `${mediaMtxRtmp}/${profile.path}`;
  return profile.destinations
    .filter((d) => d.enabled && d.streamKey)
    .map((d) => [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-i',
      source,
      '-c',
      'copy',
      '-f',
      'flv',
      destinationUrl(d),
    ]);
}
