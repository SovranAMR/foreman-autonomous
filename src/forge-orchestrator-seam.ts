/**
 * FOREMAN — Orchestrator Seam & Modularization Baseline (P01-B09)
 *
 * Measures orchestrator.ts forge verification seams and modularization gaps
 * on sealed P01-B08 evidence artifact schema artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B08ToB09Handoff,
  getActiveEvidenceArtifactContract,
  summarizeEvidenceArtifactContractCoverage,
  EVIDENCE_ARTIFACT_CATEGORIES,
} from "./forge-evidence-artifact.js";

export const FORGE_ORCHESTRATOR_SEAM_VERSION = "1.0.0-a09";

export const ORCHESTRATOR_SEAM_CATEGORIES = [
  "seam_versioning",
  "method_inventory",
  "lazy_import_seam",
  "composition_seam",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type OrchestratorSeamCategory = (typeof ORCHESTRATOR_SEAM_CATEGORIES)[number];

/** Canonical forge verification regression methods wired on Orchestrator (P01-B01..B08). */
export const ORCHESTRATOR_FORGE_REGRESSION_METHODS = [
  "verifyForgeBaselineRegression",
  "verifyForgeBehaviorMapRegression",
  "verifyForgeFormalStateMachineRegression",
  "verifyForgePhaseEventSchemaRegression",
  "verifyForgePipelineInvariantEngineRegression",
  "verifyForgeBenchmarkEvalRegression",
  "verifyForgeReproducibleFixtureRegression",
  "verifyForgeEvidenceArtifactRegression",
] as const;

/** Guard methods — evidence artifact guard is a documented A01 gap. */
export const ORCHESTRATOR_FORGE_GUARD_METHODS = [
  "verifyForgeReproducibleFixtureGuard",
  "verifyForgeBenchmarkEvalGuard",
  "verifyForgePipelineInvariantEngineGuard",
  "verifyForgeBaselineGuard",
  "verifyForgeBehaviorMapGuard",
  "verifyForgePhaseEventSchemaGuard",
  "verifyForgeFormalStateMachineGuard",
] as const;

export const ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS = [
  "verifyForgeBaselineBlockGate",
  "verifyForgeBehaviorMapBlockGate",
  "verifyForgeFormalStateMachineBlockGate",
  "verifyForgePhaseEventSchemaBlockGate",
  "verifyForgePipelineInvariantEngineBlockGate",
  "verifyForgeBenchmarkEvalBlockGate",
  "verifyForgeReproducibleFixtureBlockGate",
  "verifyForgeEvidenceArtifactBlockGate",
] as const;

export const EXPECTED_ORCHESTRATOR_FORGE_GUARD_METHOD_COUNT = 8;

export interface OrchestratorSeamFixtureEntry {
  id: string;
  category: OrchestratorSeamCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface OrchestratorSeamBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceEvidenceArtifact: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    evidenceArtifactCategories: number;
  };
  probes: OrchestratorSeamFixtureEntry[];
}

