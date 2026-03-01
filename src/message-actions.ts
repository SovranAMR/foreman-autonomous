/**
 * FOREMAN — Message Actions Engine
 *
 * Rich messaging actions for Telegram/WhatsApp channels.
 * Transplanted from OpenClaw's message-tool and channel actions.
 *
 * Capabilities:
 * - Reactions (emoji react to messages)
 * - Message editing (update sent messages)
 * - Message deletion
 * - Polls (Telegram native polls)
 * - File/photo sending
 * - Reply threading
 * - Forward messages
 * - Voice messages (with audio file)
 * - Inline keyboards (Telegram buttons)
 */

import type { Channel, OutboundReply } from "./channel.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface MessageAction {
  type: "react" | "edit" | "delete" | "poll" | "send_file" | "send_photo" | "forward" | "pin" | "unpin";
  chatId: string;
  messageId?: string;
}

export interface ReactAction extends MessageAction {
  type: "react";
  emoji: string;
}

export interface EditAction extends MessageAction {
  type: "edit";
  newText: string;
  parseMode?: "markdown" | "html" | "plain";
}

export interface DeleteAction extends MessageAction {
  type: "delete";
}

export interface PollAction extends MessageAction {
  type: "poll";
  question: string;
  options: string[];
  isAnonymous?: boolean;
  allowsMultipleAnswers?: boolean;
}

export interface SendFileAction extends MessageAction {
  type: "send_file";
  filePath: string;
  caption?: string;
}

export interface SendPhotoAction extends MessageAction {
  type: "send_photo";
  filePath: string;
  caption?: string;
}

export interface ForwardAction extends MessageAction {
  type: "forward";
  toChatId: string;
}

export type AnyAction = ReactAction | EditAction | DeleteAction | PollAction | SendFileAction | SendPhotoAction | ForwardAction | MessageAction;

export interface ActionResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── TELEGRAM ACTIONS ────────────────────────────────────────

export class TelegramActions {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async apiCall(method: string, body: Record<string, unknown>): Promise<ActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json() as { ok: boolean; result?: { message_id?: number }; description?: string };

      if (!data.ok) {
        return { success: false, error: data.description ?? "API call failed" };
      }

      return {
        success: true,
        messageId: data.result?.message_id?.toString(),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** React to a message with emoji */
  async react(chatId: string, messageId: string, emoji: string): Promise<ActionResult> {
    return this.apiCall("setMessageReaction", {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
      reaction: [{ type: "emoji", emoji }],
    });
  }

  /** Edit a sent message */
  async editMessage(chatId: string, messageId: string, text: string, parseMode?: string): Promise<ActionResult> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
      text,
    };
    if (parseMode && parseMode !== "plain") body.parse_mode = parseMode === "markdown" ? "MarkdownV2" : "HTML";

    return this.apiCall("editMessageText", body);
  }

  /** Delete a message */
  async deleteMessage(chatId: string, messageId: string): Promise<ActionResult> {
    return this.apiCall("deleteMessage", {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
    });
  }

  /** Send a poll */
  async sendPoll(
    chatId: string,
    question: string,
    options: string[],
    isAnonymous = true,
    allowsMultiple = false,
  ): Promise<ActionResult> {
    return this.apiCall("sendPoll", {
      chat_id: chatId,
      question,
      options: options.map(o => ({ text: o })),
      is_anonymous: isAnonymous,
      allows_multiple_answers: allowsMultiple,
    });
  }

  /** Send a photo */
  async sendPhoto(chatId: string, photoUrl: string, caption?: string, replyTo?: string): Promise<ActionResult> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoUrl,
    };
    if (caption) body.caption = caption;
    if (replyTo) body.reply_to_message_id = parseInt(replyTo, 10);

    return this.apiCall("sendPhoto", body);
  }

  /** Send a document/file */
  async sendDocument(chatId: string, documentUrl: string, caption?: string): Promise<ActionResult> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      document: documentUrl,
    };
    if (caption) body.caption = caption;

    return this.apiCall("sendDocument", body);
  }

  /** Forward a message */
  async forwardMessage(chatId: string, fromChatId: string, messageId: string): Promise<ActionResult> {
    return this.apiCall("forwardMessage", {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: parseInt(messageId, 10),
    });
  }

  /** Pin a message */
  async pinMessage(chatId: string, messageId: string, silent = true): Promise<ActionResult> {
    return this.apiCall("pinChatMessage", {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
      disable_notification: silent,
    });
  }

  /** Unpin a message */
  async unpinMessage(chatId: string, messageId?: string): Promise<ActionResult> {
    const body: Record<string, unknown> = { chat_id: chatId };
    if (messageId) body.message_id = parseInt(messageId, 10);
    return this.apiCall("unpinChatMessage", body);
  }

  /** Send message with inline keyboard */
  async sendWithButtons(
    chatId: string,
    text: string,
    buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>>,
    parseMode?: string,
  ): Promise<ActionResult> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: buttons },
    };
    if (parseMode && parseMode !== "plain") body.parse_mode = parseMode === "markdown" ? "MarkdownV2" : "HTML";

    return this.apiCall("sendMessage", body);
  }

  /** Get bot info */
  async getMe(): Promise<{ id: number; username: string; firstName: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      const data = await response.json() as { ok: boolean; result?: { id: number; username: string; first_name: string } };
      if (!data.ok || !data.result) return null;
      return { id: data.result.id, username: data.result.username, firstName: data.result.first_name };
    } catch {
      return null;
    }
  }
}

