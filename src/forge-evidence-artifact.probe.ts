/**
 * FOREMAN — Evidence & Artifact Schema Probe Seam (P01-B08-A01)
 *
 * Static probes for evidence/artifact schema baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import evidenceArtifactBaseline from "./fixtures/forge-evidence-artifact-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome, ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getForgeP01B07ToB08Handoff,
  getActiveReproducibleFixtureContract,
  summarizeReproducibleFixtureContractCoverage,
} from "./forge-reproducible-fixture.js";
import {
  SEALED_FORGE_EVIDENCE_MODULES,
  EVIDENCE_ARTIFACT_CORE_EVIDENCE_FIELDS,
  EVIDENCE_ARTIFACT_CORE_TELEMETRY_FIELDS,
  EVIDENCE_ARTIFACT_CORE_PROVENANCE_FIELDS,
  EVIDENCE_ARTIFACT_RUN_RECORD_FIELDS,
  EVIDENCE_ARTIFACT_CATEGORIES,
  validateEvidenceArtifactBaseline,
  summarizeEvidenceArtifactMatrix,
  listEvidenceArtifactProbesByExpected,
  listEvidenceArtifactKnownGaps,
  FORGE_EVIDENCE_ARTIFACT_VERSION,
  getActiveEvidenceArtifactContract,
  validateEvidenceArtifactBaselineAgainstContract,
  validateEvidenceArtifactProbeMatrix,
  validateEvidenceArtifactBoundaryProbeMatrix,
  validateEvidenceArtifactFailureRecoveryProbeMatrix,
  listEvidenceArtifactFailureRecoveryProbeIds,
  EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES,
  listEvidenceArtifactContractProbesByCategory,
  buildEvidenceArtifactProbeEvidence,
  buildEvidenceArtifactProbeTelemetry,
  buildEvidenceArtifactProvenance,
  buildEvidenceArtifactRunRecord,
  validateEvidenceArtifactRunRecord,
  detectEvidenceArtifactProbeRegression,
  validateForgeEvidenceArtifactGuard,
  runEvidenceArtifactPropertyChecks,
  runEvidenceArtifactFuzzValidation,
  runEvidenceArtifactRunRecordFuzzValidation,
  listEvidenceArtifactProbesByDisposition,
  summarizeEvidenceArtifactContractCoverage,
  getForgeP01B08BlockGate,
  getForgeP01B08ToB09Handoff,
  validateEvidenceArtifactBlockHandoffContract,
  buildEvidenceArtifactBlockGateEvidence,
  type EvidenceArtifactBaseline,
  type EvidenceArtifactCategory,
  type EvidenceArtifactProbeDisposition,
  type EvidenceArtifactProbeResult,
  type EvidenceArtifactProbeMatrixValidationResult,
  type EvidenceArtifactRunRecord,
  type EvidenceArtifactProbeRegressionReport,
  type EvidenceArtifactGuardCheckResult,
  type EvidenceArtifactPropertyResult,
  type EvidenceArtifactFuzzValidationResult,
} from "./forge-evidence-artifact.js";

export type { EvidenceArtifactBaseline, EvidenceArtifactProbeResult } from "./forge-evidence-artifact.js";
export {
  validateEvidenceArtifactBaseline,
  summarizeEvidenceArtifactMatrix,
  listEvidenceArtifactProbesByExpected,
  listEvidenceArtifactKnownGaps,
  buildDefaultEvidenceArtifactSourceReproducibleFixture,
  canonicalEvidenceArtifactFixtureHash,
  EVIDENCE_ARTIFACT_CATEGORIES,
  SEALED_FORGE_EVIDENCE_MODULES,
  FORGE_EVIDENCE_ARTIFACT_VERSION,
  getActiveEvidenceArtifactContract,
  getEvidenceArtifactCategoryContract,
  listEvidenceArtifactContractProbeIds,
  listEvidenceArtifactProbesByDisposition,
  listEvidenceArtifactContractProbesByCategory,
  summarizeEvidenceArtifactContractCoverage,
  validateEvidenceArtifactContractCoverage,
  validateEvidenceArtifactBaselineAgainstContract,
  validateEvidenceArtifactProbeMatrix,
  validateEvidenceArtifactBoundaryProbeMatrix,
  validateEvidenceArtifactFailureRecoveryProbeMatrix,
  listEvidenceArtifactFailureRecoveryProbeIds,
  EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES,
  buildEvidenceArtifactProbeEvidence,
  buildEvidenceArtifactProbeTelemetry,
  buildEvidenceArtifactProvenance,
  buildEvidenceArtifactRunRecord,
  validateEvidenceArtifactFailureRecoveryRunRecord,
  validateEvidenceArtifactRunRecord,
  detectEvidenceArtifactProbeRegression,
  validateForgeEvidenceArtifactGuard,
  runEvidenceArtifactPropertyChecks,
  runEvidenceArtifactFuzzValidation,
  runEvidenceArtifactRunRecordFuzzValidation,
  FORGE_EVIDENCE_ARTIFACT_CONTRACT_V1,
  getForgeP01B08BlockGate,
  getForgeP01B08ToB09Handoff,
  validateEvidenceArtifactBlockHandoffContract,
  buildEvidenceArtifactBlockGateEvidence,
  type EvidenceArtifactProbeMatrixValidationResult,
  type EvidenceArtifactRunRecord,
  type EvidenceArtifactProbeRegressionReport,
  type EvidenceArtifactGuardCheckResult,
  type EvidenceArtifactPropertyResult,
  type EvidenceArtifactFuzzValidationResult,
} from "./forge-evidence-artifact.js";

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
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): EvidenceArtifactProbeResult {
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

function productionEvidenceArtifactSource(): string {
  return readSrc("forge-evidence-artifact.ts") + readSrc("forge-evidence-artifact.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionEvidenceArtifactSource());
}

function interfaceBody(source: string, typeName: string): string | null {
  const match = source.match(new RegExp(`export interface ${typeName}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? null;
}

function interfaceHasFields(body: string | null, fields: readonly string[]): boolean {
  if (!body) return false;
  return fields.every(field => new RegExp(`\\b${field}\\b`).test(body));
}

function probeSchemaVersioning(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: EvidenceArtifactBaseline,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`, "Evidence artifact baseline declares semver version field");
    }
    case "eva.atom_tagged": {
      const ok = fixture.atom === "P01-B08-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`, "Evidence artifact baseline declares P01-B08-A01 atom id");
    }
    case "eva.harness_version_exported": {
      const ok = FORGE_EVIDENCE_ARTIFACT_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_EVIDENCE_ARTIFACT_VERSION}`,
        "FORGE_EVIDENCE_ARTIFACT_VERSION exported for evidence schema harness",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown schema_versioning probe");
  }
}

function probeEvidenceShape(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.seven_block_evidence_exports": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const src = readSrc(entry.module);
        return !src.includes(`export interface ${entry.evidenceType}`);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.map(m => m.evidenceType).join(",") || "none"}`,
        "All seven sealed forge blocks export typed ProbeEvidence interfaces",
      );
    }
    case "eva.common_evidence_core_fields": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const body = interfaceBody(readSrc(entry.module), entry.evidenceType);
        return !interfaceHasFields(body, EVIDENCE_ARTIFACT_CORE_EVIDENCE_FIELDS);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missingCoreFields=${missing.map(m => m.evidenceType).join(",") || "none"}`,
        "All block ProbeEvidence types share core auditable fields",
      );
    }
    case "eva.unified_category_dimension": {
      const ok = readSrc("forge-evidence-artifact.ts").includes(
        "export interface ForgeEvidenceArtifactProbeEvidence",
      );
      return probe(
        id,
        category,
        expected,
        ok,
        `unifiedType=${ok}`,
        "Unified ForgeEvidenceArtifactProbeEvidence uses shared category dimension across blocks",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown evidence_shape probe");
  }
}

function probeTelemetryShape(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.seven_block_telemetry_exports": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const src = readSrc(entry.module);
        return !src.includes(`export interface ${entry.telemetryType}`);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.map(m => m.telemetryType).join(",") || "none"}`,
        "All seven sealed forge blocks export typed ProbeTelemetry interfaces",
      );
    }
    case "eva.common_telemetry_core_fields": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const body = interfaceBody(readSrc(entry.module), entry.telemetryType);
        return !interfaceHasFields(body, EVIDENCE_ARTIFACT_CORE_TELEMETRY_FIELDS);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missingCoreFields=${missing.map(m => m.telemetryType).join(",") || "none"}`,
        "All block ProbeTelemetry types share probeId, sequenceIndex and durationMs",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown telemetry_shape probe");
  }
}

function probeProvenanceLineage(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.seven_block_provenance_exports": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const src = readSrc(entry.module);
        return !src.includes(`export interface ${entry.provenanceType}`);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.map(m => m.provenanceType).join(",") || "none"}`,
        "All seven sealed forge blocks export typed provenance interfaces",
      );
    }
    case "eva.source_lineage_wired": {
      const lineageModules = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => entry.hasSourceLineage);
      const missing = lineageModules.filter(entry => {
        const body = interfaceBody(readSrc(entry.module), entry.provenanceType);
        return !body || !/source\w+Version/.test(body);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missingSourceLineage=${missing.map(m => m.provenanceType).join(",") || "none"}`,
        "B02+ provenance types wire source lineage fields to upstream sealed artifacts",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown provenance_lineage probe");
  }
}

function probeRunRecordBundle(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.seven_block_run_record_exports": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const src = readSrc(entry.module);
        return !src.includes(`export interface ${entry.runRecordType}`);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.map(m => m.runRecordType).join(",") || "none"}`,
        "All seven sealed forge blocks export typed RunRecord interfaces",
      );
    }
    case "eva.run_record_triple_bundle": {
      const missing = SEALED_FORGE_EVIDENCE_MODULES.filter(entry => {
        const body = interfaceBody(readSrc(entry.module), entry.runRecordType);
        return !interfaceHasFields(body, EVIDENCE_ARTIFACT_RUN_RECORD_FIELDS);
      });
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missingBundleFields=${missing.map(m => m.runRecordType).join(",") || "none"}`,
        "RunRecord types bundle provenance, evidence, telemetry and summary",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown run_record_bundle probe");
  }
}

function probeSchemaRegistry(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.unified_schema_type_export": {
      const ok = readSrc("forge-evidence-artifact.ts").includes(
        "export interface ForgeEvidenceArtifactSchema",
      );
      return probe(
        id,
        category,
        expected,
        ok,
        `schemaType=${ok}`,
        "ForgeEvidenceArtifactSchema exports unified cross-block evidence schema type",
      );
    }
    case "eva.cross_block_normalizer": {
      const ok = hasProductionExport("normalizeForgeEvidenceArtifact");
      return probe(
        id,
        category,
        expected,
        ok,
        `normalizer=${ok}`,
        "normalizeForgeEvidenceArtifact adapts block-specific evidence into unified schema",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown schema_registry probe");
  }
}

function probeBaselineLink(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.b07_handoff_entry": {
      const handoff = getForgeP01B07ToB08Handoff();
      const ok = handoff.targetBlock.entryAtom === "P01-B08-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `entryAtom=${handoff.targetBlock.entryAtom}`,
        "FORGE_P01_B07_TO_B08_HANDOFF_V1 targets P01-B08-A01 entry atom",
      );
    }
    case "eva.b07_sealed_probe_count": {
      const handoff = getForgeP01B07ToB08Handoff();
      const coverage = summarizeReproducibleFixtureContractCoverage(getActiveReproducibleFixtureContract());
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActiveReproducibleFixtureContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B07 handoff probeCount matches active reproducible fixture contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: EvidenceArtifactBaseline,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.source_reproducible_fixture_ref": {
      const ok =
        fixture.sourceReproducibleFixture.atom === "P01-B07-A10" &&
        fixture.sourceReproducibleFixture.probeCount === 21 &&
        fixture.sourceReproducibleFixture.reproducibleFixtureCategories === 8;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceReproducibleFixture.atom}, probes=${fixture.sourceReproducibleFixture.probeCount}`,
        "Baseline fixture references sealed sourceReproducibleFixture artifacts from B07-A10",
      );
    }
    case "eva.probe_runner_exported": {
      const ok = readSrc("forge-evidence-artifact.probe.ts").includes(
        "export function runEvidenceArtifactProbes",
      );
      return probe(
        id,
        category,
        expected,
        ok,
        `probeRunner=${ok}`,
        "runEvidenceArtifactProbes executes contract-wired probe matrix",
      );
    }
    case "eva.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}`,
        "Baseline fixture documents at least one measurable FAIL evidence schema gap",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: EvidenceArtifactBaseline,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateEvidenceArtifactBaseline(invalid).valid === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `rejectsInvalidVersion=${ok}`,
        "validateEvidenceArtifactBaseline rejects unexpected fixture version",
      );
    }
    case "eva.min_category_probes": {
      const stripped = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const result = validateEvidenceArtifactBaseline(stripped);
      const ok = result.valid === false && result.issues.some(i => i.kind === "underflow");
      return probe(
        id,
        category,
        expected,
        ok,
        `underflowDetected=${ok}`,
        "validateEvidenceArtifactBaseline enforces per-category minimum probe counts",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.recovery_missing_schema_fallback": {
      const ok =
        hasProductionExport("loadEvidenceArtifactFallback") ||
        hasProductionExport("recoverEvidenceArtifactBaseline");
      return probe(
        id,
        category,
        expected,
        ok,
        `recoveryLoader=${ok}`,
        "Recovery loader falls back when versioned evidence schema fixture file is missing",
      );
    }
    case "eva.recovery_baseline_reset": {
      const ok =
        hasProductionExport("resetEvidenceArtifactBaseline") ||
        hasProductionExport("recoveryEvidenceArtifactReset");
      return probe(
        id,
        category,
        expected,
        ok,
        `baselineReset=${ok}`,
        "Evidence artifact harness resets baseline metrics on recovery transition",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
): EvidenceArtifactProbeResult {
  switch (id) {
    case "eva.nogo_schema_drift_gate": {
      const ok =
        hasProductionExport("verifyEvidenceArtifactDrift") ||
        hasProductionExport("nogoEvidenceSchemaDriftGate") ||
        hasProductionExport("verifyForgeEvidenceArtifactGuard");
      return probe(
        id,
        category,
        expected,
        ok,
        `driftGate=${ok}`,
        "NO-GO gate halts eval when evidence schema drift is detected",
      );
    }
    case "eva.nogo_cross_block_mismatch_gate": {
      const ok =
        hasProductionExport("nogoCrossBlockMismatchGate") ||
        hasProductionExport("verifyCrossBlockEvidenceMismatch") ||
        hasProductionExport("rejectCrossBlockEvidenceMismatch");
      return probe(
        id,
        category,
        expected,
        ok,
        `crossBlockGate=${ok}`,
        "NO-GO gate rejects run when cross-block evidence shapes mismatch unified schema",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: EvidenceArtifactCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: EvidenceArtifactBaseline,
): EvidenceArtifactProbeResult {
  switch (category) {
    case "schema_versioning":
      return probeSchemaVersioning(id, category, expected, fixture);
    case "evidence_shape":
      return probeEvidenceShape(id, category, expected);
    case "telemetry_shape":
      return probeTelemetryShape(id, category, expected);
    case "provenance_lineage":
      return probeProvenanceLineage(id, category, expected);
    case "run_record_bundle":
      return probeRunRecordBundle(id, category, expected);
    case "schema_registry":
      return probeSchemaRegistry(id, category, expected);
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

export function loadEvidenceArtifactBaseline(): EvidenceArtifactBaseline {
  return evidenceArtifactBaseline as EvidenceArtifactBaseline;
}

export function runEvidenceArtifactProbes(
  fixture: EvidenceArtifactBaseline = loadEvidenceArtifactBaseline(),
): EvidenceArtifactProbeResult[] {
  const contract = getActiveEvidenceArtifactContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface EvidenceArtifactProductionSliceResult {
  atom: "P01-B08-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: EvidenceArtifactProbeResult[];
  summary: ReturnType<typeof summarizeEvidenceArtifactMatrix>;
  matrixValidation: EvidenceArtifactProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: fixture ↔ contract validation, contract-wired probe
 * execution, and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runEvidenceArtifactProductionSlice(
  fixture: EvidenceArtifactBaseline = loadEvidenceArtifactBaseline(),
): EvidenceArtifactProductionSliceResult {
  const contract = getActiveEvidenceArtifactContract();
  const fixtureValidation = validateEvidenceArtifactBaseline(fixture);
  const contractValidation = validateEvidenceArtifactBaselineAgainstContract(fixture, contract);
  const results = runEvidenceArtifactProbes(fixture);
  const summary = summarizeEvidenceArtifactMatrix(results);
  const matrixValidation = validateEvidenceArtifactProbeMatrix(results, contract);

  return {
    atom: "P01-B08-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface EvidenceArtifactBoundarySliceResult {
  atom: "P01-B08-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: EvidenceArtifactProbeResult[];
  boundaryResults: EvidenceArtifactProbeResult[];
  matrixValidation: EvidenceArtifactProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (sourceReproducibleFixture ref,
 * probe runner, known gaps) with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runEvidenceArtifactBoundarySlice(
  fixture: EvidenceArtifactBaseline = loadEvidenceArtifactBaseline(),
): EvidenceArtifactBoundarySliceResult {
  const contract = getActiveEvidenceArtifactContract();
  const results = runEvidenceArtifactProbes(fixture);
  const boundaryProbes = listEvidenceArtifactContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateEvidenceArtifactBoundaryProbeMatrix(results, contract);

  return {
    atom: "P01-B08-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface EvidenceArtifactFailureRecoverySliceResult {
  atom: "P01-B08-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: EvidenceArtifactProbeResult[];
  failureRecoveryResults: EvidenceArtifactProbeResult[];
  matrixValidation: EvidenceArtifactProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runEvidenceArtifactFailureRecoverySlice(
  fixture: EvidenceArtifactBaseline = loadEvidenceArtifactBaseline(),
): EvidenceArtifactFailureRecoverySliceResult {
  const contract = getActiveEvidenceArtifactContract();
  const results = runEvidenceArtifactProbes(fixture);
  const failureRecoveryProbes = EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listEvidenceArtifactContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateEvidenceArtifactFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P01-B08-A05",
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

function runEvidenceArtifactProbeWithTiming(
  entry: EvidenceArtifactBaseline["probes"][number],
  fixture: EvidenceArtifactBaseline,
  contractProbe:
    | { criterion: string; disposition: EvidenceArtifactProbeDisposition }
    | undefined,
): {
  result: EvidenceArtifactProbeResult;
  durationMs: number;
  disposition: EvidenceArtifactProbeDisposition;
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

function buildEvidenceArtifactRecordFromEntries(
  entries: EvidenceArtifactBaseline["probes"],
  fixture: EvidenceArtifactBaseline,
  contract: ReturnType<typeof getActiveEvidenceArtifactContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly EvidenceArtifactCategory[];
  },
): EvidenceArtifactRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildEvidenceArtifactProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildEvidenceArtifactProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runEvidenceArtifactProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildEvidenceArtifactProbeEvidence(
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
      buildEvidenceArtifactProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildEvidenceArtifactProvenance(
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

  return buildEvidenceArtifactRunRecord(provenance, evidence, telemetry);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P01-B08-A06). */
