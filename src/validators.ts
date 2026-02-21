/**
 * FOREMAN — Validators
 *
 * Thought tamamlanmadan önce çalışan doğrulama kuralları.
 * Foreman'ın disiplin guardrail'ı — bu kuralları geçemeyen
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
 * Reasoning boş olamaz.
 * Tüm katmanlar için geçerli.
 */
export function validateReasoning(thought: Thought): ValidationResult {
  if (!thought.reasoning || thought.reasoning.trim().length === 0) {
    return fail("Reasoning is required and cannot be empty. Every thought must explain WHY.");
  }
  return ok();
}

/**
 * Output boş olamaz (done durumunda).
 */
export function validateOutput(thought: Thought): ValidationResult {
  if (thought.status === "done" && (!thought.output || thought.output.trim().length === 0)) {
    return fail("Output is required for completed thoughts. What did this thought produce?");
  }
  return ok();
}

/**
 * Confidence 0-1 arasında olmalı.
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
    return ok(); // sadece worker katmanı için
  }

  if (thought.status !== "done") {
    return ok(); // henüz done değilse kontrol etme
  }

  if (!thought.workerProtocol) {
    return fail("Worker thoughts require a completed WorkerProtocol before marking as done.");
  }

  return validateProtocolSteps(thought.workerProtocol);
}

/**
 * WorkerProtocol'ün 8 adımının hepsi dolu olmalı.
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
  for (const step of steps) {
    const value = protocol[step];
    if (!value || value.trim().length === 0) {
      errors.push(`WorkerProtocol.${step} is required and cannot be empty.`);
    }
  }

  return errors.length > 0 ? { valid: false, errors } : ok();
}

// ─── COMPOSITE VALIDATOR ─────────────────────────────────────

/**
 * Bir thought'un "done" olabilirliğini kontrol et.
 * Tüm kuralları birlikte çalıştırır.
 */
export function validateThoughtCompletion(thought: Thought): ValidationResult {
  return merge(
    validateReasoning(thought),
    validateOutput(thought),
    validateConfidence(thought),
    validateWorkerProtocol(thought),
  );
}
