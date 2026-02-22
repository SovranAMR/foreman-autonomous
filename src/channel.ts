/**
 * FOREMAN — Channel Interface
 *
 * Unified interface for messaging channels (Telegram, WhatsApp, etc.)
 * Each channel implementation receives messages and routes them
 * through the MessagingGateway for processing.
 */

// ─── TYPES ───────────────────────────────────────────────────

/** Inbound message from any channel */
export interface InboundMessage {
  /** Unique message ID (channel-specific) */
  id: string;
  /** Channel source identifier */
  channel: ChannelType;
  /** Sender identifier (user ID in the channel) */
  senderId: string;
  /** Sender display name */
  senderName: string;
  /** Message text content */
  text: string;
  /** Chat/group/conversation ID */
  chatId: string;
  /** Whether this is a group chat */
  isGroup: boolean;
  /** Timestamp */
  timestamp: Date;
  /** Reply-to message ID (if replying) */
  replyToId?: string;
  /** Media attachments */
  media?: MediaAttachment[];
}

/** Media attachment */
export interface MediaAttachment {
  type: "photo" | "document" | "audio" | "video" | "sticker";
  /** File ID or URL */
  fileId: string;
  /** MIME type */
  mimeType?: string;
  /** Caption */
  caption?: string;
}

/** Outbound reply */
export interface OutboundReply {
  /** Text content */
  text: string;
  /** Parse mode (markdown, html, plain) */
  parseMode?: "markdown" | "html" | "plain";
  /** Reply to specific message */
  replyToId?: string;
}

/** Supported channel types */
export type ChannelType = "telegram" | "whatsapp" | "cli";

/** Channel configuration */
export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  /** Allowed sender IDs (empty = allow all) */
  allowedSenders: string[];
}

/** Telegram-specific config */
export interface TelegramChannelConfig extends ChannelConfig {
  type: "telegram";
  /** Bot token from @BotFather */
  botToken: string;
}

/** WhatsApp-specific config */
export interface WhatsAppChannelConfig extends ChannelConfig {
  type: "whatsapp";
  /** Session data directory */
  sessionDir: string;
}

// ─── CHANNEL INTERFACE ──────────────────────────────────────

/** Channel lifecycle interface */
export interface Channel {
  /** Channel type */
  readonly type: ChannelType;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop the channel */
  stop(): Promise<void>;

  /** Send a reply to a chat */
  send(chatId: string, reply: OutboundReply): Promise<void>;

  /** Whether the channel is currently connected */
  isConnected(): boolean;
}

/** Message handler callback — gateway registers this */
export type MessageHandler = (message: InboundMessage) => Promise<OutboundReply | null>;

// ─── GATEWAY CONFIG ─────────────────────────────────────────

/** Full messaging gateway configuration */
export interface GatewayConfig {
  /** Project root for Engine */
  projectRoot: string;
  /** Project name */
  projectName: string;
  /** Channel configurations */
  channels: ChannelConfig[];
  /** Max concurrent message processing */
  maxConcurrent: number;
  /** Message timeout (ms) */
  messageTimeoutMs: number;
}