export interface OrchestratorSeamProbeResult {
  id: string;
  category: OrchestratorSeamCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface OrchestratorSeamProbeSummary {
  total: number;
  aligned: number;
  mismatches: OrchestratorSeamProbeResult[];
  knownGaps: OrchestratorSeamProbeResult[];
  byCategory: Record<
    OrchestratorSeamCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface OrchestratorSeamValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: OrchestratorSeamCategory;
  detail: string;
}

export interface OrchestratorSeamValidationResult {
  valid: boolean;
  issues: OrchestratorSeamValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const ORCHESTRATOR_SEAM_A01_MIN_PROBES: Readonly<
  Record<OrchestratorSeamCategory, number>
> = {
  seam_versioning: 3,
  method_inventory: 3,
  lazy_import_seam: 3,
  composition_seam: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type OrchestratorSeamProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface OrchestratorSeamProbeContract {
  id: string;
  category: OrchestratorSeamCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: OrchestratorSeamProbeDisposition;
  criterion: string;
}

export interface OrchestratorSeamCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface OrchestratorSeamCategoryContract {
  category: OrchestratorSeamCategory;
  acceptance: OrchestratorSeamCategoryAcceptance;
  probes: readonly OrchestratorSeamProbeContract[];
}

export interface OrchestratorSeamContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<OrchestratorSeamCategory, OrchestratorSeamCategoryContract>;
  probes: readonly OrchestratorSeamProbeContract[];
}

export interface OrchestratorSeamContractCoverageIssue {
  kind: "missing_category" | "underflow" | "missing_criterion" | "duplicate_probe" | "coverage_mismatch";
  probeId?: string;
  category?: OrchestratorSeamCategory;
  detail: string;
}

export interface OrchestratorSeamContractCoverageResult {
  valid: boolean;
  issues: OrchestratorSeamContractCoverageIssue[];
}

function flattenOrchestratorSeamCategoryProbes(
  categories: Record<OrchestratorSeamCategory, OrchestratorSeamCategoryContract>,
): readonly OrchestratorSeamProbeContract[] {
  return ORCHESTRATOR_SEAM_CATEGORIES.flatMap(category => categories[category].probes);
}

const ORCHESTRATOR_SEAM_CATEGORY_CONTRACTS: Record<
  OrchestratorSeamCategory,
  OrchestratorSeamCategoryContract
> = {
  seam_versioning: {
    category: "seam_versioning",
    acceptance: {
      invariant:
        "Orchestrator seam baseline declares semver version, atom id and exported harness version for modularization measurement.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.version_tagged",
        category: "seam_versioning",
        description: "Orchestrator seam baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator seam baseline declares semver version field",
      },
      {
        id: "oseam.atom_tagged",
        category: "seam_versioning",
        description: "Orchestrator seam baseline declares P01-B09-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator seam baseline declares P01-B09-A01 atom id",
      },
      {
        id: "oseam.harness_version_exported",
        category: "seam_versioning",
        description: "FORGE_ORCHESTRATOR_SEAM_VERSION exported for orchestrator seam harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_ORCHESTRATOR_SEAM_VERSION exported for orchestrator seam harness",
      },
    ],
  },
  method_inventory: {
    category: "method_inventory",
    acceptance: {
      invariant:
        "Orchestrator exposes verifyForge regression, guard and block-gate method inventories aligned to sealed forge blocks.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.regression_methods_inventory",
        category: "method_inventory",
        description: "Orchestrator exposes eight verifyForge*Regression methods for sealed blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes eight verifyForge*Regression methods for sealed blocks",
      },
      {
        id: "oseam.guard_methods_inventory",
        category: "method_inventory",
        description: "Orchestrator exposes eight verifyForge*Guard methods including evidence artifact guard",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator exposes eight verifyForge*Guard methods including evidence artifact guard",
      },
      {
        id: "oseam.block_gate_methods_inventory",
        category: "method_inventory",
        description: "Orchestrator exposes eight verifyForge*BlockGate methods for sealed blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes eight verifyForge*BlockGate methods for sealed blocks",
      },
    ],
  },
  lazy_import_seam: {
    category: "lazy_import_seam",
    acceptance: {
      invariant:
        "verifyForge methods lazy-load forge harness modules and emit verification events; central import registry is a documented gap.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.dynamic_import_wiring",
        category: "lazy_import_seam",
        description: "verifyForge methods lazy-load forge harness modules via dynamic import",
        expected: "PASS",
        disposition: "observed",
        criterion: "verifyForge methods lazy-load forge harness modules via dynamic import",
      },
      {
        id: "oseam.verification_event_emit",
        category: "lazy_import_seam",
        description: "verifyForge methods emit orchestrator verification events on completion",
        expected: "PASS",
        disposition: "observed",
        criterion: "verifyForge methods emit orchestrator verification events on completion",
      },
      {
        id: "oseam.unified_lazy_import_registry",
        category: "lazy_import_seam",
        description: "Central forge module import registry routes lazy imports for all verifyForge seams",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Central forge module import registry routes lazy imports for all verifyForge seams",
      },
    ],
  },
  composition_seam: {
    category: "composition_seam",
    acceptance: {
      invariant:
        "Orchestrator exposes readonly composition fields and FORGE_PIPELINE_PHASES; dedicated IOrchestratorForgeSeam interface is a documented gap.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.readonly_subsystem_fields",
        category: "composition_seam",
        description: "Orchestrator exposes readonly resume, observer and artifactEngine composition fields",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes readonly resume, observer and artifactEngine composition fields",
      },
      {
        id: "oseam.pipeline_phases_export",
        category: "composition_seam",
        description: "Orchestrator exports FORGE_PIPELINE_PHASES canonical phase registry",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exports FORGE_PIPELINE_PHASES canonical phase registry",
      },
      {
        id: "oseam.extracted_seam_interface",
        category: "composition_seam",
        description: "Dedicated IOrchestratorForgeSeam interface segregates forge verification from pipeline run",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Dedicated IOrchestratorForgeSeam interface segregates forge verification from pipeline run",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Orchestrator seam baseline links to sealed B08 evidence artifact handoff with aligned probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.b08_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P01_B08_TO_B09_HANDOFF_V1 targets P01-B09-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P01_B08_TO_B09_HANDOFF_V1 targets P01-B09-A01 entry atom",
      },
      {
        id: "oseam.b08_sealed_probe_count",
        category: "baseline_link",
        description: "Sealed B08 handoff probeCount matches active evidence artifact contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B08 handoff probeCount matches active evidence artifact contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline fixture references sealed sourceEvidenceArtifact artifacts and documents measurable FAIL orchestrator seam gaps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.source_evidence_artifact_ref",
        category: "boundary",
        description: "Baseline fixture references sealed sourceEvidenceArtifact artifacts from B08-A10",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed sourceEvidenceArtifact artifacts from B08-A10",
      },
      {
        id: "oseam.probe_runner_exported",
        category: "boundary",
        description: "runOrchestratorSeamProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runOrchestratorSeamProbes executes contract-wired probe matrix",
      },
      {
        id: "oseam.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL orchestrator seam gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL orchestrator seam gap",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "validateOrchestratorSeamBaseline rejects invalid versions and enforces per-category minimum probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.invalid_version_rejected",
        category: "failure_path",
        description: "validateOrchestratorSeamBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateOrchestratorSeamBaseline rejects unexpected fixture version",
      },
      {
        id: "oseam.min_category_probes",
        category: "failure_path",
        description: "validateOrchestratorSeamBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateOrchestratorSeamBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Orchestrator seam harness resets verification state on recovery; handoff fallback loader is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.recovery_seam_state_reset",
        category: "recovery_path",
        description: "Orchestrator seam harness resets verification state on pipeline recovery transition",
        expected: "FAIL",
        disposition: "recovery",
        criterion: "Orchestrator seam harness resets verification state on pipeline recovery transition",
      },
      {
        id: "oseam.recovery_missing_handoff_fallback",
        category: "recovery_path",
        description: "Recovery loader falls back when B08 handoff artifact is missing or invalid",
        expected: "FAIL",
        disposition: "recovery",
        criterion: "Recovery loader falls back when B08 handoff artifact is missing or invalid",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates halt eval on orchestrator forge method inventory drift and reject verification method signature mismatches.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "oseam.nogo_seam_inventory_drift",
        category: "nogo_path",
        description: "NO-GO gate halts eval when orchestrator forge method inventory drifts from baseline",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate halts eval when orchestrator forge method inventory drifts from baseline",
      },
      {
        id: "oseam.nogo_verification_method_mismatch",
        category: "nogo_path",
        description: "NO-GO gate rejects run when verifyForge method signatures mismatch sealed inventory",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate rejects run when verifyForge method signatures mismatch sealed inventory",
      },
    ],
  },
};

