/**
 * FOREMAN — Messaging Gateway
 *
 * Central hub that connects messaging channels to the Foreman engine.
 * Receives messages → processes through Engine → returns replies.
 *
 * Architecture:
 *   Channel (Telegram/WhatsApp) → Gateway → Engine → LLM → Response → Channel
 *
 * Features:
 * - Multi-channel support (Telegram + WhatsApp simultaneously)
 * - Sender allowlisting (security)
 * - Conversation context per chat
 * - Tool execution through Engine
 * - Rate limiting per sender
 * - Graceful shutdown
 */

import type {
  Channel,
  ChannelType,
  ChannelConfig,
  GatewayConfig,
  InboundMessage,
  OutboundReply,
  TelegramChannelConfig,
  WhatsAppChannelConfig,
} from "./channel.js";
import { Engine } from "./engine.js";
import { Orchestrator } from "./orchestrator.js";
import { AntigravityProvider, loadCredentials, getChatModels } from "./antigravity-provider.js";
import { DEFAULT_KIMI_MODEL } from "./kimi-provider.js";
import type { LLMProvider } from "./provider.js";
import { createEngineToolExecutor, TOOL_DEFINITIONS } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";
import { EditEngine } from "./edit-engine.js";
import { GitEngine } from "./git-engine.js";
import { LinkIntelligence } from "./link-intelligence.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ─── CONVERSATION STATE ──────────────────────────────────────

interface ConversationState {
  chatId: string;
  channel: ChannelType;
  messages: Array<{ role: string; content: string }>;
  lastActivity: number;
  totalTokens: number;
  senderName: string;
}

// ─── GATEWAY ─────────────────────────────────────────────────

export class MessagingGateway {
  private config: GatewayConfig;
  private channels: Map<ChannelType, Channel> = new Map();
  private conversations: Map<string, ConversationState> = new Map();
  private engine: Engine;
  private orchestrator: Orchestrator | null = null;
  private provider: LLMProvider | null = null;
  private toolExecutor: ((call: ToolCall) => Promise<ToolResult>) | null = null;
  private processing: Set<string> = new Set(); // active chat IDs
  private messageQueue: Map<string, InboundMessage[]> = new Map(); // queued messages per chat
  private running = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Conversation limits
  private readonly MAX_HISTORY = 50;
  private readonly CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h idle = reset
  private readonly CONVERSATIONS_DIR: string;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.engine = new Engine({
      projectRoot: config.projectRoot,
      projectName: config.projectName,
    });
    this.orchestrator = new Orchestrator(this.engine);
    this.CONVERSATIONS_DIR = join(config.projectRoot, ".foreman", "conversations");

