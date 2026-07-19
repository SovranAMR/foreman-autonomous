/**
 * FOREMAN — Reproducible Fixture Probe Seam (P01-B07-A01)
 *
 * Static probes for reproducible fixture baseline measurement.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import reproducibleFixtureBaseline from "./fixtures/forge-reproducible-fixture-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B06ToB07Handoff,
  getActiveBenchmarkEvalContract,
  summarizeBenchmarkEvalContractCoverage,
} from "./forge-benchmark-eval-harness.js";
import {
  SEALED_FORGE_FIXTURE_FILES,
  validateReproducibleFixtureBaseline,
  getActiveReproducibleFixtureContract,
  listReproducibleFixtureProbesByCategory,
  canonicalFixtureHash,
  validateReproducibleFixtureProbeMatrix,
  validateReproducibleFixtureBoundaryProbeMatrix,
  validateReproducibleFixtureFailureRecoveryProbeMatrix,
  listReproducibleFixtureFailureRecoveryProbeIds,
  REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES,
  summarizeReproducibleFixtureMatrix,
  validateReproducibleFixtureBaselineAgainstContract,
  buildReproducibleFixtureProbeEvidence,
  buildReproducibleFixtureProbeTelemetry,
  buildReproducibleFixtureProvenance,
  buildReproducibleFixtureRunRecord,
  type ReproducibleFixtureBaseline,
  type ReproducibleFixtureCategory,
  type ReproducibleFixtureProbeResult,
  type ReproducibleFixtureProbeMatrixValidationResult,
  type ReproducibleFixtureRunRecord,
  type ReproducibleFixtureProbeDisposition,
} from "./forge-reproducible-fixture.js";

export type { ReproducibleFixtureBaseline, ReproducibleFixtureProbeResult } from "./forge-reproducible-fixture.js";
export {
  validateReproducibleFixtureBaseline,
  summarizeReproducibleFixtureMatrix,
  listReproducibleFixtureProbesByExpected,
  listReproducibleFixtureKnownGaps,
  buildDefaultReproducibleSourceBenchmarkEval,
  getActiveReproducibleFixtureContract,
  getReproducibleFixtureCategoryContract,
  listReproducibleFixtureContractProbeIds,
  listReproducibleFixtureProbesByDisposition,
  listReproducibleFixtureProbesByCategory,
  summarizeReproducibleFixtureContractCoverage,
  validateReproducibleFixtureContractCoverage,
  validateReproducibleFixtureBaselineAgainstContract,
  validateReproducibleFixtureProbeMatrix,
  validateReproducibleFixtureBoundaryProbeMatrix,
  validateReproducibleFixtureFailureRecoveryProbeMatrix,
  listReproducibleFixtureFailureRecoveryProbeIds,
  canonicalFixtureHash,
  REPRODUCIBLE_FIXTURE_CATEGORIES,
  REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES,
  SEALED_FORGE_FIXTURE_FILES,
  buildReproducibleFixtureProbeEvidence,
  buildReproducibleFixtureProbeTelemetry,
  buildReproducibleFixtureProvenance,
  buildReproducibleFixtureRunRecord,
  validateReproducibleFixtureRunRecord,
  validateReproducibleFixtureFailureRecoveryRunRecord,
} from "./forge-reproducible-fixture.js";

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
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ReproducibleFixtureProbeResult {
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

function productionReproducibleSource(): string {
  return readSrc("forge-reproducible-fixture.ts") + orchestratorSource();
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionReproducibleSource());
}

function harnessUsesTypedJsonImport(relativePath: string): boolean {
  const src = readSrc(relativePath);
  return src.includes('with { type: "json" }');
}

function probeFixtureVersioning(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.sealed_fixture_files": {
      const missing = SEALED_FORGE_FIXTURE_FILES.filter(
        name => !existsSync(join(FIXTURES_ROOT, name)),
      );
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.join(",") || "none"}`,
        "All six sealed forge baseline fixture JSON files exist under src/fixtures",
      );
    }
    case "fix.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(
        id,
        category,
        expected,
        ok,
        `version=${fixture.version}`,
        "Reproducible fixture baseline declares semver version field",
      );
    }
    case "fix.atom_tagged": {
      const ok = fixture.atom === "P01-B07-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `atom=${fixture.atom}`,
        "Reproducible fixture baseline declares P01-B07-A01 atom id",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown fixture_versioning probe");
  }
}

function probeFixtureIntegrity(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.json_stable_import": {
      const harnessFiles = [
        "forge-baseline-harness.ts",
        "forge-pipeline-behavior-map-harness.ts",
        "forge-formal-state-machine-harness.ts",
        "forge-phase-event-schema-harness.ts",
        "forge-pipeline-invariant-engine-harness.ts",
        "forge-benchmark-eval-harness.probe.ts",
        "forge-reproducible-fixture.probe.ts",
      ];
      const missing = harnessFiles.filter(file => !harnessUsesTypedJsonImport(file));
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missingTypedImport=${missing.join(",") || "none"}`,
        "Forge harness modules import fixtures with typed JSON import assertions",
      );
    }
    case "fix.canonical_fixture_hash": {
      const sample = { version: "1.0.0", probes: [{ id: "fix.sample" }] };
      const hash1 = canonicalFixtureHash(sample);
      const hash2 = canonicalFixtureHash(sample);
      const ok =
        hash1.length === 64 &&
        hash1 === hash2 &&
        /^[a-f0-9]+$/.test(hash1) &&
        canonicalFixtureHash("stable") !== canonicalFixtureHash("changed");
      return probe(
        id,
        category,
        expected,
        ok,
        `hash=${hash1.slice(0, 12)}… stable=${hash1 === hash2}`,
        "Central canonicalFixtureHash computes stable SHA-256 over fixture content",
      );
    }
    case "fix.content_addressable_store": {
      const sidecarExists = SEALED_FORGE_FIXTURE_FILES.some(name =>
        existsSync(join(FIXTURES_ROOT, `${name}.sha256`)),
      );
      const registryOk =
        readSrc("forge-reproducible-fixture.ts").includes("FIXTURE_DIGEST_REGISTRY") ||
        existsSync(join(FIXTURES_ROOT, "forge-fixture-digest-registry-v1.json"));
      const ok = sidecarExists || registryOk;
      return probe(
        id,
        category,
        expected,
        ok,
        `sidecar=${sidecarExists}, registry=${registryOk}`,
        "Fixture hash sidecar or registry stores content-addressable fixture digests",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown fixture_integrity probe");
  }
}

function probeDeterministicLoad(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureProbeResult {
  const reproducibleSrc = readSrc("forge-reproducible-fixture.ts");
  const probeSrc = readSrc("forge-reproducible-fixture.probe.ts");
  const orchestrator = orchestratorSource();

  switch (id) {
    case "fix.load_reproducible_baseline": {
      const ok = probeSrc.includes("export function loadReproducibleFixtureBaseline");
      return probe(
        id,
        category,
        expected,
        ok,
        `loaderExported=${ok}`,
        "loadReproducibleFixtureBaseline exports versioned baseline loader",
      );
    }
    case "fix.validate_reproducible_baseline": {
      const ok = reproducibleSrc.includes("export function validateReproducibleFixtureBaseline");
      return probe(
        id,
        category,
        expected,
        ok,
        `validatorExported=${ok}`,
        "validateReproducibleFixtureBaseline validates fixture structure and B06 handoff",
      );
    }
    case "fix.deterministic_eval_seed": {
      const ok =
        orchestrator.includes("evalSeed") ||
        orchestrator.includes("deterministicEvalSeed") ||
        orchestrator.includes("BENCHMARK_EVAL_SEED");
      return probe(
        id,
        category,
        expected,
        ok,
        `evalSeed=${ok}`,
        "Orchestrator accepts deterministic eval seed for reproducible benchmark runs",
      );
    }
    case "fix.fixture_load_idempotent": {
      const first = loadReproducibleFixtureBaseline();
      const second = loadReproducibleFixtureBaseline();
      const ok =
        first.version === second.version &&
        first.atom === second.atom &&
        first.probes.length === second.probes.length &&
        JSON.stringify(first) === JSON.stringify(second);
      return probe(
        id,
        category,
        expected,
        ok,
        `idempotent=${ok}`,
        "Repeated loadReproducibleFixtureBaseline returns identical fixture snapshot",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown deterministic_load probe");
  }
}

function probeBaselineLink(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.b06_handoff_entry": {
      const handoff = getForgeP01B06ToB07Handoff();
      const ok =
        handoff.targetBlock.blockId === "P01-B07" &&
        handoff.targetBlock.entryAtom === "P01-B07-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        "FORGE_P01_B06_TO_B07_HANDOFF_V1 targets P01-B07-A01 entry atom",
      );
    }
    case "fix.b06_sealed_probe_count": {
      const handoff = getForgeP01B06ToB07Handoff();
      const coverage = summarizeBenchmarkEvalContractCoverage(getActiveBenchmarkEvalContract());
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActiveBenchmarkEvalContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B06 handoff probeCount matches active benchmark eval contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.source_benchmark_eval_ref": {
      const ok =
        fixture.sourceBenchmarkEval.atom === "P01-B06-A10" &&
        fixture.sourceBenchmarkEval.probeCount === 26 &&
        fixture.sourceBenchmarkEval.benchmarkEvalCategories === 9;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBenchmarkEval.atom}, probes=${fixture.sourceBenchmarkEval.probeCount}`,
        "Baseline fixture references sealed sourceBenchmarkEval artifacts from B06-A10",
      );
    }
    case "fix.probe_runner_exported": {
      const ok = readSrc("forge-reproducible-fixture.probe.ts").includes(
        "export function runReproducibleFixtureProbes",
      );
      return probe(
        id,
        category,
        expected,
        ok,
        `probeRunner=${ok}`,
        "runReproducibleFixtureProbes executes contract-wired probe matrix",
      );
    }
    case "fix.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}`,
        "Baseline fixture documents at least one measurable FAIL reproducibility gap",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateReproducibleFixtureBaseline(invalid).valid === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `rejectsInvalidVersion=${ok}`,
        "validateReproducibleFixtureBaseline rejects unexpected fixture version",
      );
    }
    case "fix.min_category_probes": {
      const stripped = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const result = validateReproducibleFixtureBaseline(stripped);
      const ok = result.valid === false && result.issues.some(i => i.kind === "underflow");
      return probe(
        id,
        category,
        expected,
        ok,
        `underflowDetected=${ok}`,
        "validateReproducibleFixtureBaseline enforces per-category minimum probe counts",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.recovery_missing_fixture_file": {
      const ok =
        hasProductionExport("loadReproducibleFixtureFallback") ||
        hasProductionExport("recoverReproducibleFixtureBaseline");
      return probe(
        id,
        category,
        expected,
        ok,
        `recoveryLoader=${ok}`,
        "Recovery loader falls back when versioned fixture file is missing",
      );
    }
    case "fix.recovery_baseline_reset": {
      const ok =
        hasProductionExport("resetReproducibleFixtureBaseline") ||
        hasProductionExport("recoveryBaselineReset");
      return probe(
        id,
        category,
        expected,
        ok,
        `baselineReset=${ok}`,
        "Reproducible fixture harness resets baseline metrics on recovery transition",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
): ReproducibleFixtureProbeResult {
  switch (id) {
    case "fix.nogo_fixture_drift_gate": {
      const ok =
        hasProductionExport("verifyReproducibleFixtureDrift") ||
        hasProductionExport("nogoFixtureDriftGate") ||
        hasProductionExport("verifyForgeReproducibleFixtureGuard");
      return probe(
        id,
        category,
        expected,
        ok,
        `driftGate=${ok}`,
        "NO-GO gate halts eval when reproducible fixture drift is detected",
      );
    }
    case "fix.nogo_hash_mismatch_gate": {
      const ok =
        hasProductionExport("nogoHashMismatchGate") ||
        hasProductionExport("verifyFixtureHashMismatch") ||
        hasProductionExport("rejectFixtureHashMismatch");
      return probe(
        id,
        category,
        expected,
        ok,
        `hashMismatchGate=${ok}`,
        "NO-GO gate rejects benchmark run when fixture canonical hash mismatches registry",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureProbeResult {
  switch (category) {
    case "fixture_versioning":
      return probeFixtureVersioning(id, category, expected, fixture);
    case "fixture_integrity":
      return probeFixtureIntegrity(id, category, expected);
    case "deterministic_load":
      return probeDeterministicLoad(id, category, expected, fixture);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
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

export function loadReproducibleFixtureBaseline(): ReproducibleFixtureBaseline {
  return reproducibleFixtureBaseline as ReproducibleFixtureBaseline;
}

export function runReproducibleFixtureProbes(
  fixture: ReproducibleFixtureBaseline = loadReproducibleFixtureBaseline(),
): ReproducibleFixtureProbeResult[] {
  const contract = getActiveReproducibleFixtureContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function runReproducibleFixtureProbeWithTiming(
  entry: ReproducibleFixtureBaseline["probes"][number],
  fixture: ReproducibleFixtureBaseline,
  contractProbe:
    | { criterion: string; disposition: ReproducibleFixtureProbeDisposition }
    | undefined,
): {
  result: ReproducibleFixtureProbeResult;
  durationMs: number;
  disposition: ReproducibleFixtureProbeDisposition;
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

function buildReproducibleFixtureRecordFromEntries(
  entries: ReproducibleFixtureBaseline["probes"],
  fixture: ReproducibleFixtureBaseline,
  contract: ReturnType<typeof getActiveReproducibleFixtureContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ReproducibleFixtureCategory[];
  },
): ReproducibleFixtureRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildReproducibleFixtureProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildReproducibleFixtureProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runReproducibleFixtureProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildReproducibleFixtureProbeEvidence(
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
      buildReproducibleFixtureProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildReproducibleFixtureProvenance(
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

  return buildReproducibleFixtureRunRecord(provenance, evidence, telemetry);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P01-B07-A06). */
