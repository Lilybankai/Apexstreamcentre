/**
 * Typed bridge from the studio UI to the Rust engine core (Tauri commands).
 *
 * When running inside the Tauri shell, calls are dispatched to the Rust
 * `#[tauri::command]`s in src-tauri. When running in a plain browser (vite dev
 * or the web build used for CI), they fall back to an in-memory mock so the UI
 * is fully developable without the native shell.
 */
import type { SceneState, SourceKind, StreamStatus } from './types.js';

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let invoke: InvokeFn;
if (isTauri) {
  // Lazy import so the web build doesn't choke on the native module.
  const mod = await import('@tauri-apps/api/core');
  invoke = mod.invoke as InvokeFn;
} else {
  invoke = mockInvoke;
}

export const engine = {
  getScenes: () => invoke<SceneState>('get_scenes'),
  setActiveScene: (name: string) => invoke<SceneState>('set_active_scene', { name }),
  addScene: (name: string) => invoke<SceneState>('add_scene', { name }),
  addSource: (scene: string, kind: SourceKind, name: string) =>
    invoke<SceneState>('add_source', { scene, kind, name }),
  removeSource: (scene: string, name: string) =>
    invoke<SceneState>('remove_source', { scene, name }),
  startStream: (ingestUrl: string) => invoke<StreamStatus>('start_stream', { ingestUrl }),
  stopStream: () => invoke<StreamStatus>('stop_stream'),
  getStreamStatus: () => invoke<StreamStatus>('get_stream_status'),
};

// ---- Browser mock (dev / CI) -------------------------------------------------

const mockState: SceneState = {
  active: 'Main Scene',
  scenes: [
    { name: 'Main Scene', sources: [{ name: 'Display Capture', kind: 'display' }] },
    { name: 'Starting Soon', sources: [] },
  ],
};
let mockStream: StreamStatus = { live: false };

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const a = args ?? {};
  switch (cmd) {
    case 'get_scenes':
      return structuredClone(mockState) as T;
    case 'set_active_scene':
      mockState.active = a['name'] as string;
      return structuredClone(mockState) as T;
    case 'add_scene':
      mockState.scenes.push({ name: a['name'] as string, sources: [] });
      return structuredClone(mockState) as T;
    case 'add_source': {
      const scene = mockState.scenes.find((s) => s.name === a['scene']);
      scene?.sources.push({ name: a['name'] as string, kind: a['kind'] as SourceKind });
      return structuredClone(mockState) as T;
    }
    case 'remove_source': {
      const scene = mockState.scenes.find((s) => s.name === a['scene']);
      if (scene) scene.sources = scene.sources.filter((s) => s.name !== a['name']);
      return structuredClone(mockState) as T;
    }
    case 'start_stream':
      mockStream = { live: true, ingestUrl: a['ingestUrl'] as string, startedAt: Date.now() };
      return structuredClone(mockStream) as T;
    case 'stop_stream':
      mockStream = { live: false };
      return structuredClone(mockStream) as T;
    case 'get_stream_status':
      return structuredClone(mockStream) as T;
    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}