export function runEvidenceArtifactFailureRecoverySliceWithRecord(
  fixture: EvidenceArtifactBaseline = loadEvidenceArtifactBaseline(),
): EvidenceArtifactRunRecord {
  const contract = getActiveEvidenceArtifactContract();
  const failureRecoveryIds = new Set(listEvidenceArtifactFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildEvidenceArtifactRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P01-B08-A06",
    sliceCategories: EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES,
  });
}

/** Run all evidence artifact probes and emit auditable evidence, telemetry and provenance (P01-B08-A08). */
export function runEvidenceArtifactProbesWithRecord(
  fixture: EvidenceArtifactBaseline = loadEvidenceArtifactBaseline(),
): EvidenceArtifactRunRecord {
  const contract = getActiveEvidenceArtifactContract();
  return buildEvidenceArtifactRecordFromEntries(fixture.probes, fixture, contract);
}

export interface ForgeEvidenceArtifactRegressionPropertyFuzzResult {
  passed: boolean;
  properties: EvidenceArtifactPropertyResult;
  contractFuzz: EvidenceArtifactFuzzValidationResult;
  runFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface ForgeEvidenceArtifactRegressionResult {
  passed: boolean;
  record: EvidenceArtifactRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: EvidenceArtifactProbeRegressionReport | null;
  guard: EvidenceArtifactGuardCheckResult;
  propertyFuzz: ForgeEvidenceArtifactRegressionPropertyFuzzResult;
  detail: string;
}

/**
 * Execute evidence artifact probes, validate run record, property/fuzz gates, and optionally detect regression vs prior run.
 * Forge pipeline integration gate (P01-B08-A08).
 */
export function runForgeEvidenceArtifactRegressionGate(
  priorRecord?: EvidenceArtifactRunRecord,
): ForgeEvidenceArtifactRegressionResult {
  const fixture = loadEvidenceArtifactBaseline();
  const contract = getActiveEvidenceArtifactContract();
  const record = runEvidenceArtifactProbesWithRecord(fixture);
  const validation = validateEvidenceArtifactRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord ? detectEvidenceArtifactProbeRegression(priorRecord, record) : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeEvidenceArtifactGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

  const properties = runEvidenceArtifactPropertyChecks(contract);
  const contractFuzz = runEvidenceArtifactFuzzValidation(fixture, contract);
  const runFuzz = runEvidenceArtifactRunRecordFuzzValidation(record, contract);
  const propertyFuzzPassed =
    properties.allPassed &&
    contractFuzz.allMutationsRejected &&
    runFuzz.mutationsAccepted === 0;
  const propertyFuzz: ForgeEvidenceArtifactRegressionPropertyFuzzResult = {
    passed: propertyFuzzPassed,
    properties,
    contractFuzz,
    runFuzz: {
      validBaseline: runFuzz.validBaseline,
      mutationsRejected: runFuzz.mutationsRejected,
      mutationsAccepted: runFuzz.mutationsAccepted,
    },
  };

  const passed = recordValid && !alignmentRegression && guard.passed && propertyFuzzPassed;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  detailParts.push(
    `propertyFuzz: properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
  );
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
    propertyFuzz,
    detail: detailParts.join(" | "),
  };
}

/** Alias for forge-pipeline-regression integration seam (P01-B08-A08). */
export const runEvidenceArtifactRegressionIntegration = runForgeEvidenceArtifactRegressionGate;

export interface ForgeEvidenceArtifactBlockGateResult {
  passed: boolean;
  evidence: import("./forge-evidence-artifact.js").EvidenceArtifactBlockGateEvidence;
  handoff: import("./forge-evidence-artifact.js").EvidenceArtifactBlockHandoffContract;
  regression: ForgeEvidenceArtifactRegressionResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealEvidenceArtifactBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P01-B08 block gate: validate A01–A09 deliverables, regression, guard, and B09 handoff (P01-B08-A10).
 */
export function runEvidenceArtifactBlockGate(): ForgeEvidenceArtifactBlockGateResult {
  const blockGate = getForgeP01B08BlockGate();
  const handoff = getForgeP01B08ToB09Handoff();
  const contract = getActiveEvidenceArtifactContract();
  const fixture = loadEvidenceArtifactBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateEvidenceArtifactBaselineAgainstContract(fixture, contract);
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A01",
      "evidence_artifact",
      fixtureValidation.valid && fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeEvidenceArtifactContractCoverage(contract).totalProbes} probes)`
        : fixtureValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeEvidenceArtifactContractCoverage(contract);
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${EVIDENCE_ARTIFACT_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runEvidenceArtifactProductionSlice(fixture);
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runEvidenceArtifactBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.gap > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} gap=${coverage.byDisposition.gap} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runEvidenceArtifactFailureRecoverySlice(fixture);
  const nogoProbes = listEvidenceArtifactProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeEvidenceArtifactRegressionGate();
  const recordValidation = validateEvidenceArtifactRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const properties = runEvidenceArtifactPropertyChecks(contract);
  const contractFuzz = runEvidenceArtifactFuzzValidation(fixture, contract);
  const runFuzz = runEvidenceArtifactRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk = properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateEvidenceArtifactBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealEvidenceArtifactBlockAtom(
      "P01-B08-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildEvidenceArtifactBlockGateEvidence(
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

/** Alias matching ACTIVE_FRONT target name. */
export const runForgeEvidenceArtifactBlockGate = runEvidenceArtifactBlockGate;
