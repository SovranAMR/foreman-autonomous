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

export type EvidenceArtifactProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface EvidenceArtifactProbeContract {
  id: string;
  category: EvidenceArtifactCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: EvidenceArtifactProbeDisposition;
  criterion: string;
}

export interface EvidenceArtifactCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface EvidenceArtifactCategoryContract {
  category: EvidenceArtifactCategory;
  acceptance: EvidenceArtifactCategoryAcceptance;
  probes: readonly EvidenceArtifactProbeContract[];
}

export interface EvidenceArtifactContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<EvidenceArtifactCategory, EvidenceArtifactCategoryContract>;
  probes: readonly EvidenceArtifactProbeContract[];
}

export interface EvidenceArtifactContractCoverageIssue {
  kind: "missing_category" | "underflow" | "missing_criterion" | "duplicate_probe" | "coverage_mismatch";
  probeId?: string;
  category?: EvidenceArtifactCategory;
  detail: string;
}

export interface EvidenceArtifactContractCoverageResult {
  valid: boolean;
  issues: EvidenceArtifactContractCoverageIssue[];
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

function flattenEvidenceArtifactCategoryProbes(
  categories: Record<EvidenceArtifactCategory, EvidenceArtifactCategoryContract>,
): readonly EvidenceArtifactProbeContract[] {
  return EVIDENCE_ARTIFACT_CATEGORIES.flatMap(category => categories[category].probes);
}

const EVIDENCE_ARTIFACT_CATEGORY_CONTRACTS: Record<
  EvidenceArtifactCategory,
  EvidenceArtifactCategoryContract
> = {
  schema_versioning: {
    category: "schema_versioning",
    acceptance: {
      invariant:
        "Evidence artifact baseline declares semver version, atom id and exported harness version for schema measurement.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.version_tagged",
        category: "schema_versioning",
        description: "Evidence artifact baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Evidence artifact baseline declares semver version field",
      },
      {
        id: "eva.atom_tagged",
        category: "schema_versioning",
        description: "Evidence artifact baseline declares P01-B08-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Evidence artifact baseline declares P01-B08-A01 atom id",
      },
      {
        id: "eva.harness_version_exported",
        category: "schema_versioning",
        description: "FORGE_EVIDENCE_ARTIFACT_VERSION exported for evidence schema harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_EVIDENCE_ARTIFACT_VERSION exported for evidence schema harness",
      },
    ],
  },
  evidence_shape: {
    category: "evidence_shape",
    acceptance: {
      invariant:
        "All seven sealed forge blocks export typed ProbeEvidence interfaces with shared core auditable fields and unified category dimension.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.seven_block_evidence_exports",
        category: "evidence_shape",
        description: "All seven sealed forge blocks export typed ProbeEvidence interfaces",
        expected: "PASS",
        disposition: "observed",
        criterion: "All seven sealed forge blocks export typed ProbeEvidence interfaces",
      },
      {
        id: "eva.common_evidence_core_fields",
        category: "evidence_shape",
        description: "All block ProbeEvidence types share core auditable fields",
        expected: "PASS",
        disposition: "observed",
        criterion: "All block ProbeEvidence types share core auditable fields",
      },
      {
        id: "eva.unified_category_dimension",
        category: "evidence_shape",
        description: "Unified ForgeEvidenceArtifactProbeEvidence uses shared category dimension across blocks",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Unified ForgeEvidenceArtifactProbeEvidence uses shared category dimension across blocks",
      },
    ],
  },
  telemetry_shape: {
    category: "telemetry_shape",
    acceptance: {
      invariant:
        "All seven sealed forge blocks export typed ProbeTelemetry interfaces with probeId, sequenceIndex and durationMs.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.seven_block_telemetry_exports",
        category: "telemetry_shape",
        description: "All seven sealed forge blocks export typed ProbeTelemetry interfaces",
        expected: "PASS",
        disposition: "observed",
        criterion: "All seven sealed forge blocks export typed ProbeTelemetry interfaces",
      },
      {
        id: "eva.common_telemetry_core_fields",
        category: "telemetry_shape",
        description: "All block ProbeTelemetry types share probeId, sequenceIndex and durationMs",
        expected: "PASS",
        disposition: "observed",
        criterion: "All block ProbeTelemetry types share probeId, sequenceIndex and durationMs",
      },
    ],
  },
  provenance_lineage: {
    category: "provenance_lineage",
    acceptance: {
      invariant:
        "All seven sealed forge blocks export typed provenance interfaces with B02+ source lineage wiring.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.seven_block_provenance_exports",
        category: "provenance_lineage",
        description: "All seven sealed forge blocks export typed provenance interfaces",
        expected: "PASS",
        disposition: "observed",
        criterion: "All seven sealed forge blocks export typed provenance interfaces",
      },
      {
        id: "eva.source_lineage_wired",
        category: "provenance_lineage",
        description: "B02+ provenance types wire source lineage fields to upstream sealed artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "B02+ provenance types wire source lineage fields to upstream sealed artifacts",
      },
    ],
  },
  run_record_bundle: {
    category: "run_record_bundle",
    acceptance: {
      invariant:
        "All seven sealed forge blocks export RunRecord types bundling provenance, evidence, telemetry and summary.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.seven_block_run_record_exports",
        category: "run_record_bundle",
        description: "All seven sealed forge blocks export typed RunRecord interfaces",
        expected: "PASS",
        disposition: "observed",
        criterion: "All seven sealed forge blocks export typed RunRecord interfaces",
      },
      {
        id: "eva.run_record_triple_bundle",
        category: "run_record_bundle",
        description: "RunRecord types bundle provenance, evidence, telemetry and summary",
        expected: "PASS",
        disposition: "observed",
        criterion: "RunRecord types bundle provenance, evidence, telemetry and summary",
      },
    ],
  },
  schema_registry: {
    category: "schema_registry",
    acceptance: {
      invariant:
        "Unified ForgeEvidenceArtifactSchema and cross-block normalizer adapt block-specific evidence into shared schema registry.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.unified_schema_type_export",
        category: "schema_registry",
        description: "ForgeEvidenceArtifactSchema exports unified cross-block evidence schema type",
        expected: "FAIL",
        disposition: "gap",
        criterion: "ForgeEvidenceArtifactSchema exports unified cross-block evidence schema type",
      },
      {
        id: "eva.cross_block_normalizer",
        category: "schema_registry",
        description: "normalizeForgeEvidenceArtifact adapts block-specific evidence into unified schema",
        expected: "FAIL",
        disposition: "gap",
        criterion: "normalizeForgeEvidenceArtifact adapts block-specific evidence into unified schema",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Evidence artifact baseline links to sealed B07 handoff with matching probe count and contract version.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.b07_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P01_B07_TO_B08_HANDOFF_V1 targets P01-B08-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P01_B07_TO_B08_HANDOFF_V1 targets P01-B08-A01 entry atom",
      },
      {
        id: "eva.b07_sealed_probe_count",
        category: "baseline_link",
        description: "Sealed B07 handoff probeCount matches active reproducible fixture contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B07 handoff probeCount matches active reproducible fixture contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Evidence artifact baseline references sealed B07 artifacts, exports probe runner and documents known FAIL gaps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.source_reproducible_fixture_ref",
        category: "boundary",
        description: "Baseline fixture references sealed sourceReproducibleFixture artifacts from B07-A10",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed sourceReproducibleFixture artifacts from B07-A10",
      },
      {
        id: "eva.probe_runner_exported",
        category: "boundary",
        description: "runEvidenceArtifactProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runEvidenceArtifactProbes executes contract-wired probe matrix",
      },
      {
        id: "eva.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL evidence schema gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL evidence schema gap",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "validateEvidenceArtifactBaseline rejects invalid versions and enforces per-category minimum probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.invalid_version_rejected",
        category: "failure_path",
        description: "validateEvidenceArtifactBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateEvidenceArtifactBaseline rejects unexpected fixture version",
      },
      {
        id: "eva.min_category_probes",
        category: "failure_path",
        description: "validateEvidenceArtifactBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateEvidenceArtifactBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Evidence artifact harness provides recovery loader fallback and baseline reset on recovery transition.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.recovery_missing_schema_fallback",
        category: "recovery_path",
        description: "Recovery loader falls back when versioned evidence schema fixture file is missing",
        expected: "FAIL",
        disposition: "recovery",
        criterion: "Recovery loader falls back when versioned evidence schema fixture file is missing",
      },
      {
        id: "eva.recovery_baseline_reset",
        category: "recovery_path",
        description: "Evidence artifact harness resets baseline metrics on recovery transition",
        expected: "FAIL",
        disposition: "recovery",
        criterion: "Evidence artifact harness resets baseline metrics on recovery transition",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates halt eval on evidence schema drift and reject runs when cross-block evidence shapes mismatch unified schema.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "eva.nogo_schema_drift_gate",
        category: "nogo_path",
        description: "NO-GO gate halts eval when evidence schema drift is detected",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate halts eval when evidence schema drift is detected",
      },
      {
        id: "eva.nogo_cross_block_mismatch_gate",
        category: "nogo_path",
        description: "NO-GO gate rejects run when cross-block evidence shapes mismatch unified schema",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate rejects run when cross-block evidence shapes mismatch unified schema",
      },
    ],
  },
};

