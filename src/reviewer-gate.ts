/**
 * FOREMAN — Reviewer Gate
 *
 * Post-execution tribunal: a SEPARATE LLM (different model/provider)
 * reviews the Worker's output against the vision document.
 *
 * This breaks bias — worker can't grade its own homework.
 * Uses a different model (gemini-pro) to avoid echo chamber.
 *
 * Verdicts:
 * - PASS: Code aligns with vision, tactical reasoning is genuine
 * - REJECT: Shallow reasoning, vision violations, or code quality issues
 * - NEEDS_REVISION: Partially correct but needs specific fixes
 */

import type { WorkerProtocol, Thought } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ReviewRequest {
  /** Worker's 8-step protocol output */
  protocol: WorkerProtocol;
  /** The atom task description */
  atom: string;
  /** The vision document (full, pinned) */
  visionDocument: string;
  /** Git diff of what actually changed */
  codeDiff?: string;
  /** Block context */
  block: string;
}

export type ReviewVerdict = "PASS" | "REJECT" | "NEEDS_REVISION";

export interface ReviewResult {
  verdict: ReviewVerdict;
  reasoning: string;
  violations: string[];
  suggestions: string[];
  /** Rejection feedback to send back to Worker on retry */
  rejectionFeedback?: string;
  confidence: number;
}

// ─── REVIEWER SYSTEM PROMPT ──────────────────────────────────

export const REVIEWER_SYSTEM_PROMPT = `You are the REVIEWER — the quality tribunal of a 4-layer AI agent orchestrator called Foreman.

## Your Role
You are an INDEPENDENT auditor. The Worker wrote code. You decide if it passes.
You use a DIFFERENT AI model than the Worker to avoid echo chamber bias.

## What You Audit

### 1. VISION COMPLIANCE (Highest Priority)
- Does the change respect the FORBIDDEN list in the vision document?
- Does it serve the FOCAL POINT or dilute it?
- Is the MOTION BUDGET being exceeded?
- Does it align with the EMOTION TARGET?

### 2. TACTICAL REASONING QUALITY
- Did the Worker actually READ the file? (or hallucinate contents?)
- Is STEP2_CONTEXT genuine? (or just "standard component"?)
- Is STEP3_IMPACT real analysis? (or lazy "no side effects"?)
- Is STEP7_VERIFY honest? (or "it works" without evidence?)

### 3. CODE QUALITY
- Does the diff show real changes? (or just whitespace/comments?)
- Are there obvious bugs or missing imports?
- Is there dead code or unnecessary complexity?

### 4. EVIDENCE TYPES
- **CODE DIFF** = standard git diff output (preferred, shows exact line changes)
- **FILESYSTEM EVIDENCE** = executor results when git diff is unavailable (project
  in a gitignored subtree). This includes write_file success/fail, file byte sizes,
  modification timestamps, and command outputs. Treat successful write_file operations
  with real file sizes as VALID evidence of code changes — do NOT reject solely
  because git diff is empty when filesystem evidence confirms the write.

## Verdicts
- PASS: Everything checks out. Ship it.
- REJECT: Vision violation, shallow reasoning, or broken code. Must retry.
- NEEDS_REVISION: Close but needs specific fixes. Provide clear feedback.

## Output Format (EXACT)
VERDICT: [PASS|REJECT|NEEDS_REVISION]
REASONING: [your audit analysis]
VIOLATIONS: [comma-separated list, or "None"]
SUGGESTIONS: [actionable feedback for the Worker]
CONFIDENCE: [0.0-1.0]`;

// ─── REVIEW FUNCTIONS ────────────────────────────────────────

/**
 * Build the review prompt for the LLM.
 */
export function buildReviewPrompt(request: ReviewRequest): string {
  const parts = [
    `== VISION DOCUMENT (the constitution — violations = REJECT) ==`,
    request.visionDocument,
    ``,
    `== ATOM TASK ==`,
    request.atom,
    ``,
    `== BLOCK CONTEXT ==`,
    request.block,
    ``,
    `== WORKER'S 8-STEP REPORT ==`,
    `STEP1_READ: ${request.protocol.step1_read}`,
    `STEP2_CONTEXT: ${request.protocol.step2_context}`,
    `STEP3_IMPACT: ${request.protocol.step3_impact}`,
    `STEP4_DECIDE: ${request.protocol.step4_decide}`,
    `STEP5_PREDICT: ${request.protocol.step5_predict}`,
    `STEP6_EXECUTE: ${request.protocol.step6_execute}`,
    `STEP7_VERIFY: ${request.protocol.step7_verify}`,
    `STEP8_REPORT: ${request.protocol.step8_report}`,
  ];

  if (request.codeDiff) {
    const isFilesystemEvidence = request.codeDiff.startsWith("[Filesystem evidence");
    parts.push(``, `== ${isFilesystemEvidence ? "FILESYSTEM EVIDENCE" : "CODE DIFF"} ==`, request.codeDiff.slice(0, 4000));
  }

  parts.push(
    ``,
    `Review this Worker output. Be BRUTAL. Check:`,
    `1. Does the code violate ANY item on the FORBIDDEN list?`,
    `2. Did the Worker genuinely read the file or hallucinate?`,
    `3. Is the tactical reasoning real or just format-filling?`,
    `4. Does STEP7_VERIFY contain actual evidence (build output, test results)?`,
    `5. Does this change serve the vision's EMOTION TARGET?`,
    ``,
    `IMPORTANT: When "FILESYSTEM EVIDENCE" is provided instead of "CODE DIFF":`,
    `- The project lives in a gitignored subtree; git diff is unavailable.`,
    `- Use the filesystem evidence (write_file results, file sizes, timestamps,`,
    `  command outputs like cat/wc/grep) as your ground truth.`,
    `- A successful write_file with a real file size and timestamp IS valid evidence`,
    `  that the file was written. Do NOT claim "hallucinated file read" when the`,
    `  evidence shows successful write_file and run_command operations.`,
    `- run_command results (cat, wc -l, grep -c, tail) are REAL filesystem reads.`,
    `  Their presence in STEP1_READ/STEP2_CONTEXT proves genuine file interaction.`,
    `- Focus your review on: (1) does the code serve the vision, (2) is the logic`,
    `  correct, (3) are there obvious bugs. Do NOT reject based on evidence format.`,
  );

  return parts.join("\n");
}

