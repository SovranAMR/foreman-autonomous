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
  private activeModel: string = "claude-opus-4-6-thinking";
  private toolExecutor: ((call: ToolCall) => Promise<ToolResult>) | null = null;
  private processing: Set<string> = new Set(); // active chat IDs
  private messageQueue: Map<string, InboundMessage[]> = new Map(); // queued messages per chat
  private running = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Conversation limits
  private readonly MAX_HISTORY = 20; // Smaller = more focused model, less hallucination
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

    // Initialize provider — Antigravity (Opus) first for smart tool calling, Kimi fallback
    const creds = loadCredentials();
    if (creds) {
      this.provider = new AntigravityProvider(creds);
      this.activeModel = "claude-opus-4-6-thinking";
      console.log(`[gateway] Using Antigravity provider (Opus 4.6-thinking)`);
    } else {
      const { KimiProvider, loadKimiKey } = await import("./kimi-provider.js");
      const kimiKey = loadKimiKey();
      if (kimiKey) {
        this.provider = new KimiProvider(kimiKey);
        this.activeModel = "kimi-k2-thinking";
        console.log(`[gateway] Using Kimi provider (fallback)`);
      } else {
        throw new Error("No API credentials. Run: foreman login");
      }
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

    // ─── Start Consciousness Heartbeat ───
    try {
      const { startHeartbeatLoop, DEFAULT_HEARTBEAT_CONFIG } = await import('./consciousness/index.js');
      const telegramChannel = this.config.channels.find(c => c.type === 'telegram' && c.enabled);
      const chatId = telegramChannel?.allowedSenders?.[0]; // Primary user
      startHeartbeatLoop({
        ...DEFAULT_HEARTBEAT_CONFIG,
        notifyChatId: chatId,
      });
      console.log(`[gateway] 🫀 Consciousness heartbeat started (notify: ${chatId ?? 'none'})`);
    } catch (err) {
      console.error(`[gateway] Consciousness heartbeat failed to start:`, err);
    }

    console.log(`[gateway] Gateway running — ${this.channels.size} channel(s) active`);
  }

  /**
   * Stop gateway and all channels gracefully.
   */
  async stop(): Promise<void> {
    console.log(`[gateway] Shutting down...`);
    this.running = false;

    // Stop consciousness heartbeat
    try {
      const { stopHeartbeatLoop } = await import('./consciousness/index.js');
      stopHeartbeatLoop();
    } catch { }

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

      // Build messages for the provider — only text content
      // Tool call/result parts from previous streamChatWithTools iterations
      // are self-contained within each call. The conversation history should
      // only carry plain text to avoid Antigravity format mismatches.
      const messages: Array<{ role: string; content: string | any[] }> = [
        { role: "system", content: systemPrompt },
        ...conversation.messages
          .filter(m => typeof m.content === "string")
          .map(m => ({
            role: m.role,
            content: m.content,
          })),
      ];

      // ─── USE streamChatWithTools (same as REPL) for full tool parity ───
      const hasToolSupport = typeof this.provider.streamChatWithTools === "function";
      console.log(`[gateway] processWithLLM: hasToolSupport=${hasToolSupport}, model=${this.activeModel}, messages=${messages.length}`);

      if (hasToolSupport) {
        console.log(`[gateway] Using streamChatWithTools path (with tools)`);
        let responseText = "";
        const toolLog: string[] = [];

        const result = await this.provider.streamChatWithTools!(
          messages,
          this.activeModel,
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
          32768,  // maxTokens — high to allow many tool iterations
          25,     // maxIterations — same as REPL
          this.toolExecutor,
        );

        // Track tokens
        console.log(`[gateway] streamChatWithTools done: toolCalls=${toolLog.length}, responseLen=${responseText.length}, tokens=${(result.inputTokens ?? 0) + (result.outputTokens ?? 0)}`);
        conversation.totalTokens += (result.inputTokens ?? 0) + (result.outputTokens ?? 0);

        // ─── HALLUCINATION GUARD ─────────────────────────────
        // If model returns 0 tool calls but long text, it's hallucinating —
        // describing what it would do instead of doing it. RETRY with force.
        const text = responseText.trim() || result.text?.trim() || "";
        if (toolLog.length === 0 && text.length > 1500 && !conversation.messages.some(m => m.content === "__TOOL_RETRY__")) {
          console.warn(`[gateway] ⚠️ Hallucination detected: 0 tool calls, ${text.length} chars. Forcing tool-usage retry.`);
          // Add the hallucinated response + correction to conversation
          conversation.messages.push({ role: "assistant", content: text.slice(0, 300) });
          conversation.messages.push({ role: "user", content: "Hayır. Sadece yazı yazdın, hiçbir tool kullanmadın. Gerçekten yap — tool call kullan. Kod yaz, dosya oluştur, komut çalıştır. Metin yazma, İŞ YAP." });
          conversation.messages.push({ role: "user", content: "__TOOL_RETRY__" }); // Prevent infinite retry
          // Recursive retry with the corrected conversation
          return this.processWithLLM(conversation);
        }
        // Remove retry marker if present (so next message can trigger retry again)
        conversation.messages = conversation.messages.filter(m => m.content !== "__TOOL_RETRY__");

        // Create a compact tool summary (not raw logs)
        let toolSummary = "";
        if (toolLog.length > 0) {
          const calls = toolLog.filter(l => l.startsWith("⚙"));
          const errors = toolLog.filter(l => l.includes("✘"));
          if (calls.length > 0) {
            const names = calls.map(c => {
              const match = c.match(/⚙\s+(\S+)/);
              return match ? match[1] : "tool";
            });
            const counts = new Map<string, number>();
            for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
            const summary = [...counts.entries()]
              .map(([name, count]) => count > 1 ? `${name}×${count}` : name)
              .join(", ");
            toolSummary = `🔧 ${summary}`;
            if (errors.length > 0) toolSummary += ` (${errors.length} error)`;
          }
        }

        const parts: string[] = [];
        if (toolSummary) parts.push(toolSummary);
        if (text) parts.push(text);

        let finalText = parts.join("\n\n").trim();
        if (!finalText) {
          return { text: "🤔 (boş yanıt — tekrar dene)" };
        }

        // Cap response length for Telegram
        if (finalText.length > 3000) {
          finalText = finalText.slice(0, 2800) + "\n\n... (kısaltıldı)";
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
        { model: this.activeModel, maxTokens: 32768, temperature: 0.7 },
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

      // Handle 503 (capacity) same as rate limit — retry loop
      if (msg.includes("rate limit") || msg.includes("429") || msg.includes("overloaded") || msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("No capacity")) {
        const delays = [10, 15, 20, 30, 45, 60, 90, 120]; // seconds
        for (let attempt = 0; attempt < delays.length; attempt++) {
          const delaySec = delays[attempt];
          console.log(`[gateway] Rate limited / no capacity — retry ${attempt + 1}/${delays.length} in ${delaySec}s...`);
          await new Promise(r => setTimeout(r, delaySec * 1000));
          try {
            const systemPrompt = await this.buildSystemPrompt();
            if (this.provider!.streamChatWithTools) {
              let retryText = "";
              const retryResult = await this.provider!.streamChatWithTools(
                [
                  { role: "system", content: systemPrompt },
                  ...conversation.messages.map(m => ({ role: m.role, content: m.content })),
                ],
                this.activeModel,
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
            break; // success — exit retry loop
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            const isRetryable = retryMsg.includes("503") || retryMsg.includes("429") || retryMsg.includes("rate limit") || retryMsg.includes("UNAVAILABLE") || retryMsg.includes("No capacity");
            if (!isRetryable || attempt === delays.length - 1) {
              console.error(`[gateway] Retry ${attempt + 1} failed (non-retryable or max retries):`, retryMsg.slice(0, 200));
              break;
            }
            console.log(`[gateway] Retry ${attempt + 1} failed (retryable): ${retryMsg.slice(0, 100)}`);
          }
        }
        return { text: "⏳ API yoğun, biraz sonra tekrar dene." };
      }
      // Clean error message — don't send raw JSON to user
      let cleanError = msg;
      if (msg.includes("Antigravity API error")) {
        const codeMatch = msg.match(/error (\d+)/);
        const code = codeMatch ? codeMatch[1] : "unknown";
        cleanError = `API hatası (${code})`;
      }
      return { text: `❌ ${cleanError.slice(0, 150)}` };
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

    // Get project file tree for context (same as REPL)
    let fileTree = "";
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("find", [".", "-maxdepth", "3", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*", "-not", "-path", "*/dist/*"], {
        cwd: this.config.projectRoot,
        encoding: "utf-8",
        timeout: 5000,
      });
      fileTree = (result.stdout ?? "").split("\n").slice(0, 100).join("\n");
    } catch { /* best-effort */ }

    const cwd = this.config.projectRoot;

    const base = `<identity>
You are Foreman — an AI coding assistant with shell and filesystem access.
You communicate through Telegram. User's language: Turkish.
You are an agent — keep going until the task is fully complete before responding.
</identity>

<tools>
Filesystem: read_file, write_file, edit_file, search_files, grep, list_dir
Execution: bash
Each tool requires an "explanation" parameter — state WHY you are using it.
</tools>

<workflow>
For every request, follow this order:
1. OKU — Read relevant files with read_file. Never guess content.
2. PLANLA — Think about minimal changes needed.
3. UYGULA — Apply changes with write_file/edit_file. One at a time.
4. DOĞRULA — Verify with bash (build, test, ls). Changes are NOT done until verified.
</workflow>

<anti_hallucination>
CRITICAL RULES — violation means failure:
1. FIRST action MUST be a tool call, not text. Start with action, not words.
2. NEVER claim you did something without tool call evidence.
3. NEVER output code blocks for user to copy — use write_file/edit_file directly.
4. NEVER tell user to run commands — use bash yourself.
5. NEVER describe what you WOULD do — DO it immediately with tools.
6. If you cannot use tools, say so honestly. Do NOT pretend.
7. After code changes, ALWAYS run verification (bash: build/test/ls).
8. ONE task at a time — complete fully before next.
</anti_hallucination>

<self_correction>
After generating each response, check:
- Did I use tools for every claimed action? NO → redo with tools.
- Did I write code as text? NO → convert to write_file/edit_file call.
- Did I tell user to run a command? NO → do it myself with bash.
- Is my text response under 500 chars? NO → shorten. Tools speak louder.
- Did I verify my changes? NO → run bash verification.
</self_correction>

<communication>
- Max 3-4 short paragraphs. Telegram has character limits.
- Prefer tool results over explanations.
- Brief status before each action, brief summary after.
- Use Turkish when user speaks Turkish.
</communication>

Working directory: ${cwd}
Project: ${this.config.projectName}
${fileTree ? `\nProject files:\n${fileTree}` : ""}`;

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

