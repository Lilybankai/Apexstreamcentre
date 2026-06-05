import { useEffect, useState } from 'react';
import { clientFromUrl, isChatEvent, type ChatEvent } from '@apex/overlay-sdk';

const MAX_LINES = 25;

/** Unified chat box: shows chat from every connected platform in one column. */
export function ChatBox() {
  const [lines, setLines] = useState<ChatEvent[]>([]);

  useEffect(() => {
    const client = clientFromUrl({ kinds: ['chat'] });
    const off = client.on((event) => {
      if (!isChatEvent(event)) return;
      setLines((prev) => [...prev, event].slice(-MAX_LINES));
    });
    client.connect();
    return () => {
      off();
      client.close();
    };
  }, []);

  return (
    <div className="chatbox">
      {lines.map((line) => (
        <div key={line.id} className={`chat-line platform-${line.platform}`}>
          <span className="name" style={{ color: line.author.color ?? 'var(--pf)' }}>
            {line.author.displayName}
          </span>
          <span>: </span>
          <Message line={line} />
        </div>
      ))}
    </div>
  );
}

/** Render message text, swapping emote ranges for <img>. */
function Message({ line }: { line: ChatEvent }) {
  if (line.emotes.length === 0) return <span>{line.text}</span>;
  const chars = [...line.text];
  // Mark which character indices belong to an emote.
  const segments: Array<{ text: string; emoteUrl?: string }> = [];
  const emoteAt = new Map<number, { end: number; url: string; name: string }>();
  for (const e of line.emotes) {
    for (const [s, end] of e.positions) emoteAt.set(s, { end, url: e.url, name: e.name });
  }
  for (let i = 0; i < chars.length; ) {
    const hit = emoteAt.get(i);
    if (hit) {
      segments.push({ text: hit.name, emoteUrl: hit.url });
      i = hit.end + 1;
    } else {
      let text = '';
      while (i < chars.length && !emoteAt.has(i)) text += chars[i++];
      segments.push({ text });
    }
  }
  return (
    <span>
      {segments.map((seg, idx) =>
        seg.emoteUrl ? (
          <img key={idx} className="emote" src={seg.emoteUrl} alt={seg.text} title={seg.text} />
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