/**
 * Parse the Reviewer's LLM response into a structured ReviewResult.
 */
export function parseReviewResponse(text: string): ReviewResult {
  const verdictMatch = text.match(/VERDICT:\s*(PASS|REJECT|NEEDS_REVISION)/i);
  const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)(?=VIOLATIONS:|SUGGESTIONS:|CONFIDENCE:|$)/i);
  const violationsMatch = text.match(/VIOLATIONS:\s*([\s\S]*?)(?=SUGGESTIONS:|CONFIDENCE:|$)/i);
  const suggestionsMatch = text.match(/SUGGESTIONS:\s*([\s\S]*?)(?=CONFIDENCE:|$)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);

  const verdict = (verdictMatch?.[1]?.toUpperCase() as ReviewVerdict) ?? "REJECT";
  const reasoning = reasoningMatch?.[1]?.trim() ?? text.slice(0, 500);
  const violationsRaw = violationsMatch?.[1]?.trim() ?? "";
  const suggestionsRaw = suggestionsMatch?.[1]?.trim() ?? "";
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

  const violations = violationsRaw === "None" || violationsRaw.length === 0
    ? []
    : violationsRaw.split(/[,\n]/).map(v => v.trim()).filter(v => v.length > 0);

  const suggestions = suggestionsRaw.length === 0
    ? []
    : suggestionsRaw.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);

  return {
    verdict,
    reasoning,
    violations,
    suggestions,
    rejectionFeedback: verdict !== "PASS"
      ? `REVIEWER REJECTION:\n${reasoning}\n\nViolations: ${violations.join(", ") || "None"}\n\nFix these issues:\n${suggestions.join("\n")}`
      : undefined,
    confidence,
  };
}

/**
 * Quick local pre-check — catches obvious issues without LLM call.
 * Returns null if no issues found (proceed to LLM review).
 */
export function quickReviewCheck(protocol: WorkerProtocol, visionDocument: string): ReviewResult | null {
  const violations: string[] = [];

  // Extract FORBIDDEN items from vision document
  const forbiddenSection = visionDocument.match(/FORBIDDEN[^:]*:\s*([\s\S]*?)(?=\n##|\n\*\*|$)/i);
  if (forbiddenSection) {
    const forbiddenItems = forbiddenSection[1]
      .split(/\n/)
      .map(l => l.replace(/^[-*]\s*/, "").trim())
      .filter(l => l.length > 3);

    // F-5: Exclude step1_read and step2_context from FORBIDDEN matching
    // Worker often quotes vision FORBIDDEN rules in these steps as reference
    const executionText = [
      protocol.step4_decide, protocol.step5_predict,
      protocol.step6_execute, protocol.step7_verify, protocol.step8_report,
    ].join(" ").toLowerCase();

    for (const forbidden of forbiddenItems) {
      const keywords = forbidden.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      // Need at least 2 keywords to trigger
      if (keywords.length < 2) {
        // Single word forbidden - exact match required
        if (keywords.length === 1 && executionText.includes(keywords[0]!)) {
          violations.push(`FORBIDDEN violation: "${forbidden}" — exact match`);
        }
        continue;
      }
      const matched = keywords.filter(kw => executionText.includes(kw));
      const matchRatio = matched.length / keywords.length;
      if (matchRatio >= 0.6 && matched.length >= 2) {
        violations.push(`FORBIDDEN violation: "${forbidden}" — matched keywords: ${matched.join(", ")}`);
      }
    }
  }

  // F-12: Align with validators.ts — verify needs real evidence, not just "Looks good"
  const verifyLen = protocol.step7_verify.trim().length;
  if (verifyLen < 20) {
    violations.push(`STEP7_VERIFY too short (${verifyLen} chars) — must contain build/test evidence`);
  }

  // F-4: Add write-oriented patterns to avoid false positives on documentation/creative tasks
  if (/read the file|checked the code|looked at/i.test(protocol.step1_read) &&
    !/line \d|lines?\b|\d+ LOC|import|export|function|const |class |created|wrote|appended|bytes|chars|\d+\s*lines|wc|mkdir|touch/i.test(protocol.step1_read)) {
    violations.push("STEP1_READ appears to be hallucinated — no specific file content referenced");
  }

  if (violations.length > 0) {
    return {
      verdict: "REJECT",
      reasoning: `Quick review caught ${violations.length} issues without LLM call`,
      violations,
      suggestions: ["Fix the violations above and ensure genuine tactical reasoning"],
      rejectionFeedback: `QUICK REVIEW REJECTION:\n${violations.join("\n")}`,
      confidence: 0.9,
    };
  }

  return null; // No quick issues — proceed to full LLM review
}
