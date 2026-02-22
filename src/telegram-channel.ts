/**
 * FOREMAN — Telegram Channel
 *
 * Grammy-based Telegram bot integration.
 * Receives messages → forwards to MessagingGateway → sends replies.
 *
 * Features:
 * - Long polling (no webhook needed)
 * - Markdown formatting
 * - Message splitting for long responses
 * - Typing indicator during processing
 * - Group chat support (mention-triggered)
 */

import { Bot, Context } from "grammy";
import type {
  Channel,
  InboundMessage,
  OutboundReply,
  TelegramChannelConfig,
  MessageHandler,
} from "./channel.js";

// ─── TELEGRAM CHANNEL ───────────────────────────────────────

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private bot: Bot;
  private config: TelegramChannelConfig;
  private onMessage: MessageHandler;
  private connected = false;
  private botUsername = "";

  constructor(config: TelegramChannelConfig, onMessage: MessageHandler) {
    this.config = config;
    this.onMessage = onMessage;
    this.bot = new Bot(config.botToken);
  }

  async start(): Promise<void> {
    // Get bot info
    const me = await this.bot.api.getMe();
    this.botUsername = me.username ?? "";
    console.log(`[telegram] Bot: @${this.botUsername} (${me.first_name})`);

    // Register message handler
    this.bot.on("message:text", async (ctx) => {
      await this.handleIncoming(ctx);
    });

    // Handle errors gracefully
    this.bot.catch((err) => {
      console.error(`[telegram] Bot error:`, err.message ?? err);
    });

    // Start long polling
    this.bot.start({
      onStart: () => {
        this.connected = true;
        console.log(`[telegram] Polling started for @${this.botUsername}`);
      },
    });
  }

  async stop(): Promise<void> {
    this.connected = false;
    await this.bot.stop();
  }

  async send(chatId: string, reply: OutboundReply): Promise<void> {
    const parseMode = reply.parseMode === "markdown" ? "Markdown" : undefined;

    // Split long messages (Telegram limit: 4096 chars)
    const chunks = this.splitMessage(reply.text, 4000);

    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, {
          parse_mode: parseMode,
          reply_parameters: reply.replyToId
            ? { message_id: Number(reply.replyToId) }
            : undefined,
        });
      } catch (err) {
        // Retry without parse mode if markdown fails
        if (parseMode) {
          try {
            await this.bot.api.sendMessage(chatId, chunk, {
              reply_parameters: reply.replyToId
                ? { message_id: Number(reply.replyToId) }
                : undefined,
            });
          } catch (retryErr) {
            console.error(`[telegram] Send failed:`, retryErr);
          }
        } else {
          console.error(`[telegram] Send failed:`, err);
        }
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── INTERNAL ─────────────────────────────────────────────

  private async handleIncoming(ctx: Context): Promise<void> {
    const msg = ctx.message;
    if (!msg?.text || !msg.from) return;

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

    // Show typing indicator
    try {
      await ctx.api.sendChatAction(msg.chat.id, "typing");
    } catch { /* typing indicator is best-effort */ }

    // Process message
    const reply = await this.onMessage(inbound);

    if (reply) {
      await this.send(String(msg.chat.id), {
        ...reply,
        replyToId: String(msg.message_id),
      });
    }
  }

  /**
   * Split a long message into chunks at natural boundaries.
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

      // Find best split point
      let splitAt = maxLength;

      // Try to split at double newline (paragraph)
      const doubleNl = remaining.lastIndexOf("\n\n", maxLength);
      if (doubleNl > maxLength * 0.3) {
        splitAt = doubleNl + 2;
      } else {
        // Try single newline
        const singleNl = remaining.lastIndexOf("\n", maxLength);
        if (singleNl > maxLength * 0.3) {
          splitAt = singleNl + 1;
        }
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }

    return chunks;
  }
}