// ─── MESSAGE ACTIONS ENGINE ──────────────────────────────────

export class MessageActionsEngine {
  private telegramActions: TelegramActions | null = null;

  constructor(telegramToken?: string) {
    if (telegramToken) {
      this.telegramActions = new TelegramActions(telegramToken);
    }
  }

  /** Set Telegram token (for deferred initialization) */
  setTelegramToken(token: string): void {
    this.telegramActions = new TelegramActions(token);
  }

  /** Execute an action */
  async execute(action: AnyAction, channel: "telegram" | "whatsapp" = "telegram"): Promise<ActionResult> {
    if (channel === "telegram" && this.telegramActions) {
      return this.executeTelegram(action);
    }
    return { success: false, error: `No ${channel} actions provider configured` };
  }

  private async executeTelegram(action: AnyAction): Promise<ActionResult> {
    if (!this.telegramActions) return { success: false, error: "Telegram not configured" };

    switch (action.type) {
      case "react": {
        const a = action as ReactAction;
        return this.telegramActions.react(a.chatId, a.messageId!, a.emoji);
      }
      case "edit": {
        const a = action as EditAction;
        return this.telegramActions.editMessage(a.chatId, a.messageId!, a.newText, a.parseMode);
      }
      case "delete": {
        const a = action as DeleteAction;
        return this.telegramActions.deleteMessage(a.chatId, a.messageId!);
      }
      case "poll": {
        const a = action as PollAction;
        return this.telegramActions.sendPoll(a.chatId, a.question, a.options, a.isAnonymous, a.allowsMultipleAnswers);
      }
      case "send_photo": {
        const a = action as SendPhotoAction;
        return this.telegramActions.sendPhoto(a.chatId, a.filePath, a.caption);
      }
      case "send_file": {
        const a = action as SendFileAction;
        return this.telegramActions.sendDocument(a.chatId, a.filePath, a.caption);
      }
      case "forward": {
        const a = action as ForwardAction;
        return this.telegramActions.forwardMessage(a.toChatId, a.chatId, a.messageId!);
      }
      case "pin":
        return this.telegramActions.pinMessage(action.chatId, action.messageId!);
      case "unpin":
        return this.telegramActions.unpinMessage(action.chatId, action.messageId);
      default:
        return { success: false, error: `Unknown action type: ${(action as any).type}` };
    }
  }

  /** Convenience: React with emoji */
  async react(chatId: string, messageId: string, emoji: string): Promise<ActionResult> {
    return this.execute({ type: "react", chatId, messageId, emoji } as ReactAction, "telegram");
  }

  /** Convenience: Edit message */
  async edit(chatId: string, messageId: string, newText: string): Promise<ActionResult> {
    return this.execute({ type: "edit", chatId, messageId, newText } as EditAction, "telegram");
  }

  /** Convenience: Delete message */
  async deleteMsg(chatId: string, messageId: string): Promise<ActionResult> {
    return this.execute({ type: "delete", chatId, messageId } as DeleteAction, "telegram");
  }

  /** Convenience: Create poll */
  async poll(chatId: string, question: string, options: string[]): Promise<ActionResult> {
    return this.execute({ type: "poll", chatId, question, options } as PollAction, "telegram");
  }

  /** Convenience: Send with inline buttons */
  async sendButtons(
    chatId: string,
    text: string,
    buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>>,
  ): Promise<ActionResult> {
    if (!this.telegramActions) return { success: false, error: "Telegram not configured" };
    return this.telegramActions.sendWithButtons(chatId, text, buttons);
  }

  /** Get Telegram actions (for advanced use) */
  getTelegramActions(): TelegramActions | null {
    return this.telegramActions;
  }
}
