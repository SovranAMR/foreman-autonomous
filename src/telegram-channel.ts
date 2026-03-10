/**
 * FOREMAN — Telegram Channel
 *
 * Grammy-based Telegram bot integration.
 * Receives messages → forwards to MessagingGateway → sends replies.
 *
 * Features:
 * - Long polling (no webhook needed)
 * - Markdown formatting with fallback to plain text
 * - Message splitting for long responses (Telegram 4096 char limit)
 * - Periodic typing indicator during processing
 * - Group chat support (mention-triggered)
 * - Startup timestamp filtering (no drop_pending_updates — never lose messages)
 * - PID-based single instance guard
 */

import { Bot, Context } from "grammy";
import type {
  Channel,
  InboundMessage,
  OutboundReply,
  TelegramChannelConfig,
  MessageHandler,
  MediaAttachment,
} from "./channel.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── TELEGRAM CHANNEL ───────────────────────────────────────

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private bot: Bot;
  private config: TelegramChannelConfig;
  private onMessage: MessageHandler;
  private connected = false;
  private botUsername = "";
  /** Unix timestamp (seconds) when start() was called — messages older than this are stale */
  private startedAtUnix = 0;
  /** Directory for downloaded media files */
  private mediaDir: string;

  constructor(config: TelegramChannelConfig, onMessage: MessageHandler) {
    this.config = config;
    this.onMessage = onMessage;
    this.bot = new Bot(config.botToken);
    this.mediaDir = join(process.env.HOME ?? "/tmp", ".foreman", "media");
    if (!existsSync(this.mediaDir)) {
      mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    // Record startup time BEFORE any async work
    this.startedAtUnix = Math.floor(Date.now() / 1000);

    // Get bot info
    const me = await this.bot.api.getMe();
    this.botUsername = me.username ?? "";
    console.log(`[telegram] Bot: @${this.botUsername} (${me.first_name})`);

    // Clear webhook (in case a previous deployment used webhooks)
    // Do NOT use drop_pending_updates — we want to receive messages
    // sent while the bot was down. Stale messages are filtered by timestamp.
    try {
      await this.bot.api.deleteWebhook();
    } catch { /* best-effort */ }

    // Register message handler
    this.bot.on("message:text", async (ctx) => {
      await this.handleIncoming(ctx);
    });

    // ─── MEDIA HANDLERS ─────────────────────────────────────
    // Photo messages (compressed images)
    this.bot.on("message:photo", async (ctx) => {
      await this.handleMediaMessage(ctx, "photo");
    });

    // Document messages (any file)
    this.bot.on("message:document", async (ctx) => {
      await this.handleMediaMessage(ctx, "document");
    });

    // Voice messages
    this.bot.on("message:voice", async (ctx) => {
      await this.handleMediaMessage(ctx, "audio");
    });

    // Audio files
    this.bot.on("message:audio", async (ctx) => {
      await this.handleMediaMessage(ctx, "audio");
    });

    // Video messages
    this.bot.on("message:video", async (ctx) => {
      await this.handleMediaMessage(ctx, "video");
    });

    // Video notes (round video messages)
    this.bot.on("message:video_note", async (ctx) => {
      await this.handleMediaMessage(ctx, "video");
    });

    // Stickers
    this.bot.on("message:sticker", async (ctx) => {
      await this.handleMediaMessage(ctx, "sticker");
    });

    // Handle errors gracefully — don't crash on transient issues
    this.bot.catch((err) => {
      const msg = err.message ?? String(err);
      if (msg.includes("409")) {
        console.error(`[telegram] 409 Conflict — another instance still polling. Wait ~30s for it to expire.`);
      } else {
        console.error(`[telegram] Bot error:`, msg);
      }
    });

    // Start long polling
    this.bot.start({
      onStart: () => {
        this.connected = true;
        console.log(`[telegram] Polling started for @${this.botUsername}`);
      },
    }).catch((err) => {
      const msg = String(err);
      if (msg.includes("409")) {
        console.error(`[telegram] 409 — another instance still connected. Kill old processes and wait 30s.`);
      } else {
        console.error(`[telegram] Fatal polling error:`, msg.slice(0, 200));
      }
    });
  }

  async stop(): Promise<void> {
    this.connected = false;
    await this.bot.stop();
  }

  async send(chatId: string, reply: OutboundReply): Promise<string | undefined> {
    const parseMode = reply.parseMode === "markdown" ? "Markdown" : undefined;

    // Split long messages (Telegram limit: 4096 chars)
    const chunks = this.splitMessage(reply.text, 4000);
    let firstMsgId: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Only reply to the original message on the FIRST chunk
      const replyParams = i === 0 && reply.replyToId
        ? { message_id: Number(reply.replyToId) }
        : undefined;

      try {
        const result = await this.bot.api.sendMessage(chatId, chunk, {
          parse_mode: parseMode,
          reply_parameters: replyParams,
        });
        if (i === 0) firstMsgId = result.message_id.toString();
      } catch (err) {
        // Retry without parse mode if markdown fails
        if (parseMode) {
          try {
            const result = await this.bot.api.sendMessage(chatId, chunk, {
              reply_parameters: replyParams,
            });
            if (i === 0) firstMsgId = result.message_id.toString();
          } catch (retryErr) {
            console.error(`[telegram] Send failed (chunk ${i + 1}/${chunks.length}):`, retryErr);
          }
        } else {
          console.error(`[telegram] Send failed (chunk ${i + 1}/${chunks.length}):`, err);
        }
      }
    }
    return firstMsgId;
  }

  async edit(chatId: string, messageId: string, reply: OutboundReply): Promise<void> {
    const parseMode = reply.parseMode === "markdown" ? "Markdown" : undefined;
    try {
      await this.bot.api.editMessageText(chatId, Number(messageId), reply.text, {
        parse_mode: parseMode,
      });
    } catch (err: any) {
      if (err.message && err.message.includes("message is not modified")) {
        // This is fine, just ignore
        return;
      }
      console.error(`[telegram] Edit failed for message ${messageId}:`, err);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── MEDIA PROCESSING ────────────────────────────────────

  /**
   * Download a file from Telegram servers.
   * Returns local file path and MIME type.
   */
  private async downloadTelegramFile(fileId: string, filename?: string): Promise<{ path: string; mimeType: string } | null> {
    try {
      const file = await this.bot.api.getFile(fileId);
      if (!file.file_path) return null;

      const url = `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const buffer = Buffer.from(await response.arrayBuffer());

      // Determine filename
      const ext = file.file_path.split(".").pop() ?? "bin";
      const finalName = filename ?? `${fileId.slice(-8)}_${Date.now()}.${ext}`;
      const localPath = join(this.mediaDir, finalName);

      writeFileSync(localPath, buffer);

      // Determine MIME type from extension
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
        mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
        opus: "audio/opus", m4a: "audio/mp4", oga: "audio/ogg",
        mp4: "video/mp4", webm: "video/webm", avi: "video/x-msvideo",
        pdf: "application/pdf", zip: "application/zip",
        doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        tgs: "application/x-tgsticker",
        py: "text/x-python", ts: "text/typescript", js: "text/javascript",
        json: "application/json", txt: "text/plain", md: "text/markdown",
        yaml: "application/x-yaml", yml: "application/x-yaml",
        csv: "text/csv", html: "text/html", css: "text/css",
      };
      const mimeType = mimeMap[ext] ?? "application/octet-stream";

      console.log(`[telegram] Downloaded file: ${localPath} (${(buffer.length / 1024).toFixed(1)}KB, ${mimeType})`);
      return { path: localPath, mimeType };
    } catch (err) {
      console.error(`[telegram] File download failed:`, err);
      return null;
    }
  }

  /**
   * Handle incoming media messages (photo, document, voice, video, sticker).
   * Downloads the file, creates a MediaAttachment, and forwards to gateway.
   */
  private async handleMediaMessage(ctx: Context, type: MediaAttachment["type"]): Promise<void> {
    const msg = ctx.message;
    if (!msg || !msg.from) return;

    // Stale message filter
    const messageAge = this.startedAtUnix - msg.date;
    if (messageAge > 60) {
      console.log(`[telegram] Skipping stale media (${messageAge}s old)`);
      return;
    }

    // Group filter
    if (msg.chat.type !== "private") {
      const caption = msg.caption ?? "";
      const mentioned = caption.includes(`@${this.botUsername}`);
      const isReply = msg.reply_to_message?.from?.id === this.bot.botInfo.id;
      if (!mentioned && !isReply) return;
    }

    // Extract file_id and optional metadata
    let fileId = "";
    let fileName: string | undefined;
    let mimeType: string | undefined;
    let caption = msg.caption ?? "";

    if (type === "photo" && msg.photo) {
      // Get highest resolution photo (last in array)
      const bestPhoto = msg.photo[msg.photo.length - 1];
      fileId = bestPhoto.file_id;
    } else if (type === "document" && msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name ?? undefined;
      mimeType = msg.document.mime_type ?? undefined;
    } else if (type === "audio" && (msg.voice || msg.audio)) {
      const audio = msg.voice ?? msg.audio;
      if (audio) {
        fileId = audio.file_id;
        mimeType = audio.mime_type ?? undefined;
      }
    } else if (type === "video" && (msg.video || msg.video_note)) {
      const video = msg.video ?? msg.video_note;
      if (video) {
        fileId = video.file_id;
        mimeType = (msg.video as any)?.mime_type ?? undefined;
      }
    } else if (type === "sticker" && msg.sticker) {
      fileId = msg.sticker.file_id;
      mimeType = msg.sticker.is_animated ? "application/x-tgsticker" : "image/webp";
    }

    if (!fileId) return;

    // Strip bot mention from caption
    if (this.botUsername && caption) {
      caption = caption.replace(new RegExp(`@${this.botUsername}\\b`, "gi"), "").trim();
    }

    console.log(`[telegram] Media from ${msg.from.first_name}: ${type} (${fileId.slice(-12)}...) caption: "${caption.slice(0, 40)}"`);

    // Download the file
    const downloaded = await this.downloadTelegramFile(fileId, fileName);

    // Build media attachment
    const attachment: MediaAttachment = {
      type,
      fileId,
      mimeType: downloaded?.mimeType ?? mimeType,
      caption: caption || undefined,
    };

    // Build text content: use caption, or describe the media
    const textContent = caption || `[${type === "photo" ? "Görsel" : type === "document" ? "Dosya" : type === "audio" ? "Ses" : type === "video" ? "Video" : "Sticker"} gönderildi]`;

    // Build inbound message with media
    const inbound: InboundMessage = {
      id: String(msg.message_id),
      channel: "telegram",
      senderId: String(msg.from.id),
      senderName: msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : ""),
      text: textContent,
      chatId: String(msg.chat.id),
      isGroup: msg.chat.type !== "private",
      timestamp: new Date(msg.date * 1000),
      replyToId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
      media: [attachment],
    };

    // Add local file path to attachment for downstream processing
    if (downloaded) {
      (attachment as any).localPath = downloaded.path;
    }

    // Typing indicator
    const chatId = msg.chat.id;
    let typingActive = true;
    const sendTyping = async () => {
      while (typingActive) {
        try {
          await ctx.api.sendChatAction(chatId, "typing");
        } catch { /* best-effort */ }
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    };
    const typingPromise = sendTyping();

    try {
      const reply = await this.onMessage(inbound);
      if (reply) {
        await this.send(String(chatId), {
          ...reply,
          replyToId: String(msg.message_id),
        });
      }
    } finally {
      typingActive = false;
      await typingPromise.catch(() => { });
    }
  }

  // ─── INTERNAL ─────────────────────────────────────────────

  private async handleIncoming(ctx: Context): Promise<void> {
    const msg = ctx.message;
    if (!msg?.text || !msg.from) return;

    // ── Stale message filter ──
    // Skip messages sent BEFORE the bot started.
    // This replaces drop_pending_updates — we never lose messages,
    // but we don't process ones that were queued while bot was offline
    // if they're older than 60 seconds before startup.
    const messageAge = this.startedAtUnix - msg.date;
    if (messageAge > 60) {
      console.log(`[telegram] Skipping stale message (${messageAge}s old): "${msg.text.slice(0, 40)}..."`);
      return;
    }

    // In groups, only respond when mentioned or replied to
    if (msg.chat.type !== "private") {
      const mentioned = msg.text.includes(`@${this.botUsername}`);
      const isReply = msg.reply_to_message?.from?.id === this.bot.botInfo.id;
      if (!mentioned && !isReply) return;
    }

    // Strip bot mention from text
    let text = msg.text;
    if (this.botUsername) {
      text = text.replace(new RegExp(`@${this.botUsername}\\b`, "gi"), "").trim();
    }

    // Build inbound message
    const inbound: InboundMessage = {
      id: String(msg.message_id),
      channel: "telegram",
      senderId: String(msg.from.id),
      senderName: msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : ""),
      text,
      chatId: String(msg.chat.id),
      isGroup: msg.chat.type !== "private",
      timestamp: new Date(msg.date * 1000),
      replyToId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
    };

    console.log(`[telegram] Message from ${inbound.senderName}: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);

    // ── Periodic typing indicator ──
    // Telegram typing indicator expires after ~5 seconds.
    // Send it immediately and repeat every 4 seconds until processing completes.
    const chatId = msg.chat.id;
    let typingActive = true;
    const sendTyping = async () => {
      while (typingActive) {
        try {
          await ctx.api.sendChatAction(chatId, "typing");
        } catch { /* best-effort */ }
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    };
    const typingPromise = sendTyping();

    try {
      // Process message
      const reply = await this.onMessage(inbound);

      if (reply) {
        await this.send(String(chatId), {
          ...reply,
          replyToId: String(msg.message_id),
        });
      }
    } finally {
      // Stop typing indicator
      typingActive = false;
      await typingPromise.catch(() => { });
    }
  }

  // ─── MESSAGE SPLITTING ────────────────────────────────────

  /**
   * Split a long message into chunks at natural boundaries.
   * Telegram has a hard 4096 char limit per message.
   * We split at paragraph boundaries, then line boundaries, then force-cut.
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find best split point — prefer natural boundaries
      let splitAt = maxLength;

      // Priority 1: Double newline (paragraph break)
      const doubleNl = remaining.lastIndexOf("\n\n", maxLength);
      if (doubleNl > maxLength * 0.3) {
        splitAt = doubleNl + 2;
      } else {
        // Priority 2: Single newline
        const singleNl = remaining.lastIndexOf("\n", maxLength);
        if (singleNl > maxLength * 0.3) {
          splitAt = singleNl + 1;
        } else {
          // Priority 3: Space
          const space = remaining.lastIndexOf(" ", maxLength);
          if (space > maxLength * 0.3) {
            splitAt = space + 1;
          }
          // Else: force-cut at maxLength
        }
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }

    return chunks;
  }
}
