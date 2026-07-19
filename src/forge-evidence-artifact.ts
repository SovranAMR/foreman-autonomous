/**
 * FOREMAN — Evidence & Artifact Schema Baseline (P01-B08)
 *
 * Measures cross-block evidence, telemetry, provenance and run-record shapes
 * on sealed P01-B07 reproducible fixture artifacts.
 */

import { createHash } from "node:crypto";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B07ToB08Handoff,
  getActiveReproducibleFixtureContract,
  summarizeReproducibleFixtureContractCoverage,
  REPRODUCIBLE_FIXTURE_CATEGORIES,
} from "./forge-reproducible-fixture.js";

export const FORGE_EVIDENCE_ARTIFACT_VERSION = "1.0.0-a08";

export const EVIDENCE_ARTIFACT_CATEGORIES = [
  "schema_versioning",
  "evidence_shape",
  "telemetry_shape",
  "provenance_lineage",
  "run_record_bundle",
  "schema_registry",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type EvidenceArtifactCategory = (typeof EVIDENCE_ARTIFACT_CATEGORIES)[number];

/** Sealed forge modules that export per-block evidence/run-record types (P01-B01..B07). */
export const SEALED_FORGE_EVIDENCE_MODULES = [
  {
    module: "forge-baseline-contract.ts",
    evidenceType: "ForgeProbeEvidence",
    telemetryType: "ForgeProbeTelemetry",
    provenanceType: "ForgeBaselineProvenance",
    runRecordType: "ForgeBaselineRunRecord",
    hasSourceLineage: false,
  },
  {
    module: "forge-pipeline-behavior-map.ts",
    evidenceType: "BehaviorMapProbeEvidence",
    telemetryType: "BehaviorMapProbeTelemetry",
    provenanceType: "BehaviorMapProvenance",
    runRecordType: "BehaviorMapRunRecord",
    hasSourceLineage: true,
  },
  {
    module: "forge-formal-state-machine.ts",
    evidenceType: "FormalStateMachineProbeEvidence",
    telemetryType: "FormalStateMachineProbeTelemetry",
    provenanceType: "FormalStateMachineProvenance",
    runRecordType: "FormalStateMachineRunRecord",
    hasSourceLineage: true,
  },
  {
    module: "forge-phase-event-schema.ts",
    evidenceType: "PhaseEventSchemaProbeEvidence",
    telemetryType: "PhaseEventSchemaProbeTelemetry",
    provenanceType: "PhaseEventSchemaProvenance",
    runRecordType: "PhaseEventSchemaRunRecord",
    hasSourceLineage: true,
  },
  {
    module: "forge-pipeline-invariant-engine.ts",
    evidenceType: "PipelineInvariantEngineProbeEvidence",
    telemetryType: "PipelineInvariantEngineProbeTelemetry",
    provenanceType: "PipelineInvariantEngineProvenance",
    runRecordType: "PipelineInvariantEngineRunRecord",
    hasSourceLineage: true,
  },
  {
    module: "forge-benchmark-eval-harness.ts",
    evidenceType: "BenchmarkEvalProbeEvidence",
    telemetryType: "BenchmarkEvalProbeTelemetry",
    provenanceType: "BenchmarkEvalProvenance",
    runRecordType: "BenchmarkEvalRunRecord",
    hasSourceLineage: true,
  },
  {
    module: "forge-reproducible-fixture.ts",
    evidenceType: "ReproducibleFixtureProbeEvidence",
    telemetryType: "ReproducibleFixtureProbeTelemetry",
    provenanceType: "ReproducibleFixtureProvenance",
    runRecordType: "ReproducibleFixtureRunRecord",
    hasSourceLineage: true,
  },
] as const;

export const EVIDENCE_ARTIFACT_CORE_EVIDENCE_FIELDS = [
  "probeId",
  "disposition",
  "expected",
  "actual",
  "aligned",
  "criterion",
  "detail",
  "recordedAt",
] as const;

export const EVIDENCE_ARTIFACT_CORE_TELEMETRY_FIELDS = [
  "probeId",
  "sequenceIndex",
  "durationMs",
] as const;

export const EVIDENCE_ARTIFACT_CORE_PROVENANCE_FIELDS = [
  "runId",
  "harnessVersion",
  "contractVersion",
  "contractAtom",
  "fixtureVersion",
  "fixtureAtom",
  "startedAt",
  "completedAt",
  "totalProbes",
] as const;

export const EVIDENCE_ARTIFACT_RUN_RECORD_FIELDS = [
  "provenance",
  "evidence",
  "telemetry",
  "summary",
] as const;

export interface EvidenceArtifactFixtureEntry {
  id: string;
  category: EvidenceArtifactCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface EvidenceArtifactBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceReproducibleFixture: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    reproducibleFixtureCategories: number;
  };
  probes: EvidenceArtifactFixtureEntry[];
}

