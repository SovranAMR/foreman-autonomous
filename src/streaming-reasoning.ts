/**
 * FOREMAN — Streaming Reasoning Extraction
 *
 * Ported from Void's extractGrammar.ts.
 * Extracts <think>...</think> reasoning blocks from streaming LLM responses
 * in real-time, separating reasoning from actual content.
 *
 * Supports:
 * - Configurable think tags (e.g., <think></think>, <reasoning></reasoning>)
 * - Partial tag buffering (waits for complete tags before committing)
 * - SurroundingsRemover for code block/tag cleanup
 * - XML tool call extraction from streaming text
 * - Streaming-safe: handles partial chunks correctly
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface StreamingReasoningCallbacks {
  /** Called with separated text and reasoning as streaming progresses */
  onText: (params: {
    fullText: string;
    fullReasoning: string;
    toolCall?: RawToolCallObj;
  }) => void;
  /** Called when the full message is complete */
  onFinalMessage: (params: {
    fullText: string;
    fullReasoning: string;
    toolCall?: RawToolCallObj;
    anthropicReasoning?: AnthropicReasoningBlock[] | null;
  }) => void;
}

export interface RawToolCallObj {
  name: string;
  rawParams: Record<string, string>;
  doneParams: string[];
  id: string;
  isDone: boolean;
}

export interface AnthropicReasoningBlock {
  type: "thinking" | "redacted_thinking";
  thinking?: string;
  signature?: string;
  data?: unknown;
}

// ─── SURROUNDINGS REMOVER ────────────────────────────────────
// Ported from Void's extractCodeFromResult.ts

export class SurroundingsRemover {
  readonly originalS: string;
  i: number;
  j: number;

  constructor(s: string) {
    this.originalS = s;
    this.i = 0;
    this.j = s.length - 1;
  }

  value(): string {
    return this.originalS.substring(this.i, this.j + 1);
  }

  /** Remove prefix from the left. Returns true if the whole prefix was removed. */
  removePrefix(prefix: string): boolean {
    let offset = 0;
    while (this.i <= this.j && offset <= prefix.length - 1) {
      if (this.originalS.charAt(this.i) !== prefix.charAt(offset)) break;
      offset += 1;
      this.i += 1;
    }
    return offset === prefix.length;
  }

  /** Remove suffix from the right. Returns true if the whole suffix was removed. */
  removeSuffix(suffix: string): boolean {
    const s = this.value();
    for (let len = Math.min(s.length, suffix.length); len >= 1; len -= 1) {
      if (s.endsWith(suffix.substring(0, len))) {
        this.j -= len;
        return len === suffix.length;
      }
    }
    return false;
  }

  /** Remove everything from start until a full match of `until` is found */
  removeFromStartUntilFullMatch(until: string, alsoRemoveUntilStr: boolean): boolean {
    const index = this.originalS.indexOf(until, this.i);
    if (index === -1) return false;
    this.i = alsoRemoveUntilStr ? index + until.length : index;
    return true;
  }

  /** Remove a markdown code block wrapper (```lang\n...\n```) */
  removeCodeBlock(): boolean {
    const foundCodeBlock = this.removePrefix("```");
    if (!foundCodeBlock) return false;
    this.removeFromStartUntilFullMatch("\n", true); // language line
    const j = this.j;
    let foundCodeBlockEnd = this.removeSuffix("```");
    if (this.j === j) foundCodeBlockEnd = this.removeSuffix("```\n");
    if (!foundCodeBlockEnd) return false;
    this.removeSuffix("\n");
    return true;
  }

  /** Get delta info for streaming — what's new vs what was ignored */
  deltaInfo(recentlyAddedTextLen: number): readonly [string, string] {
    const recentlyAddedIdx = this.originalS.length - recentlyAddedTextLen;
    const actualDelta = this.originalS.substring(
      Math.max(this.i, recentlyAddedIdx),
      this.j + 1,
    );
    const ignoredSuffix = this.originalS.substring(
      Math.max(this.j + 1, recentlyAddedIdx),
      Infinity,
    );
    return [actualDelta, ignoredSuffix] as const;
  }
}

// ─── HELPER — endsWithAnyPrefixOf ────────────────────────────
// Check if `text` ends with any prefix of `tag`
// e.g., text="hello<thi", tag="<think>" → returns "<thi"

export function endsWithAnyPrefixOf(
  text: string,
  tag: string,
): string | false {
  for (let len = Math.min(text.length, tag.length); len >= 1; len--) {
    const prefix = tag.substring(0, len);
    if (text.endsWith(prefix)) {
      return prefix;
    }
  }
  return false;
}