export function runReproducibleFixtureFailureRecoverySliceWithRecord(
  fixture: ReproducibleFixtureBaseline = loadReproducibleFixtureBaseline(),
): ReproducibleFixtureRunRecord {
  const contract = getActiveReproducibleFixtureContract();
  const failureRecoveryIds = new Set(listReproducibleFixtureFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildReproducibleFixtureRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P01-B07-A06",
    sliceCategories: REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES,
  });
}

export interface ReproducibleFixtureProductionSliceResult {
  atom: "P01-B07-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ReproducibleFixtureProbeResult[];
  summary: ReturnType<typeof summarizeReproducibleFixtureMatrix>;
  matrixValidation: ReproducibleFixtureProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: fixture ↔ contract validation, contract-wired probe
 * execution, and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runReproducibleFixtureProductionSlice(
  fixture: ReproducibleFixtureBaseline = loadReproducibleFixtureBaseline(),
): ReproducibleFixtureProductionSliceResult {
  const contract = getActiveReproducibleFixtureContract();
  const fixtureValidation = validateReproducibleFixtureBaseline(fixture);
  const contractValidation = validateReproducibleFixtureBaselineAgainstContract(fixture, contract);
  const results = runReproducibleFixtureProbes(fixture);
  const summary = summarizeReproducibleFixtureMatrix(results);
  const matrixValidation = validateReproducibleFixtureProbeMatrix(results, contract);

  return {
    atom: "P01-B07-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface ReproducibleFixtureBoundarySliceResult {
  atom: "P01-B07-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ReproducibleFixtureProbeResult[];
  boundaryResults: ReproducibleFixtureProbeResult[];
  matrixValidation: ReproducibleFixtureProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (sourceBenchmarkEval ref,
 * probe runner, known gaps) with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runReproducibleFixtureBoundarySlice(
  fixture: ReproducibleFixtureBaseline = loadReproducibleFixtureBaseline(),
): ReproducibleFixtureBoundarySliceResult {
  const contract = getActiveReproducibleFixtureContract();
  const results = runReproducibleFixtureProbes(fixture);
  const boundaryProbes = listReproducibleFixtureProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateReproducibleFixtureBoundaryProbeMatrix(results, contract);

  return {
    atom: "P01-B07-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface ReproducibleFixtureFailureRecoverySliceResult {
  atom: "P01-B07-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ReproducibleFixtureProbeResult[];
  failureRecoveryResults: ReproducibleFixtureProbeResult[];
  matrixValidation: ReproducibleFixtureProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runReproducibleFixtureFailureRecoverySlice(
  fixture: ReproducibleFixtureBaseline = loadReproducibleFixtureBaseline(),
): ReproducibleFixtureFailureRecoverySliceResult {
  const contract = getActiveReproducibleFixtureContract();
  const results = runReproducibleFixtureProbes(fixture);
  const failureRecoveryProbes = REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listReproducibleFixtureProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateReproducibleFixtureFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P01-B07-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}
