/**
 * FOREMAN — Pipeline Behavior Map Harness (P01-B02-A01)
 *
 * Probe seam: measures live orchestrator phase→behavior mapping without
 * running a full LLM pipeline.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import behaviorMapFixture from "./fixtures/forge-pipeline-behavior-map-v1.json" with { type: "json" };
import {
  buildBehaviorMapProbeEvidence,
  buildBehaviorMapProbeTelemetry,
  buildBehaviorMapProvenance,
  buildBehaviorMapRunRecord,
  buildDefaultBehaviorMapSourceBaseline,
  buildBehaviorMapBlockGateEvidence,
  getActivePipelineBehaviorMapContract,
  getForgeP01B02BlockGate,
  getForgeP01B02ToB03Handoff,
  validateBehaviorMapFixtureAgainstContract,
  validateBehaviorMapRunRecord,
  validateBehaviorMapBlockHandoffContract,
  detectBehaviorMapProbeRegression,
  validateForgeBehaviorMapGuard,
  runBehaviorMapPropertyChecks,
  runBehaviorMapFuzzValidation,
  runBehaviorMapRunRecordFuzzValidation,
  listBehaviorMapProbesByDisposition,
  summarizeBehaviorMapContractCoverage,
  PIPELINE_BEHAVIOR_CATEGORIES,
  type BehaviorMapBlockGateEvidence,
  type BehaviorMapBlockHandoffContract,
  type BehaviorMapGuardCheckResult,
  type BehaviorMapProbeResult,
  type BehaviorMapProbeSummary,
  type BehaviorMapRunRecord,
  type ForgeAcceptanceOutcome,
  type ForgeBlockAtomSeal,
  type PipelineBehaviorCategory,
  type PipelineBehaviorMapFixture,
  type PipelineBehaviorProbeDisposition,
} from "./forge-pipeline-behavior-map.js";

export type {
  BehaviorMapProbeEvidence,
  BehaviorMapProbeResult,
  BehaviorMapProbeSummary,
  BehaviorMapProbeTelemetry,
  BehaviorMapProvenance,
  BehaviorMapRunRecord,
  PipelineBehaviorMapFixture,
} from "./forge-pipeline-behavior-map.js";

export {
  buildBehaviorMapProbeEvidence,
  buildBehaviorMapProbeTelemetry,
  buildBehaviorMapProvenance,
  buildBehaviorMapRunRecord,
  getActivePipelineBehaviorMapContract,
  getBehaviorMapCategoryContract,
  listBehaviorMapProbeIds,
  listBehaviorMapProbesByDisposition,
  summarizeBehaviorMapContractCoverage,
  validateBehaviorMapFixtureAgainstContract,
  validateBehaviorMapRunRecord,
  detectBehaviorMapProbeRegression,
  validateForgeBehaviorMapGuard,
  buildDefaultBehaviorMapSourceBaseline,
  buildBehaviorMapBlockGateEvidence,
  getForgeP01B02BlockGate,
  getForgeP01B02ToB03Handoff,
  validateBehaviorMapBlockHandoffContract,
  runBehaviorMapPropertyChecks,
  runBehaviorMapFuzzValidation,
  runBehaviorMapRunRecordFuzzValidation,
  type BehaviorMapBlockGateEvidence,
  type BehaviorMapBlockHandoffContract,
  PIPELINE_BEHAVIOR_CATEGORIES,
  type BehaviorMapProbeRegressionReport,
} from "./forge-pipeline-behavior-map.js";

export type { BehaviorMapProbeRegressionReport } from "./forge-pipeline-behavior-map.js";

export interface ForgeBehaviorMapRegressionResult {
  passed: boolean;
  record: BehaviorMapRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: BehaviorMapProbeRegressionReport | null;
  guard: BehaviorMapGuardCheckResult;
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

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function runProbeWithTiming(
  entry: PipelineBehaviorMapFixture["probes"][number],
  contractProbe: { criterion: string; disposition: PipelineBehaviorProbeDisposition } | undefined,
  sequenceIndex: number,
): { result: BehaviorMapProbeResult; durationMs: number; disposition: PipelineBehaviorProbeDisposition } {
  const start = performance.now();
  const result = runSingleProbe(
    entry.id,
    entry.phase,
    entry.category,
    entry.expected,
    contractProbe?.criterion,
  );
  const durationMs = performance.now() - start;
  return {
    result,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
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

/** Run behavior map probes and emit auditable evidence, telemetry and provenance (P01-B02-A06). */
export function runPipelineBehaviorMapProbesWithRecord(
  fixture: PipelineBehaviorMapFixture = loadPipelineBehaviorMapFixture(),
): BehaviorMapRunRecord {
  const contract = getActivePipelineBehaviorMapContract();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildBehaviorMapProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildBehaviorMapProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of fixture.probes) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runProbeWithTiming(entry, contractProbe, sequenceIndex);
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildBehaviorMapProbeEvidence(
        result.id,
        entry.phase,
        result.category,
        result.expected,
        result.actual,
        result.aligned,
        criterion,
        result.detail,
        disposition,
      ),
    );
    telemetry.push(buildBehaviorMapProbeTelemetry(result.id, result.category, sequenceIndex, durationMs));
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildBehaviorMapProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    resolveGitCommit(),
  );

  return buildBehaviorMapRunRecord(provenance, evidence, telemetry);
}