export interface EvidenceArtifactProbeResult {
  id: string;
  category: EvidenceArtifactCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface EvidenceArtifactProbeSummary {
  total: number;
  aligned: number;
  mismatches: EvidenceArtifactProbeResult[];
  knownGaps: EvidenceArtifactProbeResult[];
  byCategory: Record<
    EvidenceArtifactCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface EvidenceArtifactValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: EvidenceArtifactCategory;
  detail: string;
}

export interface EvidenceArtifactValidationResult {
  valid: boolean;
  issues: EvidenceArtifactValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const EVIDENCE_ARTIFACT_A01_MIN_PROBES: Readonly<
  Record<EvidenceArtifactCategory, number>
> = {
  schema_versioning: 3,
  evidence_shape: 3,
  telemetry_shape: 2,
  provenance_lineage: 2,
  run_record_bundle: 2,
  schema_registry: 2,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export function canonicalEvidenceArtifactFixtureHash(
  content: string | Buffer | Record<string, unknown>,
): string {
  const payload =
    typeof content === "string" || Buffer.isBuffer(content)
      ? content
      : JSON.stringify(content);
  return createHash("sha256").update(payload).digest("hex");
}

export function buildDefaultEvidenceArtifactSourceReproducibleFixture(): EvidenceArtifactBaseline["sourceReproducibleFixture"] {
  const contract = getActiveReproducibleFixtureContract();
  const coverage = summarizeReproducibleFixtureContractCoverage(contract);
  const handoff = getForgeP01B07ToB08Handoff();
  return {
    version: handoff.sealedArtifacts.fixtureVersion,
    atom: "P01-B07-A10",
    contractVersion: contract.version,
    probeCount: coverage.totalProbes,
    reproducibleFixtureCategories: REPRODUCIBLE_FIXTURE_CATEGORIES.length,
  };
}

export function validateEvidenceArtifactBaseline(
  fixture: EvidenceArtifactBaseline,
): EvidenceArtifactValidationResult {
  const issues: EvidenceArtifactValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B08-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    EVIDENCE_ARTIFACT_CATEGORIES.map(category => [category, 0]),
  ) as Record<EvidenceArtifactCategory, number>;

  for (const probe of fixture.probes) {
    if (ids.has(probe.id)) {
      issues.push({ kind: "extra_probe", probeId: probe.id, detail: "duplicate probe id" });
    }
    ids.add(probe.id);
    byCategory[probe.category]++;
  }

  for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
    const min = EVIDENCE_ARTIFACT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B07ToB08Handoff();
  if (fixture.sourceReproducibleFixture.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceReproducibleFixture.probeCount=${fixture.sourceReproducibleFixture.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }
  if (
    fixture.sourceReproducibleFixture.reproducibleFixtureCategories !==
    handoff.sealedArtifacts.reproducibleFixtureCategories.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail: "sourceReproducibleFixture.reproducibleFixtureCategories mismatch with B07 handoff",
    });
  }
  if (fixture.sourceReproducibleFixture.contractVersion !== handoff.sealedArtifacts.contractVersion) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceReproducibleFixture.contractVersion=${fixture.sourceReproducibleFixture.contractVersion} handoff=${handoff.sealedArtifacts.contractVersion}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeEvidenceArtifactMatrix(
  results: EvidenceArtifactProbeResult[],
): EvidenceArtifactProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as EvidenceArtifactProbeSummary["byCategory"];
  for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
    byCategory[category] = { total: 0, aligned: 0, expectedFail: 0 };
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

export function listEvidenceArtifactProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: EvidenceArtifactBaseline,
): EvidenceArtifactFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listEvidenceArtifactKnownGaps(
  results: EvidenceArtifactProbeResult[],
): EvidenceArtifactProbeResult[] {
  return summarizeEvidenceArtifactMatrix(results).knownGaps;
}
