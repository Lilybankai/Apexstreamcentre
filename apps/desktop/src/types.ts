/** Shared UI/engine types, mirrored by the Rust core's serde structs. */

export type SourceKind = 'display' | 'window' | 'camera' | 'audio' | 'browser';

export interface Source {
  name: string;
  kind: SourceKind;
  /** For browser sources (overlays), the URL rendered. */
  url?: string;
}

export interface Scene {
  name: string;
  sources: Source[];
}

export interface SceneState {
  active: string;
  scenes: Scene[];
}

export interface StreamStatus {
  live: boolean;
  ingestUrl?: string;
  startedAt?: number;
}

/** Catalogue entry for the overlay picker. */
export interface OverlayDef {
  id: string;
  name: string;
  description: string;
  /** Relative path served by the overlays app. */
  path: string;
}
