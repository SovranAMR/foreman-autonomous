/**
 * FOREMAN — WhatsApp Channel
 *
 * Baileys-based WhatsApp integration (no API key needed).
 * Uses QR code authentication on first run.
 *
 * Features:
 * - QR code login (terminal + link)
 * - Message parsing (text, media captions)
 * - Session persistence (reconnect without QR)
 * - Typing indicator
 * - Reply threading
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  Channel,
  InboundMessage,
  OutboundReply,
  WhatsAppChannelConfig,
  MessageHandler,
} from "./channel.js";

// Baileys logs are very verbose — silence them
const logger = {
  level: "silent" as const,
  info: () => {},
  error: (...args: unknown[]) => console.error("[whatsapp]", ...args),
  warn: (...args: unknown[]) => console.warn("[whatsapp]", ...args),
  debug: () => {},
  trace: () => {},
  fatal: (...args: unknown[]) => console.error("[whatsapp:fatal]", ...args),
  child: () => logger,
};

// ─── WHATSAPP CHANNEL ───────────────────────────────────────

export class WhatsAppChannel implements Channel {
  readonly type = "whatsapp" as const;
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private config: WhatsAppChannelConfig;
  private onMessage: MessageHandler;
  private connected = false;
  private processedIds = new Set<string>();

  constructor(config: WhatsAppChannelConfig, onMessage: MessageHandler) {
    this.config = config;
    this.onMessage = onMessage;
  }

  async start(): Promise<void> {
    // Ensure session directory exists
    const authDir = join(this.config.sessionDir, "whatsapp-auth");
    mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[whatsapp] Connecting with Baileys v${version.join(".")}...`);

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as any),
      },
      printQRInTerminal: true,
      logger: logger as any,
      generateHighQualityLinkPreview: false,
    });

    // Save credentials on update
    this.sock.ev.on("creds.update", saveCreds);

    // Connection state
    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`[whatsapp] QR code displayed — scan with WhatsApp`);
      }

      if (connection === "close") {
        this.connected = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log(`[whatsapp] Reconnecting... (status: ${statusCode})`);
          // Reconnect after brief delay
          setTimeout(() => this.start(), 3000);
        } else {
          console.log(`[whatsapp] Logged out. Delete session and restart to re-authenticate.`);
        }
      }

      if (connection === "open") {
        this.connected = true;
        console.log(`[whatsapp] Connected successfully`);
      }
    });

    // Message handler
    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        // Skip own messages
        if (msg.key.fromMe) continue;

        // Dedup
        const msgId = msg.key.id;
        if (!msgId || this.processedIds.has(msgId)) continue;
        this.processedIds.add(msgId);

        // Cleanup old IDs periodically
        if (this.processedIds.size > 1000) {
          const arr = [...this.processedIds];
          this.processedIds = new Set(arr.slice(-500));
        }

        await this.handleIncoming(msg);
      }
    });
  }

  async stop(): Promise<void> {
    this.connected = false;
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }

  async send(chatId: string, reply: OutboundReply): Promise<void> {
    if (!this.sock) return;

    try {
      // WhatsApp doesn't support markdown natively — strip it
      const text = this.stripMarkdown(reply.text);

      await this.sock.sendMessage(chatId, {
        text,
        ...(reply.replyToId ? {
          quoted: {
            key: {
              remoteJid: chatId,
              id: reply.replyToId,
            },
            message: {},
          } as any,
        } : {}),
      });
    } catch (err) {
      console.error(`[whatsapp] Send failed:`, err);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── INTERNAL ─────────────────────────────────────────────

  private async handleIncoming(msg: any): Promise<void> {
    const jid = msg.key.remoteJid;
    if (!jid) return;

    // Extract text from various message types
    const text =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      msg.message?.imageMessage?.caption ??
      msg.message?.videoMessage?.caption ??
      msg.message?.documentMessage?.caption ??
      "";

    if (!text.trim()) return;

    // Determine if group
    const isGroup = jid.endsWith("@g.us");

    // In groups, only respond when @mentioned
    if (isGroup) {
      const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
      const isMentioned = mentions.some((m: string) => m === this.sock?.user?.id);
      if (!isMentioned && !text.toLowerCase().includes("foreman")) return;
    }

    // Extract sender info
    const senderId = msg.key.participant ?? jid;
    const pushName = msg.pushName ?? senderId.split("@")[0];

    const inbound: InboundMessage = {
      id: msg.key.id ?? "",
      channel: "whatsapp",
      senderId: senderId.split("@")[0], // Just the number
      senderName: pushName,
      text: text.trim(),
      chatId: jid,
      isGroup,
      timestamp: new Date((msg.messageTimestamp ?? 0) * 1000),
      replyToId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
    };

    // Typing indicator
    try {
      await this.sock?.presenceSubscribe(jid);
      await this.sock?.sendPresenceUpdate("composing", jid);
    } catch { /* best-effort */ }

    // Process
    const reply = await this.onMessage(inbound);

    // Clear typing
    try {
      await this.sock?.sendPresenceUpdate("paused", jid);
    } catch { /* best-effort */ }

    if (reply) {
      await this.send(jid, {
        ...reply,
        replyToId: msg.key.id,
      });
    }
  }

  /**
   * Strip markdown formatting for WhatsApp (uses its own formatting).
   * Converts: **bold** → *bold*, `code` → ```code```, etc.
   */
  private stripMarkdown(text: string): string {
    return text
      // **bold** → *bold* (WhatsApp style)
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // `inline code` → stays as `code` (WhatsApp supports this)
      // ```code blocks``` → stays (WhatsApp supports this)
      // [link](url) → url
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$2")
      // # Headers → *Header* (bold)
      .replace(/^#{1,3}\s+(.+)$/gm, "*$1*");
  }
}
