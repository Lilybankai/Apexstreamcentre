import { useCallback, useEffect, useState } from 'react';
import { engine } from './engine.js';
import { OVERLAY_CATALOG, overlayUrl } from './overlays-catalog.js';
import type { OverlayDef, SceneState, SourceKind, StreamStatus } from './types.js';
import { ChatDock } from './ChatDock.js';

const SOURCE_KINDS: SourceKind[] = ['display', 'window', 'camera', 'audio', 'browser'];
const DEFAULT_INGEST = 'rtmp://localhost:1935/live';

export function App() {
  const [state, setState] = useState<SceneState | null>(null);
  const [stream, setStream] = useState<StreamStatus>({ live: false });
  const [ingest, setIngest] = useState(DEFAULT_INGEST);

  useEffect(() => {
    void engine.getScenes().then(setState);
    void engine.getStreamStatus().then(setStream);
  }, []);

  const activeScene = state?.scenes.find((s) => s.name === state.active) ?? null;

  const addSource = useCallback(
    async (kind: SourceKind) => {
      if (!state) return;
      const name = `${kind[0]!.toUpperCase()}${kind.slice(1)} ${Date.now() % 1000}`;
      setState(await engine.addSource(state.active, kind, name));
    },
    [state],
  );

  const addOverlay = useCallback(
    async (def: OverlayDef) => {
      if (!state) return;
      // Overlays are browser sources; the URL carries the gateway + token.
      const next = await engine.addSource(state.active, 'browser', def.name);
      // Attach the URL client-side for the mock; the Rust core stores it natively.
      const scene = next.scenes.find((s) => s.name === next.active);
      const src = scene?.sources.find((s) => s.name === def.name);
      if (src) src.url = overlayUrl(def);
      setState({ ...next });
    },
    [state],
  );

  const toggleStream = useCallback(async () => {
    setStream(stream.live ? await engine.stopStream() : await engine.startStream(ingest));
  }, [stream.live, ingest]);

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          Apex<span>StreamCentre</span>
        </div>
        <div className="ingest">
          <input value={ingest} onChange={(e) => setIngest(e.target.value)} spellCheck={false} />
        </div>
        <button className={`golive ${stream.live ? 'live' : ''}`} onClick={toggleStream}>
          {stream.live ? '■ End Stream' : '● Go Live'}
        </button>
      </header>

      <div className="body">
        <aside className="panel scenes">
          <PanelHeader title="Scenes" />
          <ul className="list">
            {state?.scenes.map((s) => (
              <li
                key={s.name}
                className={s.name === state.active ? 'active' : ''}
                onClick={() => engine.setActiveScene(s.name).then(setState)}
              >
                {s.name}
              </li>
            ))}
          </ul>
          <PanelHeader title="Sources" />
          <ul className="list">
            {activeScene?.sources.map((src) => (
              <li key={src.name}>
                <span className={`badge badge-${src.kind}`}>{src.kind}</span> {src.name}
              </li>
            ))}
            {activeScene?.sources.length === 0 ? <li className="muted">No sources yet</li> : null}
          </ul>
          <div className="add-row">
            {SOURCE_KINDS.map((k) => (
              <button key={k} onClick={() => addSource(k)} title={`Add ${k} source`}>
                +{k}
              </button>
            ))}
          </div>
        </aside>

        <main className="preview">
          <div className={`preview-canvas ${stream.live ? 'live' : ''}`}>
            <div className="preview-label">
              {activeScene ? activeScene.name : 'No scene'}
              {stream.live ? <span className="rec">● LIVE</span> : null}
            </div>
            <p className="preview-note">
              Engine preview renders here (libobs display surface in the native shell).
            </p>
          </div>
        </main>

        <aside className="panel right">
          <PanelHeader title="Overlays" />
          <div className="overlay-grid">
            {OVERLAY_CATALOG.map((def) => (
              <button key={def.id} className="overlay-card" onClick={() => addOverlay(def)}>
                <strong>{def.name}</strong>
                <span>{def.description}</span>
                <em>+ add to scene</em>
              </button>
            ))}
          </div>
          <PanelHeader title="Chat" />
          <ChatDock />
        </aside>
      </div>
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return <div className="panel-header">{title}</div>;
}