/** Typed orchestrator seam contract v1 — source of truth for measurable acceptance. */
export const FORGE_ORCHESTRATOR_SEAM_CONTRACT_V1: OrchestratorSeamContract = {
  version: "1.0.0",
  atom: "P01-B09-A05",
  purpose:
    "Measurable acceptance criteria for orchestrator seam and modularization (versioning, method inventory, lazy imports, composition, B08 link, boundary, failure, recovery, NO-GO).",
  categories: ORCHESTRATOR_SEAM_CATEGORY_CONTRACTS,
  probes: flattenOrchestratorSeamCategoryProbes(ORCHESTRATOR_SEAM_CATEGORY_CONTRACTS),
};

export function getActiveOrchestratorSeamContract(): OrchestratorSeamContract {
  return FORGE_ORCHESTRATOR_SEAM_CONTRACT_V1;
}

export function getOrchestratorSeamCategoryContract(
  category: OrchestratorSeamCategory,
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): OrchestratorSeamCategoryContract {
  return contract.categories[category];
}

export function listOrchestratorSeamContractProbeIds(
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listOrchestratorSeamProbesByDisposition(
  disposition: OrchestratorSeamProbeDisposition,
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): OrchestratorSeamProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listOrchestratorSeamContractProbesByCategory(
  category: OrchestratorSeamCategory,
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): OrchestratorSeamProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeOrchestratorSeamContractCoverage(
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<OrchestratorSeamCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<OrchestratorSeamProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    OrchestratorSeamCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<OrchestratorSeamProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of ORCHESTRATOR_SEAM_CATEGORIES) {
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

export function validateOrchestratorSeamContractCoverage(
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): OrchestratorSeamContractCoverageResult {
  const issues: OrchestratorSeamContractCoverageIssue[] = [];

  for (const category of ORCHESTRATOR_SEAM_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < ORCHESTRATOR_SEAM_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${ORCHESTRATOR_SEAM_A01_MIN_PROBES[category]}`,
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

  const ids = listOrchestratorSeamContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeOrchestratorSeamContractCoverage(contract);
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
    if (!probe.id.startsWith("oseam.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing oseam. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateOrchestratorSeamBaselineAgainstContract(
  fixture: OrchestratorSeamBaseline,
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): OrchestratorSeamValidationResult {
  const issues: OrchestratorSeamValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of ORCHESTRATOR_SEAM_CATEGORIES) {
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

export function buildDefaultOrchestratorSeamSourceEvidenceArtifact(): OrchestratorSeamBaseline["sourceEvidenceArtifact"] {
  const contract = getActiveEvidenceArtifactContract();
  const coverage = summarizeEvidenceArtifactContractCoverage(contract);
  const handoff = getForgeP01B08ToB09Handoff();
  return {
    version: handoff.sealedArtifacts.fixtureVersion,
    atom: "P01-B08-A10",
    contractVersion: contract.version,
    probeCount: coverage.totalProbes,
    evidenceArtifactCategories: EVIDENCE_ARTIFACT_CATEGORIES.length,
  };
}

export function validateOrchestratorSeamBaseline(
  fixture: OrchestratorSeamBaseline,
): OrchestratorSeamValidationResult {
  const issues: OrchestratorSeamValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B09-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    ORCHESTRATOR_SEAM_CATEGORIES.map(category => [category, 0]),
  ) as Record<OrchestratorSeamCategory, number>;

  for (const probe of fixture.probes) {
    if (ids.has(probe.id)) {
      issues.push({ kind: "extra_probe", probeId: probe.id, detail: "duplicate probe id" });
    }
    ids.add(probe.id);
    byCategory[probe.category]++;
  }

  for (const category of ORCHESTRATOR_SEAM_CATEGORIES) {
    const min = ORCHESTRATOR_SEAM_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B08ToB09Handoff();
  if (fixture.sourceEvidenceArtifact.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceEvidenceArtifact.probeCount=${fixture.sourceEvidenceArtifact.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }
  if (
    fixture.sourceEvidenceArtifact.evidenceArtifactCategories !==
    handoff.sealedArtifacts.evidenceArtifactCategories.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail: "sourceEvidenceArtifact.evidenceArtifactCategories mismatch with B08 handoff",
    });
  }
  if (fixture.sourceEvidenceArtifact.contractVersion !== handoff.sealedArtifacts.contractVersion) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceEvidenceArtifact.contractVersion=${fixture.sourceEvidenceArtifact.contractVersion} handoff=${handoff.sealedArtifacts.contractVersion}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P01-B09-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B08 handoff entryAtom=${handoff.targetBlock.entryAtom}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeOrchestratorSeamMatrix(
  results: OrchestratorSeamProbeResult[],
): OrchestratorSeamProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as OrchestratorSeamProbeSummary["byCategory"];
  for (const cat of ORCHESTRATOR_SEAM_CATEGORIES) {
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

export function listOrchestratorSeamProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: OrchestratorSeamBaseline,
): OrchestratorSeamFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listOrchestratorSeamKnownGaps(
  results: OrchestratorSeamProbeResult[],
): OrchestratorSeamProbeResult[] {
  return summarizeOrchestratorSeamMatrix(results).knownGaps;
}

export interface OrchestratorSeamProbeMatrixValidationIssue {
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

export interface OrchestratorSeamProbeMatrixValidationResult {
  valid: boolean;
  issues: OrchestratorSeamProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateOrchestratorSeamProbeMatrix(
  results: OrchestratorSeamProbeResult[],
  contract: OrchestratorSeamContract = getActiveOrchestratorSeamContract(),
): OrchestratorSeamProbeMatrixValidationResult {
  const issues: OrchestratorSeamProbeMatrixValidationIssue[] = [];
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
