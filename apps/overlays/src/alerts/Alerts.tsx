import { useEffect, useRef, useState } from 'react';
import { clientFromUrl, isAlertEvent, type StreamEvent } from '@apex/overlay-sdk';

/** One alert shown at a time, queued FIFO, each visible for ~5s. */
export function Alerts() {
  const [current, setCurrent] = useState<StreamEvent | null>(null);
  const queue = useRef<StreamEvent[]>([]);
  const showing = useRef(false);

  useEffect(() => {
    const client = clientFromUrl({ kinds: ['alerts'] });
    const pump = () => {
      if (showing.current) return;
      const next = queue.current.shift();
      if (!next) return;
      showing.current = true;
      setCurrent(next);
      setTimeout(() => {
        setCurrent(null);
        showing.current = false;
        pump();
      }, 5000);
    };
    const off = client.on((event) => {
      if (!isAlertEvent(event)) return;
      queue.current.push(event);
      pump();
    });
    client.connect();
    return () => {
      off();
      client.close();
    };
  }, []);

  if (!current) return <div className="alert-stage" />;
  return (
    <div className={`alert-stage platform-${current.platform}`}>
      <div className="alert-card">{renderAlert(current)}</div>
    </div>
  );
}

function renderAlert(e: StreamEvent) {
  switch (e.type) {
    case 'follow':
      return (
        <>
          <div className="headline">
            <span className="who">{e.user.displayName}</span> followed!
          </div>
          <div className="detail">Welcome to the stream 💜</div>
        </>
      );
    case 'subscribe':
    case 'resubscribe':
      return (
        <>
          <div className="headline">
            <span className="who">{e.user.displayName}</span> subscribed!
          </div>
          <div className="detail">
            Tier {e.tier}
            {e.months ? ` · ${e.months} months` : ''}
          </div>
        </>
      );
    case 'gift_sub':
      return (
        <>
          <div className="headline">
            <span className="who">{e.gifter.displayName}</span> gifted {e.count} sub
            {e.count > 1 ? 's' : ''}!
          </div>
          <div className="detail">Tier {e.tier}</div>
        </>
      );
    case 'raid':
      return (
        <>
          <div className="headline">
            <span className="who">{e.from.displayName}</span> raided with {e.viewers}!
          </div>
          <div className="detail">Say hi to the raiders 🎉</div>
        </>
      );
    case 'cheer':
      return (
        <>
          <div className="headline">
            <span className="who">{e.user.displayName}</span> cheered {e.amount}!
          </div>
          {e.message ? <div className="detail">{e.message}</div> : null}
        </>
      );
    case 'super_chat':
      return (
        <>
          <div className="headline">
            <span className="who">{e.user.displayName}</span> Super Chat
          </div>
          <div className="detail">
            {(e.amountMinor / 100).toFixed(2)} {e.currency}
          </div>
        </>
      );
    default:
      return <div className="headline">New event</div>;
  }
}
