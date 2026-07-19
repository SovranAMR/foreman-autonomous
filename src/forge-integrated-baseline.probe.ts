/**
 * FOREMAN — Integrated Forge Baseline Probe Harness (P01-B10-A01)
 *
 * Static probes for integrated baseline gate measurement.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import integratedBaselineFixture from "./fixtures/forge-integrated-baseline-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B09ToB10Handoff,
  getActiveOrchestratorSeamContract,
  summarizeOrchestratorSeamContractCoverage,
  ORCHESTRATOR_FORGE_GUARD_METHODS,
} from "./forge-orchestrator-seam.js";
import {
  FORGE_INTEGRATED_BASELINE_VERSION,
  INTEGRATED_BASELINE_CATEGORIES,
  SEALED_FORGE_BLOCK_INVENTORY,
  EXPECTED_SEALED_BLOCK_COUNT,
  INTEGRATED_FORGE_REGRESSION_METHODS,
  INTEGRATED_FORGE_BLOCK_GATE_METHODS,
  getActiveIntegratedBaselineContract,
  listIntegratedBaselineContractProbesByCategory,
  validateIntegratedBaseline,
  validateIntegratedBaselineAgainstContract,
  validateIntegratedBaselineProbeMatrix,
  validateIntegratedBaselineBoundaryProbeMatrix,
  validateIntegratedBaselineFailureRecoveryProbeMatrix,
  INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES,
  listIntegratedBaselineFailureRecoveryProbeIds,
  summarizeIntegratedBaselineMatrix,
  buildIntegratedBaselineProbeEvidence,
  buildIntegratedBaselineProbeTelemetry,
  buildIntegratedBaselineProvenance,
  buildIntegratedBaselineRunRecord,
  validateIntegratedBaselineFailureRecoveryRunRecord,
  type IntegratedBaseline,
  type IntegratedBaselineCategory,
  type IntegratedBaselineProbeResult,
  type IntegratedBaselineProbeDisposition,
  type IntegratedBaselineRunRecord,
} from "./forge-integrated-baseline.js";

export type { IntegratedBaseline, IntegratedBaselineProbeResult } from "./forge-integrated-baseline.js";
export {
  FORGE_INTEGRATED_BASELINE_VERSION,
  INTEGRATED_BASELINE_CATEGORIES,
  SEALED_FORGE_BLOCK_INVENTORY,
  EXPECTED_SEALED_BLOCK_COUNT,
  INTEGRATED_FORGE_REGRESSION_METHODS,
  INTEGRATED_FORGE_BLOCK_GATE_METHODS,
  FORGE_INTEGRATED_BASELINE_CONTRACT_V1,
  getActiveIntegratedBaselineContract,
  getIntegratedBaselineCategoryContract,
  listIntegratedBaselineContractProbeIds,
  listIntegratedBaselineProbesByDisposition,
  listIntegratedBaselineContractProbesByCategory,
  summarizeIntegratedBaselineContractCoverage,
  validateIntegratedBaselineContractCoverage,
  validateIntegratedBaselineAgainstContract,
  validateIntegratedBaseline,
  validateIntegratedBaselineProbeMatrix,
  validateIntegratedBaselineBoundaryProbeMatrix,
  validateIntegratedBaselineFailureRecoveryProbeMatrix,
  INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES,
  listIntegratedBaselineFailureRecoveryProbeIds,
  summarizeIntegratedBaselineMatrix,
  listIntegratedBaselineProbesByExpected,
  listIntegratedBaselineKnownGaps,
  buildDefaultIntegratedSourceOrchestratorSeam,
  buildIntegratedBaselineProbeEvidence,
  buildIntegratedBaselineProbeTelemetry,
  buildIntegratedBaselineProvenance,
  buildIntegratedBaselineRunRecord,
  validateIntegratedBaselineFailureRecoveryRunRecord,
} from "./forge-integrated-baseline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);
const FIXTURES_ROOT = join(SRC_ROOT, "fixtures");

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): IntegratedBaselineProbeResult {
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

function integratedBaselineSource(): string {
  return readSrc("forge-integrated-baseline.ts") + readSrc("forge-integrated-baseline.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(integratedBaselineSource());
}

function countOrchestratorMethods(methodNames: readonly string[]): number {
  const src = orchestratorSource();
  return methodNames.filter(name => new RegExp(`\\basync ${name}\\(`).test(src)).length;
}

function probeGateVersioning(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: IntegratedBaseline,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(
        id,
        category,
        expected,
        ok,
        `version=${fixture.version}`,
        "Integrated baseline declares semver version field",
      );
    }
    case "ibase.atom_tagged": {
      const ok = fixture.atom === "P01-B10-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `atom=${fixture.atom}`,
        "Integrated baseline declares P01-B10-A01 atom id",
      );
    }
    case "ibase.harness_version_exported": {
      const ok = FORGE_INTEGRATED_BASELINE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_INTEGRATED_BASELINE_VERSION}`,
        "FORGE_INTEGRATED_BASELINE_VERSION exported for integrated gate harness",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown gate_versioning probe");
  }
}

function probeBlockInventory(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.nine_blocks_sealed": {
      const found = countOrchestratorMethods(INTEGRATED_FORGE_BLOCK_GATE_METHODS);
      const ok = found === EXPECTED_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${EXPECTED_SEALED_BLOCK_COUNT}`,
        "Orchestrator exposes nine verifyForge*BlockGate methods for sealed P01 blocks",
      );
    }
    case "ibase.block_fixture_registry": {
      const missing = SEALED_FORGE_BLOCK_INVENTORY.filter(
        entry => !existsSync(join(FIXTURES_ROOT, entry.fixture)),
      );
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        ok ? `fixtures=${EXPECTED_SEALED_BLOCK_COUNT}` : `missing=${missing.map(m => m.fixture).join(",")}`,
        "All nine sealed block baseline fixtures exist under src/fixtures",
      );
    }
    case "ibase.unified_block_catalog": {
      const ok =
        hasProductionExport("getSealedForgeBlockCatalog") ||
        /\binterface SealedForgeBlockCatalog\b/.test(integratedBaselineSource());
      return probe(
        id,
        category,
        expected,
        ok,
        `catalog=${ok}`,
        "Central SealedForgeBlockCatalog type exports canonical block inventory for integrated gate",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_inventory probe");
  }
}

function probeRegressionIntegration(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  const src = orchestratorSource();
  switch (id) {
    case "ibase.nine_regression_methods": {
      const found = countOrchestratorMethods(INTEGRATED_FORGE_REGRESSION_METHODS);
      const ok = found === INTEGRATED_FORGE_REGRESSION_METHODS.length;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${INTEGRATED_FORGE_REGRESSION_METHODS.length}`,
        "Orchestrator exposes nine verifyForge*Regression methods including orchestrator seam",
      );
    }
    case "ibase.orchestrator_seam_regression_wired": {
      const section = src.slice(src.indexOf("verifyForgeOrchestratorSeamRegression"));
      const ok =
        section.includes("forge-orchestrator-seam.probe.js") &&
        section.includes("runForgeOrchestratorSeamRegressionGate");
      return probe(
        id,
        category,
        expected,
        ok,
        `seamRegressionWired=${ok}`,
        "verifyForgeOrchestratorSeamRegression lazy-loads orchestrator seam regression gate",
      );
    }
    case "ibase.unified_regression_runner": {
      const ok = /\basync verifyForgeIntegratedRegression\(/.test(src);
      return probe(
        id,
        category,
        expected,
        ok,
        `integratedRegression=${ok}`,
        "Orchestrator exposes verifyForgeIntegratedRegression for cross-block integrated baseline gate",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown regression_integration probe");
  }
}

function probeGuardIntegration(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  const src = orchestratorSource();
  switch (id) {
    case "ibase.orchestrator_guard_methods": {
      const found = countOrchestratorMethods(ORCHESTRATOR_FORGE_GUARD_METHODS);
      const ok = found >= ORCHESTRATOR_FORGE_GUARD_METHODS.length - 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${ORCHESTRATOR_FORGE_GUARD_METHODS.length}`,
        "Orchestrator exposes verifyForge*Guard methods for sealed block guard gates",
      );
    }
    case "ibase.integrated_guard_orchestrator": {
      const ok = /\basync verifyForgeIntegratedGuard\(/.test(src);
      return probe(
        id,
        category,
        expected,
        ok,
        `integratedGuard=${ok}`,
        "Orchestrator exposes verifyForgeIntegratedGuard for unified adversarial guard sweep",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown guard_integration probe");
  }
}

function probeBlockGateIntegration(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  const src = orchestratorSource();
  switch (id) {
    case "ibase.nine_block_gate_methods": {
      const found = countOrchestratorMethods(INTEGRATED_FORGE_BLOCK_GATE_METHODS);
      const ok = found === INTEGRATED_FORGE_BLOCK_GATE_METHODS.length;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${INTEGRATED_FORGE_BLOCK_GATE_METHODS.length}`,
        "Orchestrator block gate inventory includes orchestrator seam block gate",
      );
    }
    case "ibase.integrated_block_gate_method": {
      const ok = /\basync verifyForgeIntegratedBlockGate\(/.test(src);
      return probe(
        id,
        category,
        expected,
        ok,
        `integratedBlockGate=${ok}`,
        "Orchestrator exposes verifyForgeIntegratedBlockGate sealing P01 phase integrated gate",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_gate_integration probe");
  }
}

function probeOrchestratorSeamLink(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.b09_handoff_entry": {
      const handoff = getForgeP01B09ToB10Handoff();
      const ok = handoff.targetBlock.entryAtom === "P01-B10-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `entryAtom=${handoff.targetBlock.entryAtom}`,
        "FORGE_P01_B09_TO_B10_HANDOFF_V1 targets P01-B10-A01 entry atom",
      );
    }
    case "ibase.b09_sealed_probe_count": {
      const handoff = getForgeP01B09ToB10Handoff();
      const contract = getActiveOrchestratorSeamContract();
      const coverage = summarizeOrchestratorSeamContractCoverage(contract);
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff=${handoff.sealedArtifacts.probeCount} contract=${coverage.totalProbes}`,
        "Sealed B09 handoff probeCount matches active orchestrator seam contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown orchestrator_seam_link probe");
  }
}

function probeBoundary(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: IntegratedBaseline,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.source_orchestrator_seam_ref": {
      const handoff = getForgeP01B09ToB10Handoff();
      const ok =
        fixture.sourceOrchestratorSeam.atom === "P01-B09-A10" &&
        fixture.sourceOrchestratorSeam.version === handoff.sealedArtifacts.fixtureVersion;
      return probe(
        id,
        category,
        expected,
        ok,
        `sourceAtom=${fixture.sourceOrchestratorSeam.atom}`,
        "Baseline fixture references sealed sourceOrchestratorSeam artifacts from B09-A10",
      );
    }
    case "ibase.probe_runner_exported": {
      const ok = hasProductionExport("runIntegratedBaselineProbes");
      return probe(
        id,
        category,
        expected,
        ok,
        `runner=${ok}`,
        "runIntegratedBaselineProbes executes contract-wired integrated probe matrix",
      );
    }
    case "ibase.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFailGaps=${failCount}`,
        "Baseline fixture documents at least one measurable FAIL integrated gate gap",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: IntegratedBaseline,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.invalid_version_rejected": {
      const badFixture = { ...fixture, version: "9.9.9" };
      const validation = validateIntegratedBaseline(badFixture);
      const ok = !validation.valid;
      return probe(
        id,
        category,
        expected,
        ok,
        `rejected=${!validation.valid}`,
        "validateIntegratedBaseline rejects unexpected fixture version",
      );
    }
    case "ibase.min_category_probes": {
      const sparse = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const validation = validateIntegratedBaseline(sparse);
      const ok = !validation.valid && validation.issues.some(i => i.kind === "underflow");
      return probe(
        id,
        category,
        expected,
        ok,
        `underflowDetected=${validation.issues.some(i => i.kind === "underflow")}`,
        "validateIntegratedBaseline enforces per-category minimum probe counts",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.recovery_integrated_state_reset": {
      const ok =
        hasProductionExport("resetIntegratedBaselineVerificationState") ||
        /\bintegratedBaselineVerificationState\b/.test(integratedBaselineSource() + orchestratorSource());
      return probe(
        id,
        category,
        expected,
        ok,
        `stateReset=${ok}`,
        "Integrated gate harness resets cross-block verification state on pipeline recovery transition",
      );
    }
    case "ibase.recovery_missing_b09_handoff_fallback": {
      const ok =
        hasProductionExport("loadIntegratedBaselineWithHandoffFallback") ||
        hasProductionExport("resolveIntegratedBaselineHandoff");
      return probe(
        id,
        category,
        expected,
        ok,
        `handoffFallback=${ok}`,
        "Recovery loader falls back when B09 handoff artifact is missing or invalid",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
): IntegratedBaselineProbeResult {
  switch (id) {
    case "ibase.nogo_block_inventory_drift": {
      const ok =
        hasProductionExport("detectIntegratedBlockInventoryDrift") ||
        hasProductionExport("validateIntegratedBlockInventoryGate");
      return probe(
        id,
        category,
        expected,
        ok,
        `inventoryDriftGate=${ok}`,
        "NO-GO gate halts eval when sealed block inventory drifts from integrated baseline",
      );
    }
    case "ibase.nogo_integrated_gate_mismatch": {
      const ok =
        hasProductionExport("detectIntegratedGateSignatureMismatch") ||
        hasProductionExport("validateIntegratedGateInventory");
      return probe(
        id,
        category,
        expected,
        ok,
        `signatureMismatchGate=${ok}`,
        "NO-GO gate rejects run when integrated gate probe signatures mismatch sealed inventory",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: IntegratedBaseline,
): IntegratedBaselineProbeResult {
  switch (category) {
    case "gate_versioning":
      return probeGateVersioning(id, category, expected, fixture);
    case "block_inventory":
      return probeBlockInventory(id, category, expected);
    case "regression_integration":
      return probeRegressionIntegration(id, category, expected);
    case "guard_integration":
      return probeGuardIntegration(id, category, expected);
    case "block_gate_integration":
      return probeBlockGateIntegration(id, category, expected);
    case "orchestrator_seam_link":
      return probeOrchestratorSeamLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadIntegratedBaseline(): IntegratedBaseline {
  return integratedBaselineFixture as IntegratedBaseline;
}

export function runIntegratedBaselineProbes(
  fixture: IntegratedBaseline = loadIntegratedBaseline(),
): IntegratedBaselineProbeResult[] {
  const contract = getActiveIntegratedBaselineContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface IntegratedBaselineProductionSliceResult {
  atom: "P01-B10-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: IntegratedBaselineProbeResult[];
  summary: ReturnType<typeof summarizeIntegratedBaselineMatrix>;
  matrixValidation: ReturnType<typeof validateIntegratedBaselineProbeMatrix>;
}

/**
 * A03 production vertical slice: fixture ↔ contract validation, contract-wired probe
 * execution, and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runIntegratedBaselineProductionSlice(
  fixture: IntegratedBaseline = loadIntegratedBaseline(),
): IntegratedBaselineProductionSliceResult {
  const contract = getActiveIntegratedBaselineContract();
  const fixtureValidation = validateIntegratedBaseline(fixture);
  const contractValidation = validateIntegratedBaselineAgainstContract(fixture, contract);
  const results = runIntegratedBaselineProbes(fixture);
  const summary = summarizeIntegratedBaselineMatrix(results);
  const matrixValidation = validateIntegratedBaselineProbeMatrix(results, contract);

  return {
    atom: "P01-B10-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface IntegratedBaselineBoundarySliceResult {
  atom: "P01-B10-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: IntegratedBaselineProbeResult[];
  boundaryResults: IntegratedBaselineProbeResult[];
  matrixValidation: ReturnType<typeof validateIntegratedBaselineBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (sourceOrchestratorSeam ref,
 * probe runner, known gaps) with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runIntegratedBaselineBoundarySlice(
  fixture: IntegratedBaseline = loadIntegratedBaseline(),
): IntegratedBaselineBoundarySliceResult {
  const contract = getActiveIntegratedBaselineContract();
  const results = runIntegratedBaselineProbes(fixture);
  const boundaryProbes = listIntegratedBaselineContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateIntegratedBaselineBoundaryProbeMatrix(results, contract);

  return {
    atom: "P01-B10-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface IntegratedBaselineFailureRecoverySliceResult {
  atom: "P01-B10-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: IntegratedBaselineProbeResult[];
  failureRecoveryResults: IntegratedBaselineProbeResult[];
  matrixValidation: ReturnType<typeof validateIntegratedBaselineFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runIntegratedBaselineFailureRecoverySlice(
  fixture: IntegratedBaseline = loadIntegratedBaseline(),
): IntegratedBaselineFailureRecoverySliceResult {
  const contract = getActiveIntegratedBaselineContract();
  const results = runIntegratedBaselineProbes(fixture);
  const failureRecoveryProbes = INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listIntegratedBaselineContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateIntegratedBaselineFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P01-B10-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function runIntegratedBaselineProbeWithTiming(
  entry: IntegratedBaseline["probes"][number],
  fixture: IntegratedBaseline,
  contractProbe:
    | { criterion: string; disposition: IntegratedBaselineProbeDisposition }
    | undefined,
): {
  result: IntegratedBaselineProbeResult;
  durationMs: number;
  disposition: IntegratedBaselineProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
  const enriched = contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildIntegratedBaselineRecordFromEntries(
  entries: IntegratedBaseline["probes"],
  fixture: IntegratedBaseline,
  contract: ReturnType<typeof getActiveIntegratedBaselineContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly IntegratedBaselineCategory[];
  },
): IntegratedBaselineRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildIntegratedBaselineProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildIntegratedBaselineProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runIntegratedBaselineProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildIntegratedBaselineProbeEvidence(
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
      buildIntegratedBaselineProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildIntegratedBaselineProvenance(
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

  return buildIntegratedBaselineRunRecord(provenance, evidence, telemetry);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P01-B10-A06). */
export function runIntegratedBaselineFailureRecoverySliceWithRecord(
  fixture: IntegratedBaseline = loadIntegratedBaseline(),
): IntegratedBaselineRunRecord {
  const contract = getActiveIntegratedBaselineContract();
  const failureRecoveryIds = new Set(listIntegratedBaselineFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildIntegratedBaselineRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P01-B10-A06",
    sliceCategories: INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES,
  });
}
