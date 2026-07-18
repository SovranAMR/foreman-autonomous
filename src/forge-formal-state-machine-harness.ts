/**
 * FOREMAN — Formal State Machine Harness (P01-B03-A01)
 *
 * Probe seam: measures live orchestrator ↔ StateManager alignment without
 * running a full LLM pipeline.
 */

import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
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
  summarizeFormalStateMachineMatrix,
  FORMAL_STATE_MACHINE_CATEGORIES,
  type FormalStateMachineCategory,
  type FormalStateMachineFixture,
  type FormalStateMachineProbeResult,
  type FormalStateMachineProbeSummary,
} from "./forge-formal-state-machine.js";

export type {
  FormalStateMachineFixture,
  FormalStateMachineProbeResult,
  FormalStateMachineProbeSummary,
} from "./forge-formal-state-machine.js";

export {
  validateFormalStateMachineFixture,
  summarizeFormalStateMachineMatrix,
  FORMAL_STATE_MACHINE_CATEGORIES,
} from "./forge-formal-state-machine.js";

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
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadFormalStateMachineFixture(): FormalStateMachineFixture {
  return formalStateMachineFixture as FormalStateMachineFixture;
}

export function runFormalStateMachineProbes(
  fixture: FormalStateMachineFixture = loadFormalStateMachineFixture(),
): FormalStateMachineProbeResult[] {
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected),
  );
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