    // Load persisted conversations from disk
    this.loadConversations();
  }

  // ─── LIFECYCLE ────────────────────────────────────────────

  /**
   * Start the gateway and all configured channels.
   */
  async start(): Promise<void> {
    console.log(`[gateway] Starting Foreman Messaging Gateway...`);

    // Initialize provider — prefer Kimi, fallback to Antigravity
    const { KimiProvider, loadKimiKey } = await import("./kimi-provider.js");
    const kimiKey = loadKimiKey();
    if (kimiKey) {
      this.provider = new KimiProvider(kimiKey);
      console.log(`[gateway] Using Kimi provider`);
    } else {
      const creds = loadCredentials();
      if (!creds) {
        throw new Error("No API credentials. Set Kimi key or run: foreman login");
      }
      this.provider = new AntigravityProvider(creds);
      console.log(`[gateway] Using Antigravity provider`);
    }

    // Initialize tool executor with Engine subsystems
    const execEngine = new ExecutionEngine(this.config.projectRoot);
    const editEngine = new EditEngine();
    const gitEngine = new GitEngine(execEngine);
    const linkIntel = new LinkIntelligence();
    this.toolExecutor = createEngineToolExecutor(
      this.config.projectRoot,
      execEngine,
      editEngine,
      gitEngine,
      linkIntel,
      undefined, // No hooks engine in standalone mode
    );

    // Start configured channels
    for (const channelConfig of this.config.channels) {
      if (!channelConfig.enabled) continue;

      try {
        const channel = await this.createChannel(channelConfig);
        this.channels.set(channelConfig.type, channel);
        await channel.start();
        console.log(`[gateway] Channel started: ${channelConfig.type}`);
      } catch (err) {
        console.error(`[gateway] Failed to start ${channelConfig.type}:`, err);
      }
    }

    this.running = true;

    // Periodic cleanup of stale conversations
    this.startCleanupTimer();

    console.log(`[gateway] Gateway running — ${this.channels.size} channel(s) active`);
  }

  /**
   * Stop gateway and all channels gracefully.
   */
  async stop(): Promise<void> {
    console.log(`[gateway] Shutting down...`);
    this.running = false;

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Stop all channels
    for (const [type, channel] of this.channels) {
      try {
        await channel.stop();
        console.log(`[gateway] Channel stopped: ${type}`);
      } catch (err) {
        console.error(`[gateway] Error stopping ${type}:`, err);
      }
    }
    this.channels.clear();

    // Shutdown engine
    await this.engine.shutdown();
    console.log(`[gateway] Gateway stopped.`);
  }

  // ─── MESSAGE PROCESSING ───────────────────────────────────

  /**
   * Handle an inbound message from any channel.
   * This is the core message processing pipeline.
   */
  async handleMessage(message: InboundMessage): Promise<OutboundReply | null> {
    // Security: check sender allowlist
    const channelConfig = this.config.channels.find(c => c.type === message.channel);
    if (channelConfig?.allowedSenders.length) {
      if (!channelConfig.allowedSenders.includes(message.senderId)) {
        console.log(`[gateway] Blocked message from unauthorized sender: ${message.senderId} (${message.senderName})`);
        return null;
      }
    }

    // Skip empty messages
    if (!message.text.trim()) return null;

    // Concurrency guard — one message per chat at a time, others queued
    const chatKey = `${message.channel}:${message.chatId}`;
    if (this.processing.has(chatKey)) {
      // Queue the message — it'll be processed after current finishes
      const queue = this.messageQueue.get(chatKey) ?? [];
      if (queue.length < 5) { // Cap queue at 5 to prevent flooding
        queue.push(message);
        this.messageQueue.set(chatKey, queue);
      }
      return { text: "⏳ Processing previous message... yours is queued." };
    }

    this.processing.add(chatKey);

    try {
      // Handle slash commands
      const cmdResult = await this.handleCommand(message);
      if (cmdResult) return cmdResult;

      // Get or create conversation
      const conversation = this.getConversation(chatKey, message);

      // Add user message
      conversation.messages.push({
        role: "user",
        content: message.text,
      });

      // Trim history
      this.trimConversation(conversation);

      // Process through LLM
      const reply = await this.processWithLLM(conversation);

      // Add assistant response to history
      if (reply) {
        conversation.messages.push({
          role: "assistant",
          content: reply.text,
        });
        conversation.lastActivity = Date.now();
      }

      // Persist conversation to disk (survives restarts)
      this.persistConversation(chatKey);

      return reply;
    } catch (err) {
      console.error(`[gateway] Error processing message from ${message.senderName}:`, err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { text: `❌ Error: ${errorMsg.slice(0, 200)}` };
    } finally {
      this.processing.delete(chatKey);

      // Process queued message if any
      const queue = this.messageQueue.get(chatKey);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        if (queue.length === 0) this.messageQueue.delete(chatKey);
        // Process async — don't block the return
        this.handleMessage(next).catch(err => {
          console.error(`[gateway] Queued message processing failed:`, err);
        });
      }
    }
  }

  // ─── SLASH COMMANDS ───────────────────────────────────────

  private async handleCommand(message: InboundMessage): Promise<OutboundReply | null> {
    const text = message.text.trim();

    if (text === "/status" || text === "/durum") {
      const convCount = this.conversations.size;
      const channelCount = this.channels.size;
      const models = getChatModels();
      return {
        text: [
          "🔥 **Foreman Status**",
          `├ Channels: ${channelCount} active`,
          `├ Conversations: ${convCount}`,
          `├ Models: ${models.length} available`,
          `├ Tools: ${TOOL_DEFINITIONS.length}`,
          `└ Project: ${this.config.projectName}`,
        ].join("\n"),
        parseMode: "markdown",
      };
    }

    if (text === "/clear" || text === "/temizle" || text === "/reset") {
      const chatKey = `${message.channel}:${message.chatId}`;
      this.conversations.delete(chatKey);
      this.deleteConversationFile(chatKey);
      return { text: "🗑️ Conversation cleared. Sıfırdan başlıyoruz." };
    }

    // Natural language reset/clear detection
    const resetPatterns = /^(hard\s*reset|sıfırla|temizle|kapat.*aç|reset\s*at|clear|yeniden\s*başla|baştan\s*başla)$/i;
    if (resetPatterns.test(text.trim())) {
      const chatKey = `${message.channel}:${message.chatId}`;
      this.conversations.delete(chatKey);
      this.deleteConversationFile(chatKey);
      return { text: "🔄 Hard reset yapıldı. Konuşma geçmişi silindi, sıfırdan başlıyoruz." };
    }

    if (text === "/help" || text === "/yardim") {
      return {
        text: [
          "🔥 **Foreman**",
          "",
          "Just talk to me naturally. I'll decide what to do.",
          "",
          "Simple tasks → I handle directly (read, edit, run commands)",
          "Complex tasks → I launch the Forge pipeline automatically",
          "",
          "**Utility Commands:**",
          "/status — System status",
          "/clear — Clear conversation",
          "/reset — Hard reset (clear + restart)",
          "/tools — List available tools",
          "/cost — Token cost report",
          "/cancel — Cancel active forge run",
          "/observe — Last pipeline report",
          "/rollback — Undo last operation",
        ].join("\n"),
        parseMode: "markdown",
      };
    }

    if (text === "/tools" || text === "/araclar") {
      const toolList = TOOL_DEFINITIONS.map(t => `• \`${t.name}\` — ${t.description.slice(0, 50)}`).join("\n");
      return {
        text: `🛠️ **Available Tools (${TOOL_DEFINITIONS.length})**\n\n${toolList}`,
        parseMode: "markdown",
      };
    }

    // ─── OBSERVER: Last pipeline report ─────────────────────
    if (text === "/observe" || text === "/gozlem" || text === "/rapor") {
      try {
        const { readdirSync, readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const observerDir = join(this.config.projectRoot, ".foreman", "observer");
        if (!existsSync(observerDir)) {
          return { text: "📊 Henüz pipeline çalıştırılmamış." };
        }
        const files = readdirSync(observerDir)
          .filter(f => f.endsWith("-summary.md"))
          .sort()
          .reverse();
        if (files.length === 0) {
          return { text: "📊 Pipeline raporu bulunamadı." };
        }
        const latest = readFileSync(join(observerDir, files[0]), "utf-8");
        // Truncate for Telegram (4096 char limit)
        const truncated = latest.length > 3800
          ? latest.slice(0, 3800) + "\n\n... (truncated)"
          : latest;
        return { text: truncated };
      } catch {
        return { text: "❌ Observer raporu okunamadı." };
      }
    }

    // ─── FORGE UTILITY COMMANDS ─────────────────────────────
    // /cancel, /cost, /rollback etc. still handled via ForgeGatewayBridge
    // /forge is no longer a command — LLM decides when to use forge_pipeline tool
    if (text === "/cancel" || text === "/iptal" ||
      text === "/cost" || text === "/maliyet" || text === "/project" || text === "/proje" ||
      text === "/rollback" || text === "/geri" || text === "/identity" || text === "/kimlik" ||
      text === "/agents" || text === "/ajanlar" || text === "/sessions" || text === "/oturumlar") {
      try {
        const { ForgeGatewayBridge } = await import("./forge-gateway.js");
        const { Engine } = await import("./engine.js");

        const engine = new Engine({
          projectRoot: this.config.projectRoot,
          projectName: this.config.projectName,
        });

        const bridge = new ForgeGatewayBridge(engine);
        const chatKey = `${message.channel}:${message.chatId}`;

        const channel = this.channels.get(message.channel);
        const sender = {
          send: async (text: string) => {
            await channel?.send(message.chatId, { text });
          },
          editLast: async (text: string) => {
            await channel?.send(message.chatId, { text });
          },
        };

        const result = bridge.handleCommand(text, chatKey, sender);
        if (result === null) return null;
        return { text: result };
      } catch (err) {
        return { text: `❌ Command error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    return null;
  }

  // ─── LLM PROCESSING ──────────────────────────────────────

  private async processWithLLM(conversation: ConversationState): Promise<OutboundReply | null> {
    if (!this.provider || !this.toolExecutor) {
      return { text: "❌ Provider not initialized. Run: foreman login" };
    }

    try {
      const systemPrompt = await this.buildSystemPrompt();

      // Build messages for the provider
      const messages: Array<{ role: string; content: string | any[] }> = [
        { role: "system", content: systemPrompt },
        ...conversation.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      ];

      // ─── USE streamChatWithTools (same as REPL) for full tool parity ───
      const hasToolSupport = typeof this.provider.streamChatWithTools === "function";
      console.log(`[gateway] processWithLLM: hasToolSupport=${hasToolSupport}, model=${DEFAULT_KIMI_MODEL}, messages=${messages.length}`);

      if (hasToolSupport) {
        console.log(`[gateway] Using streamChatWithTools path (with tools)`);
        let responseText = "";
        const toolLog: string[] = [];

        const result = await this.provider.streamChatWithTools!(
          messages,
          DEFAULT_KIMI_MODEL,
          // onToken — collect response text
          (token: string) => {
            responseText += token;
          },
          // onToolCall — log tool usage
          (call: { name: string; args: Record<string, any> }) => {
            const argsPreview = call.args.command ?? call.args.path ?? call.args.pattern ?? call.args.directory ?? ".";
            toolLog.push(`⚙ ${call.name} ${String(argsPreview).slice(0, 60)}`);
          },
          // onToolResult — log tool results
          (result: { name: string; content: string; isError?: boolean }) => {
            const icon = result.isError ? "✘" : "✔";
            const preview = result.content.split("\n").slice(0, 3).join("\n  ");
            toolLog.push(`  ${icon} ${preview.slice(0, 200)}`);
          },
          32768,  // maxTokens
          25,     // maxIterations — same as REPL
          this.toolExecutor,
        );

        // Track tokens
        console.log(`[gateway] streamChatWithTools done: toolCalls=${toolLog.length}, responseLen=${responseText.length}, tokens=${(result.inputTokens ?? 0) + (result.outputTokens ?? 0)}`);
        conversation.totalTokens += (result.inputTokens ?? 0) + (result.outputTokens ?? 0);

        // Build Telegram response with tool log
        const parts: string[] = [];
        if (toolLog.length > 0) {
          parts.push(toolLog.join("\n"));
          parts.push(""); // separator
        }
        const text = responseText.trim() || result.text?.trim() || "";
        if (text) {
          parts.push(text);
        }

        const finalText = parts.join("\n").trim();
        if (!finalText) {
          return { text: "🤔 (boş yanıt — tekrar dene)" };
        }

        return {
          text: finalText,
          parseMode: "markdown",
        };
      }

      // ─── FALLBACK: provider.generate (text-only, no tools) ───
      console.log(`[gateway] FALLBACK to provider.generate (no tool support)`);
      const result = await this.provider.generate(
        messages as any,
        { model: DEFAULT_KIMI_MODEL, maxTokens: 32768, temperature: 0.7 },
      );

      const responseText = result.text?.trim() ?? "";
      conversation.totalTokens += result.tokenUsage?.total ?? 0;

      if (!responseText) {
        return { text: "🤔 (boş yanıt — tekrar dene)" };
      }

      return {
        text: responseText,
        parseMode: "markdown",
      };
    } catch (err) {
      console.error(`[gateway] LLM error:`, err);
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("rate limit") || msg.includes("429") || msg.includes("overloaded")) {
        console.log(`[gateway] Rate limited, retrying in 10s...`);
        await new Promise(r => setTimeout(r, 10_000));
        try {
          const systemPrompt = await this.buildSystemPrompt();
          if (this.provider!.streamChatWithTools) {
            let retryText = "";
            const retryResult = await this.provider!.streamChatWithTools(
              [
                { role: "system", content: systemPrompt },
                ...conversation.messages.map(m => ({ role: m.role, content: m.content })),
              ],
              DEFAULT_KIMI_MODEL,
              (token: string) => { retryText += token; },
              () => { },
              () => { },
              32768,
              25,
              this.toolExecutor!,
            );
            const text = retryText.trim() || retryResult.text?.trim();
            if (text) {
              conversation.totalTokens += (retryResult.inputTokens ?? 0) + (retryResult.outputTokens ?? 0);
              return { text, parseMode: "markdown" };
            }
          }
        } catch (retryErr) {
          console.error(`[gateway] Retry also failed:`, retryErr);
        }
        return { text: "⏳ API yoğun, biraz sonra tekrar dene." };
      }
      return { text: `❌ LLM error: ${msg.slice(0, 200)}` };
    }
  }

  // ─── SYSTEM PROMPT ────────────────────────────────────────

  private async buildSystemPrompt(): Promise<string> {
    // Load identity context if available
    let identityInjection = "";
    try {
      const { IdentityEngine } = await import("./identity-engine.js");
      const identity = new IdentityEngine(this.config.projectRoot);
      identityInjection = identity.buildContextInjection();
    } catch { /* identity files may not exist */ }

    const base = [
      "You are Foreman — an AI coding agent and task orchestrator.",
      "You communicate through Telegram messaging.",
      "",
      "## IDENTITY",
      "- Your name is Foreman. You are a coding agent with full system access.",
      "- Respond in the user's language (Turkish if they speak Turkish).",
      "- Be concise — Telegram has character limits.",
      "",
      "## HOW TO USE TOOLS — CRITICAL",
      "You have tools available through the FUNCTION CALLING API.",
      "When you want to run a command, read a file, write a file, or do anything technical:",
      "- Call the appropriate tool function (bash, read_file, write_file, etc.)",
      "- The tools are provided as function definitions in this conversation",
      "- DO NOT write tool calls as text, XML, markdown, or code blocks",
      "- DO NOT write <bash>, <command>, ```bash, or any other text-based tool format",
      "- DO NOT describe what tool you would use — actually CALL it via function calling",
      "- If the user asks you to run a command, CALL the bash tool — don't write the command as text",
      "",
      "## WRONG (never do this):",
      '- Writing: <bash><command>ls src/</command></bash>',
      '- Writing: ```bash\\nls src/\\n```',
      '- Writing: "I will run `ls src/`"',
      "",
      "## CORRECT (always do this):",
      "- Call the `bash` function with {\"command\": \"ls src/\"}",
      "- Call the `read_file` function with {\"path\": \"src/foo.ts\"}",
      "- Call the `write_file` function with {\"path\": \"...\", \"content\": \"...\"}",
      "",
      "## RULES",
      "- Take action first, explain after",
      "- Be concise in responses",
      "- Don't ask for permission on safe operations",
      "- Ask before destructive operations (delete, force push)",
      "- NEVER write to ~/.foreman/config.json unless explicitly asked",
      "",
      `## Project: ${this.config.projectName}`,
      `## Working Directory: ${this.config.projectRoot}`,
    ].join("\n");

    return identityInjection ? `${base}\n\n${identityInjection}` : base;
  }

  // ─── HELPERS ──────────────────────────────────────────────

  private getConversation(chatKey: string, message: InboundMessage): ConversationState {
    let conv = this.conversations.get(chatKey);

    // Reset if expired
    if (conv && Date.now() - conv.lastActivity > this.CONVERSATION_TTL_MS) {
      this.conversations.delete(chatKey);
      this.deleteConversationFile(chatKey);
      conv = undefined;
    }

    if (!conv) {
      conv = {
        chatId: message.chatId,
        channel: message.channel,
        messages: [],
        lastActivity: Date.now(),
        totalTokens: 0,
        senderName: message.senderName,
      };
      this.conversations.set(chatKey, conv);
    }

    return conv;
  }

  private trimConversation(conv: ConversationState): void {
    // Message count cap
    if (conv.messages.length > this.MAX_HISTORY) {
      conv.messages = conv.messages.slice(-this.MAX_HISTORY);
    }

    // Character-based cap (~100K chars ≈ ~25K tokens)
    // Trim oldest messages until under budget
    const MAX_CHARS = 100_000;
    let totalChars = conv.messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
    while (totalChars > MAX_CHARS && conv.messages.length > 4) {
      const removed = conv.messages.shift()!;
      totalChars -= typeof removed.content === "string" ? removed.content.length : 0;
    }
  }

  // ─── CONVERSATION PERSISTENCE ─────────────────────────────

  /**
   * Persist a single conversation to disk.
   * Called after every message exchange to survive restarts.
   */
  private persistConversation(chatKey: string): void {
    const conv = this.conversations.get(chatKey);
    if (!conv) return;

    try {
      if (!existsSync(this.CONVERSATIONS_DIR)) {
        mkdirSync(this.CONVERSATIONS_DIR, { recursive: true });
      }

      // Sanitize chatKey for filename (e.g., "telegram:8325347046" → "telegram_8325347046")
      const filename = chatKey.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
      const filePath = join(this.CONVERSATIONS_DIR, filename);

      const data = {
        chatKey,
        chatId: conv.chatId,
        channel: conv.channel,
        messages: conv.messages,
        lastActivity: conv.lastActivity,
        totalTokens: conv.totalTokens,
        senderName: conv.senderName,
      };

      writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn(`[gateway] Failed to persist conversation ${chatKey}:`, err);
    }
  }

  /**
   * Load all persisted conversations from disk.
   * Called once during constructor — restores state after restart.
   */
  private loadConversations(): void {
    try {
      if (!existsSync(this.CONVERSATIONS_DIR)) return;

      const files = readdirSync(this.CONVERSATIONS_DIR).filter(f => f.endsWith(".json"));
      let loaded = 0;

      for (const file of files) {
        try {
          const filePath = join(this.CONVERSATIONS_DIR, file);
          const raw = readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw);

          // Remove expired conversation files from disk
          if (Date.now() - data.lastActivity > this.CONVERSATION_TTL_MS) {
            try { unlinkSync(filePath); } catch { /* best-effort cleanup */ }
            continue;
          }

          const conv: ConversationState = {
            chatId: data.chatId,
            channel: data.channel,
            messages: data.messages ?? [],
            lastActivity: data.lastActivity,
            totalTokens: data.totalTokens ?? 0,
            senderName: data.senderName ?? "Unknown",
          };

          this.conversations.set(data.chatKey, conv);
          loaded++;
        } catch {
          // Skip corrupted files
        }
      }

      if (loaded > 0) {
        console.log(`[gateway] Restored ${loaded} conversation(s) from disk`);
      }
    } catch {
      // First run — no conversations dir yet
    }
  }

  /**
   * Delete a conversation file from disk.
   */
  private deleteConversationFile(chatKey: string): void {
    try {
      const filename = chatKey.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
      const filePath = join(this.CONVERSATIONS_DIR, filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch { /* best-effort */ }
  }

  private async createChannel(config: ChannelConfig): Promise<Channel> {
    switch (config.type) {
      case "telegram": {
        const { TelegramChannel } = await import("./telegram-channel.js");
        return new TelegramChannel(
          config as TelegramChannelConfig,
          (msg) => this.handleMessage(msg),
        );
      }
      case "whatsapp": {
        const { WhatsAppChannel } = await import("./whatsapp-channel.js");
        return new WhatsAppChannel(
          config as WhatsAppChannelConfig,
          (msg) => this.handleMessage(msg),
        );
      }
      default:
        throw new Error(`Unknown channel type: ${config.type}`);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, conv] of this.conversations) {
        if (now - conv.lastActivity > this.CONVERSATION_TTL_MS) {
          this.conversations.delete(key);
          // Remove persisted file
          try {
            const filename = key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
            unlinkSync(join(this.CONVERSATIONS_DIR, filename));
          } catch { /* file may not exist */ }
        }
      }
    }, 60_000);
    this.cleanupTimer.unref(); // Don't keep process alive for cleanup
  }

  // ─── PUBLIC ACCESSORS ─────────────────────────────────────

  /** Get active channel count */
  getActiveChannels(): number {
    return this.channels.size;
  }

  /** Get conversation count */
  getConversationCount(): number {
    return this.conversations.size;
  }

  /** Check if gateway is running */
  isRunning(): boolean {
    return this.running;
  }

  /** Get channel instance */
  getChannel(type: ChannelType): Channel | undefined {
    return this.channels.get(type);
  }
}

