/**
 * FOREMAN — Compaction Engine
 *
 * LLM-based conversation compaction for messaging gateway.
 * When conversation history grows too large, summarizes old messages
 * using the LLM itself, preserving context while reducing token count.
 *
 * Transplanted from OpenClaw compaction.ts, adapted for Foreman:
 * - Works with conversation messages (not AgentMessage)
 * - Uses AntigravityProvider for summarization
 * - Progressive fallback: LLM summary → chunked summary → truncation
 * - Cheap-model philosophy: uses flash/small model for summaries
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface CompactionResult {
  /** Compacted messages (summary + recent) */
  messages: ConversationMessage[];
  /** Number of messages summarized */
  summarizedCount: number;
  /** Number of messages kept in full */
  keptCount: number;
  /** Generated summary text */
  summary: string;
  /** Token estimate of the compacted result */
  estimatedTokens: number;
  /** Whether LLM was used (vs fallback) */
  usedLlm: boolean;
}

export interface CompactionConfig {
  /** Maximum tokens before triggering compaction (default: 80000) */
  maxTokens: number;
  /** Threshold ratio — compact when exceeding this ratio (default: 0.7) */
  threshold: number;
  /** How many recent messages to always keep in full (default: 10) */
  recentKeepCount: number;
  /** Maximum tokens for the summary itself (default: 2000) */
  maxSummaryTokens: number;
  /** Model to use for summarization (default: flash model for cheapness) */
  summaryModel?: string;
}

const DEFAULT_CONFIG: CompactionConfig = {
  maxTokens: 80_000,
  threshold: 0.7,
  recentKeepCount: 10,
  maxSummaryTokens: 2000,
};

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. Create a concise but complete summary of the conversation below.

Rules:
- Preserve ALL key decisions, conclusions, and action items
- Keep technical details that are still relevant
- Note any unresolved questions or pending tasks
- Use bullet points for clarity
- Maximum length: ~500 words
- Write in the same language as the conversation
- Do NOT add opinions or new information`;

const MERGE_SYSTEM_PROMPT = `Merge these partial conversation summaries into a single cohesive summary.

Rules:
- Preserve all key decisions, conclusions, and action items
- Remove redundancy between summaries
- Maintain chronological order
- Keep it concise but complete
- Maximum length: ~500 words`;

// ─── TOKEN ESTIMATION ────────────────────────────────────────

/** Simple token estimation: ~4 chars = 1 token */
export function estimateMessageTokens(msg: ConversationMessage): number {
  return Math.ceil(msg.content.length / 4) + 4; // +4 for role/overhead
}

/** Total token estimate for message array */
export function estimateMessagesTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

// ─── CHUNK SPLITTING ─────────────────────────────────────────

/**
 * Split messages into chunks by token budget.
 * Each chunk stays under maxTokensPerChunk.
 */
export function chunkMessagesByTokens(
  messages: ConversationMessage[],
  maxTokensPerChunk: number,
): ConversationMessage[][] {
  if (messages.length === 0) return [];

  const chunks: ConversationMessage[][] = [];
  let current: ConversationMessage[] = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const tokens = estimateMessageTokens(msg);

    if (current.length > 0 && currentTokens + tokens > maxTokensPerChunk) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(msg);
    currentTokens += tokens;

    // Oversized single message — isolate it
    if (tokens > maxTokensPerChunk) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

// ─── COMPACTION CHECK ────────────────────────────────────────

/** Should we compact this conversation? */
export function shouldCompact(
  messages: ConversationMessage[],
  config: Partial<CompactionConfig> = {},
): boolean {
  const c = { ...DEFAULT_CONFIG, ...config };
  const totalTokens = estimateMessagesTokens(messages);
  return totalTokens > c.maxTokens * c.threshold;
}

// ─── LOCAL (NON-LLM) COMPACTION ──────────────────────────────

/**
 * Compact conversation without LLM — pure truncation with summary extraction.
 * Used as fallback when LLM is unavailable or for cheap-model philosophy.
 */
export function compactLocal(
  messages: ConversationMessage[],
  config: Partial<CompactionConfig> = {},
): CompactionResult {
  const c = { ...DEFAULT_CONFIG, ...config };

  if (messages.length <= c.recentKeepCount) {
    return {
      messages,
      summarizedCount: 0,
      keptCount: messages.length,
      summary: "",
      estimatedTokens: estimateMessagesTokens(messages),
      usedLlm: false,
    };
  }

  const recentStart = Math.max(0, messages.length - c.recentKeepCount);
  const oldMessages = messages.slice(0, recentStart);
  const recentMessages = messages.slice(recentStart);

  // Build extractive summary from old messages
  const summaryLines: string[] = [];
  let summaryTokens = 0;

  for (const msg of oldMessages) {
    const role = msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "📋";
    const preview = msg.content.slice(0, 120).replace(/\n/g, " ");
    const line = `${role} ${preview}${msg.content.length > 120 ? "…" : ""}`;
    const lineTokens = estimateMessageTokens({ role: "system", content: line });

    if (summaryTokens + lineTokens > c.maxSummaryTokens) break;
    summaryLines.push(line);
    summaryTokens += lineTokens;
  }

  const summary = `[Compacted: ${oldMessages.length} earlier messages]\n${summaryLines.join("\n")}`;

  const summaryMessage: ConversationMessage = {
    role: "system",
    content: summary,
    timestamp: oldMessages[0]?.timestamp,
  };

  const result = [summaryMessage, ...recentMessages];

  return {
    messages: result,
    summarizedCount: oldMessages.length,
    keptCount: recentMessages.length,
    summary,
    estimatedTokens: estimateMessagesTokens(result),
    usedLlm: false,
  };
}

// ─── LLM-BASED COMPACTION ────────────────────────────────────

/** Type for the summarization function (injected for testability) */
export type SummarizeFunction = (
  systemPrompt: string,
  userPrompt: string,
  model?: string,
) => Promise<string>;

/**
 * Summarize a chunk of messages using LLM.
 */
async function summarizeChunk(
  messages: ConversationMessage[],
  summarize: SummarizeFunction,
  model?: string,
): Promise<string> {
  const formatted = messages.map(m => {
    const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System";
    return `[${role}]: ${m.content}`;
  }).join("\n\n");

  return summarize(SUMMARY_SYSTEM_PROMPT, formatted, model);
}

/**
 * Merge multiple partial summaries into one.
 */
async function mergeSummaries(
  summaries: string[],
  summarize: SummarizeFunction,
  model?: string,
): Promise<string> {
  const formatted = summaries.map((s, i) => `## Part ${i + 1}\n${s}`).join("\n\n");
  return summarize(MERGE_SYSTEM_PROMPT, formatted, model);
}

