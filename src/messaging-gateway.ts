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
import { AntigravityProvider, loadCredentials, getChatModels } from "./antigravity-provider.js";
import { createEngineToolExecutor, TOOL_DEFINITIONS } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";
import { EditEngine } from "./edit-engine.js";
import { GitEngine } from "./git-engine.js";
import { LinkIntelligence } from "./link-intelligence.js";
import type { ToolCall, ToolResult } from "./tools.js";
import {
  shouldCompact,
  compactWithLlm,
  compactLocal,
  type ConversationMessage,
  type SummarizeFunction,
} from "./compaction-engine.js";

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
  private provider: AntigravityProvider | null = null;
  private toolExecutor: ((call: ToolCall) => Promise<ToolResult>) | null = null;
  private processing: Set<string> = new Set(); // active chat IDs
  private running = false;

  // Conversation limits
  private readonly MAX_HISTORY = 50;
  private readonly CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 min idle = reset
  private readonly MAX_RESPONSE_LENGTH = 4000; // Telegram limit ~4096

  constructor(config: GatewayConfig) {
    this.config = config;
    this.engine = new Engine({
      projectRoot: config.projectRoot,
      projectName: config.projectName,
    });
  }

  // ─── LIFECYCLE ────────────────────────────────────────────

  /**
   * Start the gateway and all configured channels.
   */
  async start(): Promise<void> {
    console.log(`[gateway] Starting Foreman Messaging Gateway...`);

    // Initialize provider
    const creds = loadCredentials();
    if (!creds) {
      throw new Error("No Antigravity credentials. Run: foreman login");
    }
    this.provider = new AntigravityProvider(creds);

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

    // Concurrency guard — one message per chat at a time
    const chatKey = `${message.channel}:${message.chatId}`;
    if (this.processing.has(chatKey)) {
      return { text: "⏳ Processing previous message... please wait." };
    }

    this.processing.add(chatKey);

    try {
      // Handle slash commands
      const cmdResult = this.handleCommand(message);
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

      return reply;
    } catch (err) {
      console.error(`[gateway] Error processing message from ${message.senderName}:`, err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { text: `❌ Error: ${errorMsg.slice(0, 200)}` };
    } finally {
      this.processing.delete(chatKey);
    }
  }

  // ─── SLASH COMMANDS ───────────────────────────────────────

  private handleCommand(message: InboundMessage): OutboundReply | null {
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

    if (text === "/clear" || text === "/temizle") {
      const chatKey = `${message.channel}:${message.chatId}`;
      this.conversations.delete(chatKey);
      return { text: "🗑️ Conversation cleared." };
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
          "/tools — List available tools",
          "/cost — Token cost report",
          "/cancel — Cancel active forge run",
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

    // ─── FORGE UTILITY COMMANDS ─────────────────────────────
    // /cancel, /cost, /rollback etc. still handled via ForgeGatewayBridge
    // /forge is no longer a command — LLM decides when to use forge_pipeline tool
    if (text === "/cancel" || text === "/iptal" ||
        text === "/cost" || text === "/maliyet" || text === "/project" || text === "/proje" ||
        text === "/rollback" || text === "/geri" || text === "/identity" || text === "/kimlik" ||
        text === "/agents" || text === "/ajanlar" || text === "/sessions" || text === "/oturumlar") {
      try {
        const { ForgeGatewayBridge } = require("./forge-gateway.js") as typeof import("./forge-gateway.js");
        const { Engine } = require("./engine.js") as typeof import("./engine.js");

        const engine = new Engine({
          projectRoot: this.config.projectRoot,
          projectName: this.config.projectName,
        });

        const bridge = new ForgeGatewayBridge(engine);
        const chatKey = `${message.channel}:${message.chatId}`;

        const channel = this.channels.get(message.channel);
        const sender = {
          send: async (text: string) => {
            await channel?.send(message.chatId, text);
          },
          editLast: async (text: string) => {
            await channel?.send(message.chatId, text);
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

    const models = getChatModels();
    const modelId = models[0]?.id ?? "claude-sonnet";

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt();

    // ─── COMPACTION — compress long conversations ───────────
    let conversationMessages = conversation.messages;

    const compactionMessages: ConversationMessage[] = conversationMessages.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    if (shouldCompact(compactionMessages, { maxTokens: 80_000 })) {
      try {
        // Build summarize function using the provider
        const summarize: SummarizeFunction = async (sysPrompt, userPrompt, model) => {
          const summaryModel = model ?? modelId;
          const result = await this.provider!.streamChatWithTools(
            [
              { role: "system", content: sysPrompt },
              { role: "user", content: userPrompt },
            ],
            summaryModel,
            () => {},
            () => {},
            () => {},
            1024,
            1,
            this.toolExecutor!,
          );
          return result.text;
        };

        const compacted = await compactWithLlm(compactionMessages, summarize, {
          maxTokens: 80_000,
          recentKeepCount: 10,
          summaryModel: modelId,
        });

        if (compacted.usedLlm) {
          console.log(
            `[gateway] Compacted: ${compacted.summarizedCount} messages → summary (${compacted.estimatedTokens} tokens)`,
          );
        }

        // Replace conversation messages with compacted version
        conversation.messages = compacted.messages.map(m => ({
          role: m.role,
          content: m.content,
        }));
        conversationMessages = conversation.messages;
      } catch (err) {
        console.warn(`[gateway] Compaction failed, using local fallback:`, err);
        const local = compactLocal(compactionMessages, { maxTokens: 80_000, recentKeepCount: 10 });
        conversation.messages = local.messages.map(m => ({
          role: m.role,
          content: m.content,
        }));
        conversationMessages = conversation.messages;
      }
    }
    // ─────────────────────────────────────────────────────────

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationMessages,
    ];

    let responseText = "";

    try {
      const result = await this.provider.streamChatWithTools(
        messages,
        modelId,
        // onToken — accumulate response
        (token: string) => {
          responseText += token;
        },
        // onToolCall — log tool usage
        (call: ToolCall) => {
          console.log(`[gateway] Tool: ${call.name} ${JSON.stringify(call.args).slice(0, 80)}`);
        },
        // onToolResult — log result
        (result: ToolResult) => {
          const preview = result.content.slice(0, 100);
          console.log(`[gateway] Result: ${result.name} → ${result.isError ? "❌" : "✔"} ${preview}`);
        },
        // maxTokens
        4096,
        // maxIterations
        15,
        // toolExecutor
        this.toolExecutor,
      );

      conversation.totalTokens += result.inputTokens + result.outputTokens;

      // Split long responses for Telegram/WhatsApp limits
      const text = responseText.trim() || result.text.trim();
      if (!text) return null;

      return {
        text: this.truncateResponse(text),
        parseMode: "markdown",
      };
    } catch (err) {
      console.error(`[gateway] LLM error:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("rate limit") || msg.includes("429")) {
        return { text: "⏳ Rate limit reached. Please wait a moment." };
      }
      return { text: `❌ LLM error: ${msg.slice(0, 200)}` };
    }
  }

  // ─── SYSTEM PROMPT ────────────────────────────────────────

  private buildSystemPrompt(): string {
    // Load identity context if available
    let identityInjection = "";
    try {
      const { IdentityEngine } = require("./identity-engine.js") as typeof import("./identity-engine.js");
      const identity = new IdentityEngine(this.config.projectRoot);
      identityInjection = identity.buildContextInjection();
    } catch { /* identity files may not exist */ }

    const base = [
      "You are Foreman — an AI coding agent and task orchestrator.",
      "You communicate through messaging but you are a FULL coding agent, not a chatbot.",
      "You can read, write, edit code, run commands, and build entire features autonomously.",
      "",
      "## How You Work",
      "You have two modes of operation and YOU decide which to use:",
      "",
      "### Direct Mode (simple tasks)",
      "For quick fixes, reading files, running commands, answering questions, small edits —",
      "use your tools directly (bash, read_file, write_file, edit_file, etc.).",
      "",
      "### Forge Pipeline (complex tasks)",
      "For multi-file features, refactors, new components, UI work, or anything that needs",
      "planning and multi-step execution — call the `forge_pipeline` tool.",
      "The pipeline handles: vision → strategy → research → execution → verification → visual QA.",
      "",
      "## Decision Guide",
      "Use forge_pipeline when:",
      "- The task touches 3+ files",
      "- Building something new from scratch",
      "- Major refactors or redesigns",
      "- UI/design work that needs visual verification",
      "- The user says 'build', 'create', 'implement', 'redesign', 'refactor' for something non-trivial",
      "",
      "Use direct tools when:",
      "- Reading a file or checking something",
      "- Running a quick command",
      "- Fixing a typo or small bug in 1-2 files",
      "- Answering a question about the codebase",
      "- Git status, diff, log",
      "",
      "## Capabilities (Tools)",
      "- bash — Run shell commands",
      "- read_file, write_file, edit_file — File operations",
      "- list_files, search_files, grep_search — File discovery",
      "- git_status, git_commit, git_diff, git_log — Version control",
      "- web_search, web_fetch — Internet research",
      "- browser_screenshot, browser_navigate — Browser control",
      "- forge_pipeline — Full 4-layer coding pipeline for complex tasks",
      "- ... and more (47 tools total)",
      "",
      "## Rules",
      "- Be concise — messaging has character limits",
      "- Use code blocks for code snippets",
      "- Take action first, explain after",
      "- Don't ask for permission on safe operations (read, search, git status)",
      "- Ask before destructive operations (delete, force push, overwrite)",
      "- Always verify your work (run build/tests after changes)",
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
    // Keep only recent messages
    if (conv.messages.length > this.MAX_HISTORY) {
      // Keep system prompt context but trim middle
      conv.messages = conv.messages.slice(-this.MAX_HISTORY);
    }
  }

  private truncateResponse(text: string): string {
    if (text.length <= this.MAX_RESPONSE_LENGTH) return text;

    // Smart truncation — find last complete sentence/paragraph
    const truncated = text.slice(0, this.MAX_RESPONSE_LENGTH);
    const lastNewline = truncated.lastIndexOf("\n");
    const lastPeriod = truncated.lastIndexOf(". ");

    const cutPoint = Math.max(lastNewline, lastPeriod);
    if (cutPoint > this.MAX_RESPONSE_LENGTH * 0.5) {
      return truncated.slice(0, cutPoint + 1) + "\n\n... (truncated)";
    }

    return truncated + "\n\n... (truncated)";
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
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, conv] of this.conversations) {
        if (now - conv.lastActivity > this.CONVERSATION_TTL_MS) {
          this.conversations.delete(key);
        }
      }
    }, 60_000);
    timer.unref(); // Don't keep process alive for cleanup
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