// ─── REASONING EXTRACTION ────────────────────────────────────
// Core streaming <think> tag extraction — ported from Void's extractReasoningWrapper

export function extractReasoningWrapper(
  onText: StreamingReasoningCallbacks["onText"],
  onFinalMessage: StreamingReasoningCallbacks["onFinalMessage"],
  thinkTags: [string, string] = ["<think>", "</think>"],
): {
  newOnText: StreamingReasoningCallbacks["onText"];
  newOnFinalMessage: StreamingReasoningCallbacks["onFinalMessage"];
} {
  let latestAddIdx = 0;
  let foundTag1 = false;
  let foundTag2 = false;
  let fullTextSoFar = "";
  let fullReasoningSoFar = "";

  if (!thinkTags[0] || !thinkTags[1]) {
    throw new Error(
      `thinkTags must not be empty. Got ${JSON.stringify(thinkTags)}.`,
    );
  }

  const newOnText: StreamingReasoningCallbacks["onText"] = ({
    fullText: fullText_,
    ...p
  }) => {
    // Phase 1: Before finding opening think tag
    if (!foundTag1) {
      const endsWithTag1 = endsWithAnyPrefixOf(fullText_, thinkTags[0]);
      if (endsWithTag1) {
        // Partial tag at end — buffer and wait
        return;
      }
      const tag1Index = fullText_.indexOf(thinkTags[0]);
      if (tag1Index !== -1) {
        foundTag1 = true;
        fullTextSoFar += fullText_.substring(0, tag1Index);
        latestAddIdx = tag1Index + thinkTags[0].length;
        onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
        return;
      }
      // No think tag — all content is regular text
      fullTextSoFar = fullText_;
      latestAddIdx = fullText_.length;
      onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
      return;
    }

    // Phase 2: Inside think block — accumulating reasoning
    if (!foundTag2) {
      const endsWithTag2 = endsWithAnyPrefixOf(fullText_, thinkTags[1]);
      if (endsWithTag2 && endsWithTag2 !== thinkTags[1]) {
        // Partial closing tag — buffer
        return;
      }
      const tag2Index = fullText_.indexOf(thinkTags[1], latestAddIdx);
      if (tag2Index !== -1) {
        foundTag2 = true;
        fullReasoningSoFar += fullText_.substring(latestAddIdx, tag2Index);
        latestAddIdx = tag2Index + thinkTags[1].length;
        onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
        return;
      }
      // Still inside think block — accumulate reasoning
      if (fullText_.length > latestAddIdx) {
        fullReasoningSoFar = fullText_.substring(
          fullText_.indexOf(thinkTags[0]) + thinkTags[0].length,
          fullText_.length,
        );
      }
      onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
      return;
    }

    // Phase 3: After closing think tag — rest is regular text
    const newContent = fullText_.substring(latestAddIdx);
    if (newContent) {
      fullTextSoFar += newContent;
      latestAddIdx = fullText_.length;
    }
    onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar });
  };

  const newOnFinalMessage: StreamingReasoningCallbacks["onFinalMessage"] = (
    params,
  ) => {
    // Process any remaining text
    newOnText({ ...params });
    onFinalMessage({
      ...params,
      fullText: fullTextSoFar,
      fullReasoning: fullReasoningSoFar,
    });
  };

  return { newOnText, newOnFinalMessage };
}

// ─── CODE EXTRACTION — Regular + FIM ─────────────────────────
// Ported from Void's extractCodeFromResult.ts

export function extractCodeFromRegular(params: {
  text: string;
  recentlyAddedTextLen: number;
}): [string, string, string] {
  const pm = new SurroundingsRemover(params.text);
  pm.removeCodeBlock();
  const s = pm.value();
  const [delta, ignoredSuffix] = pm.deltaInfo(params.recentlyAddedTextLen);
  return [s, delta, ignoredSuffix];
}

export function extractCodeFromFIM(params: {
  text: string;
  recentlyAddedTextLen: number;
  midTag: string;
}): [string, string, string] {
  const pm = new SurroundingsRemover(params.text);
  pm.removePrefix(params.midTag);
  pm.removeSuffix(params.midTag);
  pm.removeCodeBlock();
  const s = pm.value();
  const [delta, ignoredSuffix] = pm.deltaInfo(params.recentlyAddedTextLen);
  return [s, delta, ignoredSuffix];
}

// ─── SIMPLE REASONING EXTRACTOR ──────────────────────────────
// Non-streaming variant — extracts reasoning from a complete text

