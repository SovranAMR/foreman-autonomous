/**
 * FOREMAN — Formal State Machine Harness (P01-B03)
 *
 * Probe seam: measures live orchestrator ↔ StateManager alignment without
 * running a full LLM pipeline.
 */

import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import formalStateMachineFixture from "./fixtures/forge-formal-state-machine-v1.json" with { type: "json" };
import { StateManager, InvalidTransitionError, MissingReasonError } from "./state.js";
import { VALID_TRANSITIONS, type SystemState } from "./types.js";
import {
  getForgeP01B02ToB03Handoff,
  summarizeBehaviorMapContractCoverage,
  getActivePipelineBehaviorMapContract,
} from "./forge-pipeline-behavior-map.js";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  validateFormalStateMachineFixture,
  validateFormalStateMachineFixtureAgainstContract,
  validateFormalStateMachineProbeMatrix,
  validateFormalStateMachineBoundaryProbeMatrix,
  validateFormalStateMachineFailureRecoveryProbeMatrix,
  summarizeFormalStateMachineMatrix,
  buildFormalStateMachineProbeEvidence,
  buildFormalStateMachineProbeTelemetry,
  buildFormalStateMachineProvenance,
  buildFormalStateMachineRunRecord,
  validateFormalStateMachineRunRecord,
  validateFormalStateMachineFailureRecoveryRunRecord,
  listFormalStateMachineFailureRecoveryProbeIds,
  getActiveFormalStateMachineContract,
  listFormalStateMachineProbesByCategory,
  detectFormalStateMachineProbeRegression,
  validateForgeFormalStateMachineGuard,
  FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES,
  FORMAL_STATE_MACHINE_CATEGORIES,
  type FormalStateMachineCategory,
  type FormalStateMachineFixture,
  type FormalStateMachineProbeResult,
  type FormalStateMachineProbeSummary,
  type FormalStateMachineProbeMatrixValidationResult,
  type FormalStateMachineRunRecord,
  type FormalStateMachineProbeDisposition,
  type FormalStateMachineProbeRegressionReport,
  type FormalStateMachineGuardCheckResult,
} from "./forge-formal-state-machine.js";

export type {
  FormalStateMachineFixture,
  FormalStateMachineProbeResult,
  FormalStateMachineProbeSummary,
  FormalStateMachineContract,
  FormalStateMachineProbeContract,
  FormalStateMachineProbeMatrixValidationResult,
} from "./forge-formal-state-machine.js";

export {
  validateFormalStateMachineFixture,
  validateFormalStateMachineFixtureAgainstContract,
  validateFormalStateMachineProbeMatrix,
  summarizeFormalStateMachineMatrix,
  getActiveFormalStateMachineContract,
  getFormalStateMachineCategoryContract,
  listFormalStateMachineContractProbeIds,
  listFormalStateMachineProbesByDisposition,
  listFormalStateMachineProbesByCategory,
  validateFormalStateMachineBoundaryProbeMatrix,
  validateFormalStateMachineFailureRecoveryProbeMatrix,
  summarizeFormalStateMachineContractCoverage,
  FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES,
  FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1,
  FORMAL_STATE_MACHINE_CATEGORIES,
  buildFormalStateMachineProbeEvidence,
  buildFormalStateMachineProbeTelemetry,
  buildFormalStateMachineProvenance,
  buildFormalStateMachineRunRecord,
  validateFormalStateMachineRunRecord,
  validateFormalStateMachineFailureRecoveryRunRecord,
  listFormalStateMachineFailureRecoveryProbeIds,
  runFormalStateMachinePropertyChecks,
  runFormalStateMachineFuzzValidation,
  runFormalStateMachineRunRecordFuzzValidation,
  createFormalStateMachineFuzzRng,
  detectFormalStateMachineProbeRegression,
  validateForgeFormalStateMachineGuard,
  type FormalStateMachineRunRecord,
  type FormalStateMachineProbeRegressionReport,
  type FormalStateMachineGuardCheckResult,
} from "./forge-formal-state-machine.js";

export type {
  FormalStateMachineProbeRegressionReport,
  FormalStateMachineGuardCheckResult,
} from "./forge-formal-state-machine.js";