/**
 * Execute behavior map probes, validate run record, and optionally detect regression vs prior run.
 * Forge pipeline integration gate (P01-B02-A08).
 */
export function runForgeBehaviorMapRegressionGate(
  priorRecord?: BehaviorMapRunRecord,
): ForgeBehaviorMapRegressionResult {
  const record = runPipelineBehaviorMapProbesWithRecord();
  const validation = validateBehaviorMapRunRecord(record);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord ? detectBehaviorMapProbeRegression(priorRecord, record) : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeBehaviorMapGuard(record, { totalCostUsd: 0, llmCalls: 0 });
  const passed = recordValid && !alignmentRegression && guard.passed;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  if (!recordValid) detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
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

export interface ForgeBehaviorMapBlockGateResult {
  passed: boolean;
  evidence: BehaviorMapBlockGateEvidence;
  handoff: BehaviorMapBlockHandoffContract;
  regression: ForgeBehaviorMapRegressionResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealBehaviorMapBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P01-B02 block gate: validate A01–A09 deliverables, regression, guard, and B03 handoff (P01-B02-A10).
 */
export function runForgeBehaviorMapBlockGate(): ForgeBehaviorMapBlockGateResult {
  const blockGate = getForgeP01B02BlockGate();
  const handoff = getForgeP01B02ToB03Handoff();
  const contract = getActivePipelineBehaviorMapContract();
  const fixture = loadPipelineBehaviorMapFixture();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateBehaviorMapFixtureAgainstContract(fixture, contract);
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A01",
      "behavior_map_fixture",
      fixtureValidation.valid && fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeBehaviorMapContractCoverage(contract).totalProbes} probes)`
        : fixtureValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeBehaviorMapContractCoverage(contract);
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${PIPELINE_BEHAVIOR_CATEGORIES.length} categories`,
    ),
  );

  const regression = runForgeBehaviorMapRegressionGate();
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A03",
      "probe_matrix",
      regression.record.summary.mismatches === 0,
      `${regression.record.summary.aligned}/${regression.record.summary.total} probes aligned`,
    ),
  );

  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A04",
      "boundary_dispositions",
      dispositionOk,
      `observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const nogoProbes = listBehaviorMapProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A05",
      "failure_recovery_nogo",
      nogoProbes.length > 0 && regression.recordValid,
      `${nogoProbes.length} NO-GO probes; recordValid=${regression.recordValid}`,
    ),
  );

  const recordValidation = validateBehaviorMapRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const properties = runBehaviorMapPropertyChecks(contract);
  const contractFuzz = runBehaviorMapFuzzValidation(fixture, contract);
  const runFuzz = runBehaviorMapRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk = properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateBehaviorMapBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealBehaviorMapBlockAtom(
      "P01-B02-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildBehaviorMapBlockGateEvidence(
    atomSeals,
    regression.passed,
    regression.guard.passed,
    regression.record.summary.total,
    resolveGitCommit(),
  );

  const detailParts = [
    `block=${blockGate.blockId} seals=${atomSeals.filter(s => s.passed).length}/${atomSeals.length}`,
    `regression=${regression.passed ? "PASS" : "FAIL"}`,
    `guard=${regression.guard.passed ? "PASS" : "FAIL"}`,
    `handoff=${evidence.handoffValid ? "PASS" : "FAIL"}→${handoff.targetBlock.blockId}`,
  ];

  return {
    passed: blockGatePass && evidence.handoffValid,
    evidence,
    handoff,
    regression,
    atomSeals,
    detail: detailParts.join(" | "),
  };
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