export function extractReasoning(
  text: string,
  thinkTags: [string, string] = ["<think>", "</think>"],
): { text: string; reasoning: string } {
  const openIdx = text.indexOf(thinkTags[0]);
  if (openIdx === -1) return { text, reasoning: "" };

  const closeIdx = text.indexOf(thinkTags[1], openIdx + thinkTags[0].length);
  if (closeIdx === -1) {
    // Opening tag but no closing — everything after is reasoning
    return {
      text: text.substring(0, openIdx).trim(),
      reasoning: text.substring(openIdx + thinkTags[0].length).trim(),
    };
  }

  const reasoning = text
    .substring(openIdx + thinkTags[0].length, closeIdx)
    .trim();
  const beforeThink = text.substring(0, openIdx);
  const afterThink = text.substring(closeIdx + thinkTags[1].length);
  const cleanText = (beforeThink + afterThink).trim();

  return { text: cleanText, reasoning };
}

// ─── MULTI-TAG REASONING EXTRACTOR ───────────────────────────
// Handles multiple think blocks in one response

export function extractAllReasoningBlocks(
  text: string,
  thinkTags: [string, string] = ["<think>", "</think>"],
): { text: string; reasoningBlocks: string[] } {
  const blocks: string[] = [];
  let remaining = text;
  let cleanText = "";
  let searchFrom = 0;

  while (true) {
    const openIdx = remaining.indexOf(thinkTags[0], searchFrom);
    if (openIdx === -1) {
      cleanText += remaining.substring(searchFrom);
      break;
    }
    cleanText += remaining.substring(searchFrom, openIdx);

    const closeIdx = remaining.indexOf(
      thinkTags[1],
      openIdx + thinkTags[0].length,
    );
    if (closeIdx === -1) {
      blocks.push(remaining.substring(openIdx + thinkTags[0].length).trim());
      break;
    }

    blocks.push(
      remaining
        .substring(openIdx + thinkTags[0].length, closeIdx)
        .trim(),
    );
    searchFrom = closeIdx + thinkTags[1].length;
  }

  return { text: cleanText.trim(), reasoningBlocks: blocks };
}

// ─── XML TOOL TAG HELPERS ────────────────────────────────────
// Ported from Void's extractGrammar.ts — streaming XML tool extraction

function findPartiallyWrittenToolTagAtEnd(
  text: string,
  toolTags: string[],
): string | null {
  for (const tag of toolTags) {
    for (let len = 1; len < tag.length; len++) {
      const partial = tag.substring(0, len);
      if (text.endsWith(partial)) {
        return partial;
      }
    }
  }
  return null;
}

function findIndexOfAny(
  text: string,
  tags: string[],
): [number, string] | null {
  let bestIdx = Infinity;
  let bestTag = "";
  for (const tag of tags) {
    const idx = text.indexOf(tag);
    if (idx !== -1 && idx < bestIdx) {
      bestIdx = idx;
      bestTag = tag;
    }
  }
  return bestIdx === Infinity ? null : [bestIdx, bestTag];
}

// ─── STREAMING CONTEXT HELPER ────────────────────────────────
// Utility for building streaming-aware context in Foreman's pipeline

export interface StreamingReasoningContext {
  hasReasoning: boolean;
  reasoningLength: number;
  textLength: number;
  thinkTagsUsed: [string, string];
  blocksExtracted: number;
}

export function analyzeReasoningContent(
  text: string,
  thinkTags: [string, string] = ["<think>", "</think>"],
): StreamingReasoningContext {
  const { text: cleanText, reasoningBlocks } = extractAllReasoningBlocks(
    text,
    thinkTags,
  );
  return {
    hasReasoning: reasoningBlocks.length > 0,
    reasoningLength: reasoningBlocks.reduce((sum, b) => sum + b.length, 0),
    textLength: cleanText.length,
    thinkTagsUsed: thinkTags,
    blocksExtracted: reasoningBlocks.length,
  };
}

// ─── TRIM HELPERS ────────────────────────────────────────────

export function trimBeforeAndAfterNewLines(s: string): string {
  if (!s) return s;
  const firstNewLineIndex = s.indexOf("\n");
  if (
    firstNewLineIndex !== -1 &&
    s.substring(0, firstNewLineIndex).trim() === ""
  ) {
    s = s.substring(firstNewLineIndex + 1, Infinity);
  }
  const lastNewLineIndex = s.lastIndexOf("\n");
  if (
    lastNewLineIndex !== -1 &&
    s.substring(lastNewLineIndex + 1, Infinity).trim() === ""
  ) {
    s = s.substring(0, lastNewLineIndex);
  }
  return s;
}