export interface ForgeFormalStateMachineRegressionResult {
  passed: boolean;
  record: FormalStateMachineRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: FormalStateMachineProbeRegressionReport | null;
  guard: FormalStateMachineGuardCheckResult;
  detail: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): FormalStateMachineProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function typesSource(): string {
  return readSrc("types.ts");
}

function hasOrchestratorTransition(state: SystemState): boolean {
  const src = orchestratorSource();
  return (
    src.includes(`transition("${state}"`) ||
    src.includes(`transition('${state}'`)
  );
}

function allSystemStates(): SystemState[] {
  const match = typesSource().match(
    /export type SystemState =([\s\S]*?);/,
  );
  if (!match) return [];
  const names = [...match[1].matchAll(/\|\s*"([^"]+)"/g)].map(m => m[1] as SystemState);
  return names;
}

function probeTransitionGraph(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  switch (id) {
    case "fsm.graph_all_states_have_exits": {
      const states = allSystemStates();
      const missing = states.filter(
        s => (VALID_TRANSITIONS[s]?.length ?? 0) === 0,
      );
      return probe(
        id,
        category,
        expected,
        missing.length === 0,
        `states=${states.length}, missing_exits=${missing.join(",") || "none"}`,
        "Every SystemState in VALID_TRANSITIONS has ≥1 exit",
      );
    }
    case "fsm.graph_idle_single_entry": {
      const targets = VALID_TRANSITIONS.idle ?? [];
      const ok = targets.length === 1 && targets[0] === "visioning";
      return probe(
        id,
        category,
        expected,
        ok,
        `idle_targets=${targets.join(",")}`,
        "idle → [visioning] only",
      );
    }
    case "fsm.graph_complete_to_idle": {
      const targets = VALID_TRANSITIONS.complete ?? [];
      const ok = targets.length === 1 && targets[0] === "idle";
      return probe(
        id,
        category,
        expected,
        ok,
        `complete_targets=${targets.join(",")}`,
        "complete → [idle] only",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown transition_graph probe");
  }
}

function probeStateInvariant(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  const root = mkdtempSync(join(tmpdir(), "forge-fsm-invariant-"));
  try {
    const sm = StateManager.create(root, "fsm-invariant", false);

    switch (id) {
      case "fsm.invariant_rejects_empty_reason": {
        let rejected = false;
        try {
          sm.transition("visioning", "");
        } catch (err) {
          rejected = err instanceof MissingReasonError;
        }
        return probe(
          id,
          category,
          expected,
          rejected,
          `rejected=${rejected}`,
          "Empty reason throws MissingReasonError",
        );
      }
      case "fsm.invariant_rejects_invalid": {
        let rejected = false;
        try {
          sm.transition("executing", "skip to execute");
        } catch (err) {
          rejected = err instanceof InvalidTransitionError;
        }
        return probe(
          id,
          category,
          expected,
          rejected && sm.current() === "idle",
          `rejected=${rejected}, state=${sm.current()}`,
          "idle→executing throws InvalidTransitionError without mutation",
        );
      }
      case "fsm.invariant_can_transition": {
        sm.transition("visioning", "start");
        const ok =
          sm.canTransition("decomposing") === true &&
          sm.canTransition("executing") === false;
        return probe(
          id,
          category,
          expected,
          ok,
          `visioning→decomposing=${sm.canTransition("decomposing")}, visioning→executing=${sm.canTransition("executing")}`,
          "canTransition reflects VALID_TRANSITIONS membership",
        );
      }
      default:
        return probe(id, category, expected, false, "unknown state_invariant probe");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function probeOrchestratorSync(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  const stateByProbe: Record<string, SystemState> = {
    "fsm.orch_visioning": "visioning",
    "fsm.orch_decomposing": "decomposing",
    "fsm.orch_researching": "researching",
    "fsm.orch_atomizing": "atomizing",
    "fsm.orch_executing": "executing",
    "fsm.orch_reflecting": "reflecting",
    "fsm.orch_verifying": "verifying",
    "fsm.orch_complete": "complete",
  };

  const state = stateByProbe[id];
  if (!state) {
    return probe(id, category, expected, false, "unknown orchestrator_sync probe");
  }

  const present = hasOrchestratorTransition(state);
  return probe(
    id,
    category,
    expected,
    present,
    `transition_${state}=${present}`,
    `orchestrator.ts calls state.transition("${state}", ...)`,
  );
}

function probeFailureState(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  switch (id) {
    case "fsm.orch_blocked_sync": {
      const present = hasOrchestratorTransition("blocked");
      return probe(
        id,
        category,
        expected,
        present,
        `transition_blocked=${present}`,
        'orchestrator.ts calls state.transition("blocked", ...) on worker block',
      );
    }
    case "fsm.orch_awaiting_human_sync": {
      const present = hasOrchestratorTransition("awaiting_human");
      return probe(
        id,
        category,
        expected,
        present,
        `transition_awaiting_human=${present}`,
        'orchestrator.ts calls state.transition("awaiting_human", ...) for human gates',
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_state probe");
  }
}

function probeRecoveryState(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  const root = mkdtempSync(join(tmpdir(), "forge-fsm-recovery-"));
  try {
    const sm = StateManager.create(root, "fsm-recovery", false);

    switch (id) {
      case "fsm.recovery_blocked_to_decomposing": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        sm.transition("decomposing", "replan after block");
        return probe(
          id,
          category,
          expected,
          sm.current() === "decomposing",
          `state=${sm.current()}`,
          "blocked→decomposing recovery succeeds in StateManager",
        );
      }
      case "fsm.recovery_awaiting_to_executing": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        sm.transition("awaiting_human", "needs approval");
        sm.transition("executing", "human approved");
        return probe(
          id,
          category,
          expected,
          sm.current() === "executing",
          `state=${sm.current()}`,
          "awaiting_human→executing resume succeeds in StateManager",
        );
      }
      case "fsm.nogo_blocked_rejects_complete": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        let rejected = false;
        try {
          sm.transition("complete", "skip to complete from blocked");
        } catch (err) {
          rejected = err instanceof InvalidTransitionError;
        }
        return probe(
          id,
          category,
          expected,
          rejected && sm.current() === "blocked",
          `rejected=${rejected}, state=${sm.current()}`,
          "blocked→complete throws InvalidTransitionError without mutation",
        );
      }
      case "fsm.nogo_awaiting_rejects_verifying": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        sm.transition("awaiting_human", "needs approval");
        let rejected = false;
        try {
          sm.transition("verifying", "skip verify from awaiting");
        } catch (err) {
          rejected = err instanceof InvalidTransitionError;
        }
        return probe(
          id,
          category,
          expected,
          rejected && sm.current() === "awaiting_human",
          `rejected=${rejected}, state=${sm.current()}`,
          "awaiting_human→verifying throws InvalidTransitionError without mutation",
        );
      }
      default:
        return probe(id, category, expected, false, "unknown recovery_state probe");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function probeBaselineLink(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  switch (id) {
    case "fsm.b02_handoff_target": {
      const handoff = getForgeP01B02ToB03Handoff();
      const ok =
        handoff.targetBlock.blockId === "P01-B03" &&
        handoff.targetBlock.entryAtom === "P01-B03-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        "B02→B03 handoff entry atom is P01-B03-A01",
      );
    }
    case "fsm.b02_behavior_map_sealed": {
      const handoff = getForgeP01B02ToB03Handoff();
      const coverage = summarizeBehaviorMapContractCoverage(getActivePipelineBehaviorMapContract());
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActivePipelineBehaviorMapContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B02 handoff probe count matches active behavior map contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function reachComplete(sm: StateManager): void {
  sm.transition("visioning", "start");
  sm.transition("decomposing", "vision done");
  sm.transition("executing", "atoms ready");
  sm.transition("verifying", "verify batch");
  sm.transition("complete", "pipeline done");
}

function probeBoundary(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  const root = mkdtempSync(join(tmpdir(), "forge-fsm-boundary-"));
  try {
    const sm = StateManager.create(root, "fsm-boundary", false);

    switch (id) {
      case "fsm.boundary_reflecting_replan_visioning": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("verifying", "verify batch");
        sm.transition("reflecting", "batch done");
        sm.transition("visioning", "replan from reflection");
        return probe(
          id,
          category,
          expected,
          sm.current() === "visioning",
          `state=${sm.current()}`,
          "reflecting→visioning replan edge succeeds in StateManager",
        );
      }
      case "fsm.boundary_verifying_terminal_complete": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("verifying", "verify batch");
        sm.transition("complete", "pipeline done");
        return probe(
          id,
          category,
          expected,
          sm.current() === "complete",
          `state=${sm.current()}`,
          "verifying→complete terminal edge succeeds in StateManager",
        );
      }
      case "fsm.boundary_blocked_escalate_awaiting_human": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        sm.transition("awaiting_human", "needs approval");
        return probe(
          id,
          category,
          expected,
          sm.current() === "awaiting_human",
          `state=${sm.current()}`,
          "blocked→awaiting_human escalation edge succeeds in StateManager",
        );
      }
      case "fsm.boundary_complete_restart_idle": {
        reachComplete(sm);
        sm.transition("idle", "new session");
        return probe(
          id,
          category,
          expected,
          sm.current() === "idle",
          `state=${sm.current()}`,
          "complete→idle restart edge succeeds in StateManager",
        );
      }
      case "fsm.boundary_rejects_idle_to_complete": {
        let rejected = false;
        try {
          sm.transition("complete", "skip pipeline");
        } catch (err) {
          rejected = err instanceof InvalidTransitionError;
        }
        return probe(
          id,
          category,
          expected,
          rejected && sm.current() === "idle",
          `rejected=${rejected}, state=${sm.current()}`,
          "idle→complete throws InvalidTransitionError without mutation",
        );
      }
      case "fsm.boundary_rejects_complete_to_executing": {
        reachComplete(sm);
        let rejected = false;
        try {
          sm.transition("executing", "invalid restart");
        } catch (err) {
          rejected = err instanceof InvalidTransitionError;
        }
        return probe(
          id,
          category,
          expected,
          rejected && sm.current() === "complete",
          `rejected=${rejected}, state=${sm.current()}`,
          "complete→executing throws InvalidTransitionError without mutation",
        );
      }
      default:
        return probe(id, category, expected, false, "unknown boundary probe");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runSingleProbe(
  id: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
): FormalStateMachineProbeResult {
  switch (category) {
    case "transition_graph":
      return probeTransitionGraph(id, category, expected);
    case "state_invariant":
      return probeStateInvariant(id, category, expected);
    case "orchestrator_sync":
      return probeOrchestratorSync(id, category, expected);
    case "failure_state":
      return probeFailureState(id, category, expected);
    case "recovery_state":
      return probeRecoveryState(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadFormalStateMachineFixture(): FormalStateMachineFixture {
  return formalStateMachineFixture as FormalStateMachineFixture;
}

function enrichProbeWithContractCriterion(
  result: FormalStateMachineProbeResult,
  criterion: string | undefined,
): FormalStateMachineProbeResult {
  if (!criterion) return result;
  return { ...result, criterion };
}

export function runFormalStateMachineProbes(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineProbeResult[] {
  const contract = getActiveFormalStateMachineContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const result = runSingleProbe(entry.id, entry.category, entry.expected);
    return enrichProbeWithContractCriterion(result, contractProbe?.criterion);
  });
}

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function runFormalStateMachineProbeWithTiming(
  entry: FormalStateMachineFixture["probes"][number],
  contractProbe:
    | { criterion: string; disposition: FormalStateMachineProbeDisposition }
    | undefined,
  sequenceIndex: number,
): {
  result: FormalStateMachineProbeResult;
  durationMs: number;
  disposition: FormalStateMachineProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected);
  const enriched = enrichProbeWithContractCriterion(result, contractProbe?.criterion);
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildFormalStateMachineRecordFromEntries(
  entries: FormalStateMachineFixture["probes"],
  fixture: FormalStateMachineFixture,
  contract: ReturnType<typeof getActiveFormalStateMachineContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly FormalStateMachineCategory[];
  },
): FormalStateMachineRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildFormalStateMachineProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildFormalStateMachineProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runFormalStateMachineProbeWithTiming(
      entry,
      contractProbe,
      sequenceIndex,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildFormalStateMachineProbeEvidence(
        result.id,
        result.category,
        result.expected,
        result.actual,
        result.aligned,
        criterion,
        result.detail,
        disposition,
      ),
    );
    telemetry.push(
      buildFormalStateMachineProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildFormalStateMachineProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildFormalStateMachineRunRecord(provenance, evidence, telemetry);
}

/** Run all FSM probes and emit auditable evidence, telemetry and provenance (P01-B03-A06). */
export function runFormalStateMachineProbesWithRecord(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineRunRecord {
  const contract = getActiveFormalStateMachineContract();
  return buildFormalStateMachineRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P01-B03-A06). */
export function runFormalStateMachineFailureRecoverySliceWithRecord(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineRunRecord {
  const contract = getActiveFormalStateMachineContract();
  const failureRecoveryIds = new Set(listFormalStateMachineFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildFormalStateMachineRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P01-B03-A06",
    sliceCategories: FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES,
  });
}

export interface FormalStateMachineProductionSliceResult {
  atom: "P01-B03-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: FormalStateMachineProbeResult[];
  summary: FormalStateMachineProbeSummary;
  matrixValidation: FormalStateMachineProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: fixture ↔ contract validation, contract-wired probe
 * execution, and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runFormalStateMachineProductionSlice(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineProductionSliceResult {
  const contract = getActiveFormalStateMachineContract();
  const fixtureValidation = validateFormalStateMachineFixture(fixture);
  const contractValidation = validateFormalStateMachineFixtureAgainstContract(fixture, contract);
  const results = runFormalStateMachineProbes(fixture);
  const summary = summarizeFormalStateMachineMatrix(results);
  const matrixValidation = validateFormalStateMachineProbeMatrix(results, contract);

  return {
    atom: "P01-B03-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface FormalStateMachineBoundarySliceResult {
  atom: "P01-B03-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: FormalStateMachineProbeResult[];
  boundaryResults: FormalStateMachineProbeResult[];
  matrixValidation: FormalStateMachineProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired edge transitions and invalid-jump probes
 * on failure/recovery graph boundaries with zero unexpected mismatches.
 */
export function runFormalStateMachineBoundarySlice(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineBoundarySliceResult {
  const contract = getActiveFormalStateMachineContract();
  const results = runFormalStateMachineProbes(fixture);
  const boundaryProbes = listFormalStateMachineProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateFormalStateMachineBoundaryProbeMatrix(results, contract);

  return {
    atom: "P01-B03-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface FormalStateMachineFailureRecoverySliceResult {
  atom: "P01-B03-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: FormalStateMachineProbeResult[];
  failureRecoveryResults: FormalStateMachineProbeResult[];
  matrixValidation: FormalStateMachineProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery/NO-GO slice: contract-wired failure_state gaps, recovery paths,
 * and NO-GO rejection probes with zero unexpected mismatches.
 */
export function runFormalStateMachineFailureRecoverySlice(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineFailureRecoverySliceResult {
  const contract = getActiveFormalStateMachineContract();
  const results = runFormalStateMachineProbes(fixture);
  const failureRecoveryProbes = FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listFormalStateMachineProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateFormalStateMachineFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P01-B03-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

export function listFormalStateMachineKnownGaps(
  results: FormalStateMachineProbeResult[] = runFormalStateMachineProbes(),
): FormalStateMachineProbeResult[] {
  return summarizeFormalStateMachineMatrix(results).knownGaps;
}

export function listFormalStateMachineProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineFixture["probes"] {
  return fixture.probes.filter(p => p.expected === expected);
}

/**
 * Execute formal state machine probes, validate run record, and optionally detect regression vs prior run.
 * Forge pipeline integration gate (P01-B03-A08).
 */
export function runForgeFormalStateMachineRegressionGate(
  priorRecord?: FormalStateMachineRunRecord,
): ForgeFormalStateMachineRegressionResult {
  const record = runFormalStateMachineProbesWithRecord();
  const validation = validateFormalStateMachineRunRecord(record);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord
    ? detectFormalStateMachineProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeFormalStateMachineGuard(record, { totalCostUsd: 0, llmCalls: 0 });
  const passed = recordValid && !alignmentRegression && guard.passed;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  return {
    passed,
    record,
    recordValid,
    validationIssues,
    probeRegression,
    guard,
    detail: detailParts.join(" | "),
  };
}
