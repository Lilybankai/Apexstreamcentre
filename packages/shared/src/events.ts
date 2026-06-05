/**
 * Normalized event schema — the lingua franca of ApexStreamCentre.
 *
 * Every platform connector (Twitch, YouTube, Kick, ...) translates its native
 * payloads into one of these shapes. Everything downstream — the desktop chat
 * dock, the chat-box overlay, alert overlays — consumes ONLY these types and
 * never touches a platform-specific payload. Add a platform => write a
 * connector; you never touch the consumers.
 */

/** Streaming platforms supported for chat + alert ingestion. */
export type Platform = 'twitch' | 'youtube' | 'kick';

/** Discriminator for the normalized event union. */
export type StreamEventType =
  | 'chat'
  | 'follow'
  | 'subscribe'
  | 'resubscribe'
  | 'gift_sub'
  | 'raid'
  | 'cheer'
  | 'host'
  | 'super_chat';

/** A single emote occurrence within a chat message, for rich rendering. */
export interface EmoteToken {
  /** Provider-agnostic id (Twitch/BTTV/FFZ/7TV all flatten to this). */
  id: string;
  /** The literal text the emote replaced, e.g. "Kappa". */
  name: string;
  /** Absolute URL to the emote image. */
  url: string;
  /** Character offsets [start, end] within the message text. */
  positions: Array<[number, number]>;
}

/** Common envelope fields shared by every normalized event. */
export interface BaseEvent {
  /** Stable unique id for de-duplication across reconnects. */
  id: string;
  platform: Platform;
  /** Channel/broadcaster the event belongs to. */
  channel: string;
  /** Epoch milliseconds when the event occurred (or was received). */
  timestamp: number;
}

export interface ChatEvent extends BaseEvent {
  type: 'chat';
  author: {
    id: string;
    displayName: string;
    /** Hex colour the platform assigned to the user, if any. */
    color?: string;
    badges: string[];
    isModerator: boolean;
    isSubscriber: boolean;
    isBroadcaster: boolean;
  };
  text: string;
  emotes: EmoteToken[];
}

export interface FollowEvent extends BaseEvent {
  type: 'follow';
  user: { id: string; displayName: string };
}

export interface SubscribeEvent extends BaseEvent {
  type: 'subscribe' | 'resubscribe';
  user: { id: string; displayName: string };
  /** Platform tier, normalized to 1/2/3 where applicable. */
  tier: 1 | 2 | 3;
  /** Cumulative months for resubs, if known. */
  months?: number;
  message?: string;
}

export interface GiftSubEvent extends BaseEvent {
  type: 'gift_sub';
  gifter: { id: string; displayName: string };
  count: number;
  tier: 1 | 2 | 3;
}

export interface RaidEvent extends BaseEvent {
  type: 'raid';
  from: { id: string; displayName: string };
  viewers: number;
}

export interface CheerEvent extends BaseEvent {
  type: 'cheer';
  user: { id: string; displayName: string };
  /** Twitch bits / Kick equivalents / YouTube super-chat micro-amounts. */
  amount: number;
  message?: string;
}

export interface SuperChatEvent extends BaseEvent {
  type: 'super_chat';
  user: { id: string; displayName: string };
  /** Minor currency units (e.g. cents). */
  amountMinor: number;
  currency: string;
  message?: string;
}

/** The discriminated union every consumer switches on. */
export type StreamEvent =
  | ChatEvent
  | FollowEvent
  | SubscribeEvent
  | GiftSubEvent
  | RaidEvent
  | CheerEvent
  | SuperChatEvent;

/** Narrowing helper used by overlays/consumers. */
export function isChatEvent(e: StreamEvent): e is ChatEvent {
  return e.type === 'chat';
}

/**
 * "Alert" events are everything that should trigger a visual/audio alert —
 * i.e. every non-chat event. The alert overlay subscribes to exactly these.
 */
export function isAlertEvent(e: StreamEvent): boolean {
  return e.type !== 'chat';
}
