/**
 * FOREMAN — Response Parser
 *
 * Converts LLM outputs to structured data.
 * Each layer expects a different format — the parser knows every format.
 * If parse fails, produces a retry or BLOCK signal.
 */

import type { Layer, WorkerProtocol } from "./types.js";

// ─── PARSE RESULTS ───────────────────────────────────────────

export interface VisionParseResult {
  reasoning: string;
  output: string;
  confidence: number;
  needsResearch: boolean;
  researchQuery?: string;
}

export interface DecomposeParseResult {
  reasoning: string;
  blocks: string[];
  /** Per-block dependency indices (0-based). Empty array = no dependencies = can run in parallel. */
  blockDeps: number[][];
  confidence: number;
}

export interface ResearchParseResult {
  reasoning: string;
  findings: string;
  relevance: number;
  risks: string;
}

export interface AtomizeParseResult {
  atoms: string[];
  confidence: number;
}

export interface WorkerParseResult {
  protocol: WorkerProtocol;
  confidence: number;
}

export interface ParseError {
  missing: string[];
  raw: string;
}

// ─── GENERIC FIELD EXTRACTOR ─────────────────────────────────

function extractField(text: string, field: string, stopFields: string[] = []): string | null {
  let patternStr: string;
  if (stopFields.length > 0) {
    const stopPattern = stopFields.map(f => f + "\\s*[:.\\s]").join("|");
    patternStr = `${field}\\s*[:.\\s]\\s*([\\s\\S]*?)(?=${stopPattern}|$)`;
  } else {
    // Empty stopFields — capture until the last field
    patternStr = `${field}\\s*[:.\\s]\\s*([\\s\\S]*)$`;
  }

  const pattern = new RegExp(patternStr, "i");
  const match = text.match(pattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function extractNumber(text: string, field: string): number | null {
  const pattern = new RegExp(`${field}\\s*[:.]\\s*([\\d.]+)`, "i");
  const match = text.match(pattern);
  return match ? parseFloat(match[1]) : null;
}

function extractBoolean(text: string, field: string): boolean | null {
  const pattern = new RegExp(`${field}\\s*[:.]\\s*(true|false)`, "i");
  const match = text.match(pattern);
  return match ? match[1].toLowerCase() === "true" : null;
}

// ─── BLOCK / ATOM PARSER ─────────────────────────────────────

/**
 * Parse a numbered list.
 * Recognizes "Block 1: ...", "1. ...", "- ...", "* ..." formats.
 */
export function parseNumberedList(text: string): string[] {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:Block\s*\d+[:.]\s*|(?:Atom\s*\d+[:.]\s*)|(\d+)[.)]\s*|[-*]\s*)(.*)/i);
    if (match) {
      const content = match[2]?.trim() ?? trimmed;
      if (content.length > 5) {
        items.push(content);
      }
    }
  }

  return items;
}

// ─── LAYER-SPECIFIC PARSERS ──────────────────────────────────

/**
 * Parse visioner output.
 * Expected: REASONING, OUTPUT, CONFIDENCE, NEEDS_RESEARCH
 */
export function parseVisionResponse(text: string): { ok: true; data: VisionParseResult } | { ok: false; error: ParseError } {
  const reasoning = extractField(text, "REASONING", ["OUTPUT", "CONFIDENCE", "NEEDS_RESEARCH"]);
  const output = extractField(text, "OUTPUT", ["CONFIDENCE", "NEEDS_RESEARCH", "RESEARCH_QUERY"]);
  const confidence = extractNumber(text, "CONFIDENCE");
  const needsResearch = extractBoolean(text, "NEEDS_RESEARCH");

  const missing: string[] = [];
  if (!reasoning) missing.push("REASONING");
  if (!output) missing.push("OUTPUT");

  if (missing.length > 0) {
    return { ok: false, error: { missing, raw: text } };
  }

  return {
    ok: true,
    data: {
      reasoning: reasoning!,
      output: output!,
      confidence: confidence ?? 0.7,
      needsResearch: needsResearch ?? false,
      researchQuery: extractField(text, "RESEARCH_QUERY", []) ?? undefined,
    },
  };
}

/**
 * Parse strategist decompose output.
 * Expected: REASONING, OUTPUT (numbered blocks), CONFIDENCE
 */
export function parseDecomposeResponse(text: string): { ok: true; data: DecomposeParseResult } | { ok: false; error: ParseError } {
  const reasoning = extractField(text, "REASONING", ["OUTPUT", "CONFIDENCE"]);
  const outputRaw = extractField(text, "OUTPUT", ["CONFIDENCE", "NEEDS_RESEARCH"]);
  const confidence = extractNumber(text, "CONFIDENCE");

  const missing: string[] = [];
  if (!reasoning) missing.push("REASONING");
  if (!outputRaw) missing.push("OUTPUT");

  if (missing.length > 0) {
    return { ok: false, error: { missing, raw: text } };
  }

  const blocks = parseNumberedList(outputRaw!);

  if (blocks.length === 0) {
    return { ok: false, error: { missing: ["OUTPUT (no parseable blocks)"], raw: text } };
  }

  if (blocks.length > 8) {
    // Rule: max 8 blocks. Trim the excess.
    blocks.length = 8;
  }

  return {
    ok: true,
    data: {
      reasoning: reasoning!,
      blocks,
      confidence: confidence ?? 0.7,
    },
  };
}

/**
 * Parse researcher output.
 * Beklenen: FINDINGS, RELEVANCE, RISKS
 * REASONING optional (researcher sometimes goes directly to findings)
 */