/**
 * Full LLM-based compaction with progressive fallback.
 *
 * Strategy:
 * 1. Try LLM summarization of old messages
 * 2. If too large, chunk + summarize each + merge
 * 3. If LLM fails, fall back to local compaction
 */
export async function compactWithLlm(
  messages: ConversationMessage[],
  summarize: SummarizeFunction,
  config: Partial<CompactionConfig> = {},
): Promise<CompactionResult> {
  const c = { ...DEFAULT_CONFIG, ...config };

  // Not enough messages to compact
  if (messages.length <= c.recentKeepCount) {
    return {
      messages,
      summarizedCount: 0,
      keptCount: messages.length,
      summary: "",
      estimatedTokens: estimateMessagesTokens(messages),
      usedLlm: false,
    };
  }

  const recentStart = Math.max(0, messages.length - c.recentKeepCount);
  const oldMessages = messages.slice(0, recentStart);
  const recentMessages = messages.slice(recentStart);

  try {
    let summary: string;
    const oldTokens = estimateMessagesTokens(oldMessages);

    if (oldTokens > c.maxTokens * 0.4) {
      // Too large for single summarization — chunk it
      const chunks = chunkMessagesByTokens(oldMessages, Math.floor(c.maxTokens * 0.3));
      const partialSummaries: string[] = [];

      for (const chunk of chunks) {
        try {
          const partial = await summarizeChunk(chunk, summarize, c.summaryModel);
          partialSummaries.push(partial);
        } catch {
          // Skip failed chunks — best effort
          const fallback = chunk.map(m => m.content.slice(0, 80)).join("; ");
          partialSummaries.push(`[Partial: ${fallback}]`);
        }
      }

      summary = partialSummaries.length > 1
        ? await mergeSummaries(partialSummaries, summarize, c.summaryModel)
        : partialSummaries[0] ?? "";
    } else {
      // Small enough for single pass
      summary = await summarizeChunk(oldMessages, summarize, c.summaryModel);
    }

    const summaryMessage: ConversationMessage = {
      role: "system",
      content: `[Conversation Summary — ${oldMessages.length} messages compacted]\n\n${summary}`,
      timestamp: oldMessages[0]?.timestamp,
    };

    const result = [summaryMessage, ...recentMessages];

    return {
      messages: result,
      summarizedCount: oldMessages.length,
      keptCount: recentMessages.length,
      summary,
      estimatedTokens: estimateMessagesTokens(result),
      usedLlm: true,
    };
  } catch (error) {
    // LLM failed — fallback to local compaction
    console.warn(
      `[compaction] LLM summarization failed, falling back to local: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return compactLocal(messages, config);
  }
}

// ─── CONVERSATION HISTORY PRUNING ────────────────────────────

/**
 * Prune conversation history to fit within token budget.
 * Drops oldest messages first, preserving recent context.
 */
export function pruneHistory(
  messages: ConversationMessage[],
  maxTokens: number,
  maxHistoryShare = 0.5,
): {
  messages: ConversationMessage[];
  droppedCount: number;
  droppedTokens: number;
  keptTokens: number;
} {
  const budgetTokens = Math.max(1, Math.floor(maxTokens * maxHistoryShare));
  let kept = [...messages];
  let droppedCount = 0;
  let droppedTokens = 0;

  while (kept.length > 1 && estimateMessagesTokens(kept) > budgetTokens) {
    const dropped = kept.shift()!;
    droppedCount++;
    droppedTokens += estimateMessageTokens(dropped);
  }

  return {
    messages: kept,
    droppedCount,
    droppedTokens,
    keptTokens: estimateMessagesTokens(kept),
  };
}

// ─── ADAPTIVE CHUNK RATIO ────────────────────────────────────

const BASE_CHUNK_RATIO = 0.4;
const MIN_CHUNK_RATIO = 0.15;
const SAFETY_MARGIN = 1.2;

/**
 * Compute adaptive chunk ratio based on average message size.
 * Larger messages → smaller chunks to avoid exceeding limits.
 */
export function computeAdaptiveChunkRatio(
  messages: ConversationMessage[],
  contextWindow: number,
): number {
  if (messages.length === 0) return BASE_CHUNK_RATIO;

  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = (totalTokens / messages.length) * SAFETY_MARGIN;
  const avgRatio = avgTokens / contextWindow;

  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}

/**
 * Is a single message too large for summarization?
 * > 50% of context window = oversized.
 */
export function isOversizedForSummary(
  msg: ConversationMessage,
  contextWindow: number,
): boolean {
  return estimateMessageTokens(msg) * SAFETY_MARGIN > contextWindow * 0.5;
}
