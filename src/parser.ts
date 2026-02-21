/**
 * FOREMAN — Response Parser
 *
 * LLM çıktılarını yapısal verilere dönüştürür.
 * Her katmanın beklediği format farklı — parser her formatı bilir.
 * Parse başarısızsa retry veya BLOCK sinyali üretir.
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
    // Boş stopFields — son alana kadar yakala
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
 * Numaralı liste parse et.
 * "Block 1: ...", "1. ...", "- ...", "* ..." formatlarını tanır.
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
 * Vizyoner çıktısını parse et.
 * Beklenen: REASONING, OUTPUT, CONFIDENCE, NEEDS_RESEARCH
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
 * Stratejist decompose çıktısını parse et.
 * Beklenen: REASONING, OUTPUT (numaralı bloklar), CONFIDENCE
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
    // Kural: max 8 blok. Fazlasını kes.
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
 * Araştırmacı çıktısını parse et.
 * Beklenen: FINDINGS, RELEVANCE, RISKS
 * REASONING opsiyonel (araştırmacı bazen doğrudan bulguya geçer)
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
 * Stratejist atomize çıktısını parse et.
 * Beklenen: OUTPUT (numaralı atomlar), CONFIDENCE
 */
export function parseAtomizeResponse(text: string): { ok: true; data: AtomizeParseResult } | { ok: false; error: ParseError } {
  const outputRaw = extractField(text, "OUTPUT", ["CONFIDENCE", "NEEDS_RESEARCH"]);
  const confidence = extractNumber(text, "CONFIDENCE");

  // OUTPUT yoksa tüm text'ten parse dene
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
 * Worker çıktısını parse et.
 * Beklenen: STEP1_READ ... STEP8_REPORT, CONFIDENCE
 * 8 adımın HEPSİ zorunlu.
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
 * Katmana göre doğru parser'ı seç ve çalıştır.
 * phase bilgisi hangi parse formatının kullanılacağını belirler.
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
 * Parse başarısızsa LLM'e geri gönderilecek düzeltme prompt'u oluştur.
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
