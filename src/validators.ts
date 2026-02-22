/**
 * FOREMAN — Validators
 *
 * Validation rules that run before a thought is completed.
 * Foreman's discipline guardrail — thoughts that can't pass these rules
 * thought "done" olamaz.
 */

import type { Thought, WorkerProtocol } from "./types.js";

// ─── RESULT TYPE ──────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors };
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap(r => r.errors);
  return { valid: errors.length === 0, errors };
}

// ─── INDIVIDUAL VALIDATORS ───────────────────────────────────

/**
 * Reasoning cannot be empty.
 * Applies to all layers.
 */
export function validateReasoning(thought: Thought): ValidationResult {
  if (!thought.reasoning || thought.reasoning.trim().length === 0) {
    return fail("Reasoning is required and cannot be empty. Every thought must explain WHY.");
  }
  return ok();
}

/**
 * Output cannot be empty (in done state).
 */
export function validateOutput(thought: Thought): ValidationResult {
  if (thought.status === "done" && (!thought.output || thought.output.trim().length === 0)) {
    return fail("Output is required for completed thoughts. What did this thought produce?");
  }
  return ok();
}

/**
 * Confidence must be between 0-1.
 */
export function validateConfidence(thought: Thought): ValidationResult {
  if (thought.confidence < 0 || thought.confidence > 1) {
    return fail(`Confidence must be between 0 and 1. Got: ${thought.confidence}`);
  }
  return ok();
}

/**
 * Worker thought'u workerProtocol olmadan done olamaz.
 */
export function validateWorkerProtocol(thought: Thought): ValidationResult {
  if (thought.layer !== "worker") {
    return ok(); // only for worker layer
  }

  if (thought.status !== "done") {
    return ok(); // don't check if not done yet
  }

  if (!thought.workerProtocol) {
    return fail("Worker thoughts require a completed WorkerProtocol before marking as done.");
  }

  return validateProtocolSteps(thought.workerProtocol);
}

/**
 * All 8 steps of WorkerProtocol must be filled.
 */
export function validateProtocolSteps(protocol: WorkerProtocol): ValidationResult {
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

  const errors: string[] = [];

  // TRIVIAL content patterns — these indicate the worker didn't actually think
  const trivialPatterns = [
    /^n\/?a$/i,
    /^none$/i,
    /^todo$/i,
    /^will do$/i,
    /^standard/i,
    /^as expected$/i,
    /^no (?:side )?effects?$/i,
    /^it (?:should |will )?work/i,
    /^read the file/i,
  ];

  // Minimum content length per step (tactical reasoning requires substance)
  const minLengths: Record<string, number> = {
    step1_read: 20,     // Must describe what was found
    step2_context: 15,  // Must describe surroundings
    step3_impact: 10,   // Can be short if genuinely no impact
    step4_decide: 20,   // Must specify file + approach
    step5_predict: 15,  // Must describe expected outcome
    step6_execute: 20,  // Must describe what was done
    step7_verify: 10,   // Can be short if build passed
    step8_report: 10,   // Summary
  };

  for (const step of steps) {
    const value = protocol[step];
    if (!value || value.trim().length === 0) {
      errors.push(`WorkerProtocol.${step} is required and cannot be empty.`);
      continue;
    }

    const trimmed = value.trim();

    // Check for trivial content
    if (trivialPatterns.some(p => p.test(trimmed))) {
      errors.push(`WorkerProtocol.${step} contains trivial content ("${trimmed.slice(0, 30)}"). Worker must provide genuine tactical reasoning.`);
    }

    // Check minimum length
    const minLen = minLengths[step] ?? 10;
    if (trimmed.length < minLen) {
      errors.push(`WorkerProtocol.${step} is too short (${trimmed.length} chars, min ${minLen}). Tactical reasoning requires substance.`);
    }
  }

  // Cross-step consistency checks
  if (protocol.step5_predict && protocol.step7_verify) {
    // If predict says "should work" and verify says "works" — too vague, but allow if verify has build output
    const verifyHasEvidence = /pass|fail|error|success|exit|ok|✔|✖|\d+ test/i.test(protocol.step7_verify);
    if (!verifyHasEvidence && protocol.step7_verify.trim().length < 30) {
      errors.push("WorkerProtocol.step7_verify should include concrete evidence (build output, test results, visual check).");
    }
  }

  return errors.length > 0 ? { valid: false, errors } : ok();
}

// ─── COMPOSITE VALIDATOR ─────────────────────────────────────

/**
 * Check whether a thought can be marked "done".
 * Runs all rules together.
 */
export function validateThoughtCompletion(thought: Thought): ValidationResult {
  return merge(
    validateReasoning(thought),
    validateOutput(thought),
    validateConfidence(thought),
    validateWorkerProtocol(thought),
  );
}
