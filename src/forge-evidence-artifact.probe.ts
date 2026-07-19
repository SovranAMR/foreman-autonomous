/**
 * FOREMAN — Evidence & Artifact Schema Probe Seam (P01-B08-A01)
 *
 * Static probes for evidence/artifact schema baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import evidenceArtifactBaseline from "./fixtures/forge-evidence-artifact-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
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
  type EvidenceArtifactBaseline,
  type EvidenceArtifactCategory,
  type EvidenceArtifactProbeResult,
  type EvidenceArtifactProbeMatrixValidationResult,
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
  FORGE_EVIDENCE_ARTIFACT_CONTRACT_V1,
  type EvidenceArtifactProbeMatrixValidationResult,
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