/** Typed evidence artifact contract v1 — source of truth for measurable acceptance. */
export const FORGE_EVIDENCE_ARTIFACT_CONTRACT_V1: EvidenceArtifactContract = {
  version: "1.0.0",
  atom: "P01-B08-A05",
  purpose:
    "Measurable acceptance criteria for evidence and artifact schema (versioning, shapes, lineage, run-record bundle, schema registry, B07 link, boundary, failure, recovery, NO-GO).",
  categories: EVIDENCE_ARTIFACT_CATEGORY_CONTRACTS,
  probes: flattenEvidenceArtifactCategoryProbes(EVIDENCE_ARTIFACT_CATEGORY_CONTRACTS),
};

export function getActiveEvidenceArtifactContract(): EvidenceArtifactContract {
  return FORGE_EVIDENCE_ARTIFACT_CONTRACT_V1;
}

export function getEvidenceArtifactCategoryContract(
  category: EvidenceArtifactCategory,
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactCategoryContract {
  return contract.categories[category];
}

export function listEvidenceArtifactContractProbeIds(
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listEvidenceArtifactProbesByDisposition(
  disposition: EvidenceArtifactProbeDisposition,
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listEvidenceArtifactContractProbesByCategory(
  category: EvidenceArtifactCategory,
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeEvidenceArtifactContractCoverage(
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<EvidenceArtifactCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<EvidenceArtifactProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    EvidenceArtifactCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<EvidenceArtifactProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    for (const probe of categoryContract.probes) {
      totalProbes++;
      if (probe.expected === "PASS") expectedPass++;
      else expectedFail++;
      byDisposition[probe.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateEvidenceArtifactContractCoverage(
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactContractCoverageResult {
  const issues: EvidenceArtifactContractCoverageIssue[] = [];

  for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < EVIDENCE_ARTIFACT_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${EVIDENCE_ARTIFACT_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryContract.probes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.invariant.trim().length <= 20) {
      issues.push({
        kind: "missing_criterion",
        category,
        detail: `${category} invariant too short`,
      });
    }
    for (const probe of categoryContract.probes) {
      if (probe.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probe.id,
          detail: `${probe.id} criterion too short`,
        });
      }
    }
  }

  const ids = listEvidenceArtifactContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeEvidenceArtifactContractCoverage(contract);
  if (summary.totalProbes !== ids.length) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `totalProbes=${summary.totalProbes} ids=${ids.length}`,
    });
  }
  const dispositionSum =
    summary.byDisposition.observed +
    summary.byDisposition.gap +
    summary.byDisposition.failure +
    summary.byDisposition.recovery +
    summary.byDisposition.nogo;
  if (dispositionSum !== summary.totalProbes) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `disposition sum=${dispositionSum} total=${summary.totalProbes}`,
    });
  }

  for (const probe of contract.probes) {
    if (!probe.id.startsWith("eva.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing eva. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateEvidenceArtifactBaselineAgainstContract(
  fixture: EvidenceArtifactBaseline,
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactValidationResult {
  const issues: EvidenceArtifactValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
  }

  for (const probe of contract.probes) {
    if (!fixtureIds.has(probe.id)) {
      issues.push({ kind: "missing_probe", probeId: probe.id, detail: `fixture missing ${probe.id}` });
    }
  }

  for (const entry of fixture.probes) {
    if (!contractIds.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: `fixture extra ${entry.id}` });
      continue;
    }
    const expected = contract.probes.find(p => p.id === entry.id)!;
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${expected.expected}`,
      });
    }
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
  }

  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({ kind: "missing_category", detail: "fixture must document known FAIL gaps matching contract" });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

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

export interface EvidenceArtifactProbeMatrixValidationIssue {
  kind:
    | "missing_result"
    | "unexpected_mismatch"
    | "pass_mismatch"
    | "gap_misaligned"
    | "criterion_mismatch"
    | "extra_result";
  probeId?: string;
  detail: string;
}

export interface EvidenceArtifactProbeMatrixValidationResult {
  valid: boolean;
  issues: EvidenceArtifactProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateEvidenceArtifactProbeMatrix(
  results: EvidenceArtifactProbeResult[],
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactProbeMatrixValidationResult {
  const issues: EvidenceArtifactProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(r => [r.id, r]));
  let passAligned = 0;
  let gapAligned = 0;
  let unexpectedMismatches = 0;

  for (const contractProbe of contract.probes) {
    const result = resultById.get(contractProbe.id);
    if (!result) {
      issues.push({
        kind: "missing_result",
        probeId: contractProbe.id,
        detail: `probe matrix missing ${contractProbe.id}`,
      });
      unexpectedMismatches++;
      continue;
    }

    if (result.criterion && result.criterion !== contractProbe.criterion) {
      issues.push({
        kind: "criterion_mismatch",
        probeId: contractProbe.id,
        detail: `criterion mismatch result=${result.criterion} contract=${contractProbe.criterion}`,
      });
      unexpectedMismatches++;
    }

    if (contractProbe.expected === "PASS") {
      if (result.aligned) {
        passAligned++;
      } else {
        issues.push({
          kind: "pass_mismatch",
          probeId: contractProbe.id,
          detail: `PASS probe misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
    } else if (contractProbe.expected === "FAIL") {
      if (result.aligned && result.actual === "FAIL") {
        gapAligned++;
      } else {
        issues.push({
          kind: "gap_misaligned",
          probeId: contractProbe.id,
          detail: `documented FAIL gap misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
    } else if (!result.aligned) {
      issues.push({
        kind: "unexpected_mismatch",
        probeId: contractProbe.id,
        detail: `unexpected mismatch: expected=${result.expected} actual=${result.actual}`,
      });
      unexpectedMismatches++;
    }
  }

  for (const result of results) {
    if (!contract.probes.some(p => p.id === result.id)) {
      issues.push({
        kind: "extra_result",
        probeId: result.id,
        detail: `probe matrix extra ${result.id}`,
      });
      unexpectedMismatches++;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    passAligned,
    gapAligned,
    unexpectedMismatches,
  };
}

/**
 * Validate boundary category probe matrix — A04 slice gate.
 * PASS boundary probes must align; documented FAIL gaps in boundary category preserved.
 */
export function validateEvidenceArtifactBoundaryProbeMatrix(
  results: EvidenceArtifactProbeResult[],
  contract: EvidenceArtifactContract = getActiveEvidenceArtifactContract(),
): EvidenceArtifactProbeMatrixValidationResult {
  const boundaryProbes = listEvidenceArtifactContractProbesByCategory("boundary", contract);
  const boundaryContract: EvidenceArtifactContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateEvidenceArtifactProbeMatrix(boundaryResults, boundaryContract);
}
