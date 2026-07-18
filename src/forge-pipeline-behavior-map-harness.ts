/**
 * FOREMAN — Pipeline Behavior Map Harness (P01-B02-A01)
 *
 * Probe seam: measures live orchestrator phase→behavior mapping without
 * running a full LLM pipeline.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import behaviorMapFixture from "./fixtures/forge-pipeline-behavior-map-v1.json" with { type: "json" };
import {
  buildDefaultBehaviorMapSourceBaseline,
  getActivePipelineBehaviorMapContract,
  validateBehaviorMapFixtureAgainstContract,
  type BehaviorMapProbeResult,
  type BehaviorMapProbeSummary,
  type ForgeAcceptanceOutcome,
  type PipelineBehaviorCategory,
  type PipelineBehaviorMapFixture,
} from "./forge-pipeline-behavior-map.js";

export type {
  BehaviorMapProbeResult,
  BehaviorMapProbeSummary,
  PipelineBehaviorMapFixture,
} from "./forge-pipeline-behavior-map.js";

export {
  getActivePipelineBehaviorMapContract,
  getBehaviorMapCategoryContract,
  listBehaviorMapProbeIds,
  listBehaviorMapProbesByDisposition,
  summarizeBehaviorMapContractCoverage,
  validateBehaviorMapFixtureAgainstContract,
  buildDefaultBehaviorMapSourceBaseline,
  PIPELINE_BEHAVIOR_CATEGORIES,
} from "./forge-pipeline-behavior-map.js";

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
  phase: string,
  category: PipelineBehaviorCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): BehaviorMapProbeResult {
  const actual = outcome(ok);
  return {
    id,
    phase,
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

function resumeSource(): string {
  return readSrc("pipeline-resume.ts");
}

function streamingSource(): string {
  return readSrc("streaming-pipeline.ts");
}

function typesSource(): string {
  return readSrc("types.ts");
}

function hasPhaseStart(orchestrator: string, phase: string): boolean {
  return (
    orchestrator.includes(`phase: "${phase}"`) ||
    orchestrator.includes(`phaseStart("${phase}"`) ||
    orchestrator.includes(`phase: '${phase}'`)
  );
}

function hasStateTransition(orchestrator: string, state: string): boolean {
  return orchestrator.includes(`transition("${state}"`);
}

function runSingleProbe(
  id: string,
  phase: string,
  category: PipelineBehaviorCategory,
  expected: ForgeAcceptanceOutcome,
  criterion?: string,
): BehaviorMapProbeResult {
  const orchestrator = orchestratorSource();
  const resume = resumeSource();
  const streaming = streamingSource();
  const types = typesSource();

  switch (id) {
    case "map.vision_phase_presence":
      return probe(id, phase, category, expected, hasPhaseStart(orchestrator, "vision"), `vision_start=${hasPhaseStart(orchestrator, "vision")}`, criterion);
    case "map.decompose_phase_presence":
      return probe(id, phase, category, expected, hasPhaseStart(orchestrator, "decompose"), `decompose_start=${hasPhaseStart(orchestrator, "decompose")}`, criterion);
    case "map.research_phase_presence":
      return probe(id, phase, category, expected, hasPhaseStart(orchestrator, "research"), `research_start=${hasPhaseStart(orchestrator, "research")}`, criterion);
    case "map.atomize_phase_presence":
      return probe(id, phase, category, expected, hasPhaseStart(orchestrator, "atomize"), `atomize_start=${hasPhaseStart(orchestrator, "atomize")}`, criterion);
    case "map.execute_phase_presence":
      return probe(id, phase, category, expected, hasPhaseStart(orchestrator, "execute"), `execute_start=${hasPhaseStart(orchestrator, "execute")}`, criterion);
    case "map.reflect_phase_presence":
      return probe(id, phase, category, expected, hasPhaseStart(orchestrator, "reflect"), `reflect_start=${hasPhaseStart(orchestrator, "reflect")}`, criterion);
    case "map.vision_state_sync":
      return probe(id, phase, category, expected, hasStateTransition(orchestrator, "visioning"), `visioning_transition=${hasStateTransition(orchestrator, "visioning")}`, criterion);
    case "map.decompose_state_sync":
      return probe(id, phase, category, expected, hasStateTransition(orchestrator, "decomposing"), `decomposing_transition=${hasStateTransition(orchestrator, "decomposing")}`, criterion);
    case "map.research_state_sync":
      return probe(id, phase, category, expected, hasStateTransition(orchestrator, "researching"), `researching_transition=${hasStateTransition(orchestrator, "researching")}`, criterion);
    case "map.atomize_state_sync": {
      const hasAtomizingState = types.includes('"atomizing"') || types.includes("'atomizing'");
      const transitionsToAtomizing = hasStateTransition(orchestrator, "atomizing");
      const ok = hasAtomizingState && transitionsToAtomizing;
      return probe(
        id,
        phase,
        category,
        expected,
        ok,
        `atomizing_state=${hasAtomizingState}, atomizing_transition=${transitionsToAtomizing}`,
        criterion,
      );
    }
    case "map.verify_state_sync":
      return probe(id, phase, category, expected, hasStateTransition(orchestrator, "verifying"), `verifying_transition=${hasStateTransition(orchestrator, "verifying")}`, criterion);
    case "map.execute_state_sync":
      return probe(id, phase, category, expected, hasStateTransition(orchestrator, "executing"), `executing_transition=${hasStateTransition(orchestrator, "executing")}`, criterion);
    case "map.reflect_state_sync":
      return probe(id, phase, category, expected, hasStateTransition(orchestrator, "reflecting"), `reflecting_transition=${hasStateTransition(orchestrator, "reflecting")}`, criterion);
    case "map.verify_checkpoint_type": {
      const hasVerify = /PipelinePhase[\s\S]*"verify"/.test(resume) || resume.includes('| "verify"');
      return probe(id, phase, category, expected, hasVerify, `pipeline_phase_verify=${hasVerify}`, criterion);
    }
    case "map.vision_stream_icon": {
      const hasIcon = streaming.includes("vision:") && streaming.includes("PHASE_ICONS");
      return probe(id, phase, category, expected, hasIcon, `vision_icon=${hasIcon}`, criterion);
    }
    case "map.registry_export": {
      const exportsRegistry =
        orchestrator.includes("export const FORGE_PIPELINE_PHASES") ||
        orchestrator.includes("export { FORGE_PIPELINE_PHASES");
      return probe(id, phase, category, expected, exportsRegistry, `forge_pipeline_phases_export=${exportsRegistry}`, criterion);
    }
    case "map.b01_baseline_handoff": {
      const fixture = loadPipelineBehaviorMapFixture();
      const baseline = buildDefaultBehaviorMapSourceBaseline();
      const ok =
        fixture.sourceBaseline.probeCount === baseline.probeCount &&
        fixture.sourceBaseline.contractVersion === baseline.contractVersion;
      return probe(
        id,
        phase,
        category,
        expected,
        ok,
        `probeCount=${fixture.sourceBaseline.probeCount}/${baseline.probeCount}, contract=${fixture.sourceBaseline.contractVersion}`,
        criterion,
      );
    }
    case "map.worker_blocked_handling": {
      const handlesBlocked =
        orchestrator.includes('execResult?.thought.status === "blocked"') ||
        orchestrator.includes('reExecResult.thought.status === "blocked"');
      return probe(
        id,
        phase,
        category,
        expected,
        handlesBlocked,
        `worker_blocked_handling=${handlesBlocked}`,
        criterion,
      );
    }
    case "map.atom_retry_loop": {
      const hasRetries =
        orchestrator.includes("MAX_ATOM_RETRIES") &&
        orchestrator.includes("attempt < this.MAX_ATOM_RETRIES");
      return probe(id, phase, category, expected, hasRetries, `atom_retry_loop=${hasRetries}`, criterion);
    }
    case "map.block_abandon_threshold": {
      const hasThreshold =
        orchestrator.includes("blockFailedAtoms") &&
        orchestrator.includes("abandoned: too many failures");
      return probe(
        id,
        phase,
        category,
        expected,
        hasThreshold,
        `block_abandon_threshold=${hasThreshold}`,
        criterion,
      );
    }
    case "map.re_decompose_phase_presence": {
      const hasReDecompose = orchestrator.includes('phaseStart("re_decompose"');
      return probe(
        id,
        phase,
        category,
        expected,
        hasReDecompose,
        `re_decompose_phase=${hasReDecompose}`,
        criterion,
      );
    }
    case "map.recovery_phase_runner": {
      const hasRecovery =
        orchestrator.includes("runRecoveryPhase") &&
        (orchestrator.includes('phase: "recovery"') ||
          orchestrator.includes('phaseStart?.("recovery"'));
      return probe(
        id,
        phase,
        category,
        expected,
        hasRecovery,
        `recovery_phase_runner=${hasRecovery}`,
        criterion,
      );
    }
    case "map.rollback_on_reject": {
      const hasRollbackOnReject =
        orchestrator.includes('verdict === "REJECT"') &&
        orchestrator.includes("rollbackLastAtom");
      return probe(
        id,
        phase,
        category,
        expected,
        hasRollbackOnReject,
        `rollback_on_reject=${hasRollbackOnReject}`,
        criterion,
      );
    }
    case "map.reviewer_reject_handling": {
      const handlesReject = orchestrator.includes('reviewResult.verdict === "REJECT"');
      return probe(
        id,
        phase,
        category,
        expected,
        handlesReject,
        `reviewer_reject=${handlesReject}`,
        criterion,
      );
    }
    case "map.rejection_feedback_injection": {
      const hasFeedback = orchestrator.includes("PREVIOUS ATTEMPT REJECTED");
      return probe(
        id,
        phase,
        category,
        expected,
        hasFeedback,
        `rejection_feedback=${hasFeedback}`,
        criterion,
      );
    }
    case "map.hook_block_early_exit": {
      const hasHookBlock = orchestrator.includes('blockedAt: "hooks"');
      return probe(
        id,
        phase,
        category,
        expected,
        hasHookBlock,
        `hook_block_exit=${hasHookBlock}`,
        criterion,
      );
    }
    default:
      return probe(id, phase, category, expected, false, `unknown probe ${id}`, criterion);
  }
}

export function loadPipelineBehaviorMapFixture(): PipelineBehaviorMapFixture {
  return behaviorMapFixture as PipelineBehaviorMapFixture;
}

export function runPipelineBehaviorMapProbes(
  fixture: PipelineBehaviorMapFixture = loadPipelineBehaviorMapFixture(),
): BehaviorMapProbeResult[] {
  const contract = getActivePipelineBehaviorMapContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return runSingleProbe(
      entry.id,
      entry.phase,
      entry.category,
      entry.expected,
      contractProbe?.criterion,
    );
  });
}

export function summarizeBehaviorMapMatrix(
  results: BehaviorMapProbeResult[],
): BehaviorMapProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned);

  const categories: PipelineBehaviorCategory[] = [
    "phase_presence",
    "state_sync",
    "checkpoint_type",
    "stream_seam",
    "baseline_link",
    "failure_path",
    "recovery_path",
    "nogo_path",
  ];

  const byCategory = {} as BehaviorMapProbeSummary["byCategory"];
  for (const cat of categories) {
    byCategory[cat] = { total: 0, aligned: 0, expectedFail: 0 };
  }

  for (const result of results) {
    const bucket = byCategory[result.category];
    bucket.total++;
    if (result.aligned) bucket.aligned++;
    if (result.expected === "FAIL") bucket.expectedFail++;
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    knownGaps,
    byCategory,
  };
}
