import { useEffect, useState } from 'react';
import { OverlayClient, isChatEvent, type ChatEvent } from '@apex/overlay-sdk';
import { GATEWAY_URL } from './overlays-catalog.js';

/**
 * The desktop chat dock reuses the very same overlay SDK + gateway the overlays
 * use — one event pipeline, two consumers. This is the unified inbox the user
 * asked for: every platform's chat in one panel.
 */
export function ChatDock() {
  const [lines, setLines] = useState<ChatEvent[]>([]);

  useEffect(() => {
    const client = new OverlayClient({
      url: GATEWAY_URL,
      token: 'dev-token',
      filter: { kinds: ['chat'] },
    });
    const off = client.on((event) => {
      if (isChatEvent(event)) setLines((prev) => [...prev, event].slice(-100));
    });
    client.connect();
    return () => {
      off();
      client.close();
    };
  }, []);

  return (
    <div className="chat-dock">
      {lines.length === 0 ? (
        <p className="muted">Waiting for chat… (start the gateway + chat-aggregator)</p>
      ) : (
        lines.map((l) => (
          <div key={l.id} className={`dock-line platform-${l.platform}`}>
            <span className="pf-dot" />
            <span className="name" style={{ color: l.author.color ?? undefined }}>
              {l.author.displayName}
            </span>
            <span className="txt">{l.text}</span>
          </div>
        ))
      )}
    </div>
  );
}