export function parseResearchResponse(text: string): { ok: true; data: ResearchParseResult } | { ok: false; error: ParseError } {
  const reasoning = extractField(text, "REASONING", ["FINDINGS", "RELEVANCE", "RISKS"]);
  const findings = extractField(text, "FINDINGS", ["RELEVANCE", "RISKS"]);
  const relevance = extractNumber(text, "RELEVANCE");
  const risks = extractField(text, "RISKS", []);

  const missing: string[] = [];
  if (!findings) missing.push("FINDINGS");

  if (missing.length > 0) {
    return { ok: false, error: { missing, raw: text } };
  }

  return {
    ok: true,
    data: {
      reasoning: reasoning ?? "Direct research output",
      findings: findings!,
      relevance: relevance ?? 0.7,
      risks: risks ?? "None identified",
    },
  };
}

/**
 * Parse strategist atomize output.
 * Expected: OUTPUT (numbered atoms), CONFIDENCE
 */
export function parseAtomizeResponse(text: string): { ok: true; data: AtomizeParseResult } | { ok: false; error: ParseError } {
  const outputRaw = extractField(text, "OUTPUT", ["CONFIDENCE", "NEEDS_RESEARCH"]);
  const confidence = extractNumber(text, "CONFIDENCE");

  // If no OUTPUT, try parsing from full text
  const source = outputRaw ?? text;
  const atoms = parseNumberedList(source);

  if (atoms.length === 0) {
    return { ok: false, error: { missing: ["OUTPUT (no parseable atoms)"], raw: text } };
  }

  if (atoms.length > 6) {
    atoms.length = 6;
  }

  return {
    ok: true,
    data: {
      atoms,
      confidence: confidence ?? 0.7,
    },
  };
}

/**
 * Parse worker output.
 * Beklenen: STEP1_READ ... STEP8_REPORT, CONFIDENCE
 * ALL 8 steps are required.
 */
export function parseWorkerResponse(text: string): { ok: true; data: WorkerParseResult } | { ok: false; error: ParseError } {
  const steps: (keyof WorkerProtocol)[] = [
    "step1_read",
    "step2_context",
    "step3_impact",
    "step4_decide",
    "step5_predict",
    "step6_execute",
    "step7_verify",
    "step8_report",
  ];

  const fieldNames = [
    "STEP1_READ",
    "STEP2_CONTEXT",
    "STEP3_IMPACT",
    "STEP4_DECIDE",
    "STEP5_PREDICT",
    "STEP6_EXECUTE",
    "STEP7_VERIFY",
    "STEP8_REPORT",
  ];

  const allStopFields = [...fieldNames, "CONFIDENCE"];

  const protocol: Record<string, string> = {};
  const missing: string[] = [];

  for (let i = 0; i < fieldNames.length; i++) {
    const stopFields = allStopFields.slice(i + 1);
    const value = extractField(text, fieldNames[i], stopFields);

    if (!value) {
      missing.push(fieldNames[i]);
    } else {
      protocol[steps[i]] = value;
    }
  }

  if (missing.length > 0) {
    return { ok: false, error: { missing, raw: text } };
  }

  const confidence = extractNumber(text, "CONFIDENCE");

  return {
    ok: true,
    data: {
      protocol: protocol as unknown as WorkerProtocol,
      confidence: confidence ?? 0.7,
    },
  };
}

// ─── LAYER ROUTER ────────────────────────────────────────────

/**
 * Select and run the correct parser for the layer.
 * The phase info determines which parse format to use.
 */
export type ParsePhase = "vision" | "decompose" | "research" | "atomize" | "execute" | "reflect";

export function parseForPhase(phase: ParsePhase, text: string) {
  switch (phase) {
    case "vision":
    case "reflect":
      return parseVisionResponse(text);
    case "decompose":
      return parseDecomposeResponse(text);
    case "research":
      return parseResearchResponse(text);
    case "atomize":
      return parseAtomizeResponse(text);
    case "execute":
      return parseWorkerResponse(text);
  }
}

// ─── RETRY PROMPT ────────────────────────────────────────────

/**
 * Build correction prompt to send back to LLM if parse fails.
 */
export function buildRetryPrompt(error: ParseError, phase: ParsePhase): string {
  const formatGuide: Record<ParsePhase, string> = {
    vision: `Respond with EXACTLY this format:
REASONING: [your thought process]
OUTPUT: [your decision]
CONFIDENCE: [0.0-1.0]
NEEDS_RESEARCH: [true/false]`,

    decompose: `Respond with EXACTLY this format:
REASONING: [your decomposition logic]
OUTPUT:
1. [Block description]
2. [Block description]
...
CONFIDENCE: [0.0-1.0]`,

    research: `Respond with EXACTLY this format:
FINDINGS: [synthesized insights]
RELEVANCE: [0.0-1.0]
RISKS: [potential issues]`,

    atomize: `Respond with EXACTLY this format:
OUTPUT:
1. [Atomic task description]
2. [Atomic task description]
...
CONFIDENCE: [0.0-1.0]`,

    execute: `Respond with EXACTLY this format (ALL 8 steps required):
STEP1_READ: [what you found in the target file]
STEP2_CONTEXT: [what exists, dependencies]
STEP3_IMPACT: [side effects of this change]
STEP4_DECIDE: [exactly what to write and where]
STEP5_PREDICT: [expected result after change]
STEP6_EXECUTE: [what you did]
STEP7_VERIFY: [build/test result]
STEP8_REPORT: [summary]
CONFIDENCE: [0.0-1.0]`,

    reflect: `Respond with EXACTLY this format:
REASONING: [your review of work done]
OUTPUT: [assessment and recommendations]
CONFIDENCE: [0.0-1.0]`,
  };

  return `Your previous response was missing required fields: ${error.missing.join(", ")}

${formatGuide[phase]}

Please reformat your response. Do NOT change the content, just structure it correctly.

Your previous response was:
---
${error.raw.slice(0, 1000)}
---`;
}
