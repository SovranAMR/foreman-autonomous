/**
 * FOREMAN — Integrated Forge Baseline Gate (P01-B10)
 *
 * Measures cross-block integrated gate behavior on sealed P01-B09 orchestrator seam artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B09ToB10Handoff,
  getActiveOrchestratorSeamContract,
  summarizeOrchestratorSeamContractCoverage,
  ORCHESTRATOR_SEAM_CATEGORIES,
  ORCHESTRATOR_FORGE_REGRESSION_METHODS,
  ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS,
} from "./forge-orchestrator-seam.js";

export const FORGE_INTEGRATED_BASELINE_VERSION = "1.0.0-a10";

export const INTEGRATED_BASELINE_CATEGORIES = [
  "gate_versioning",
  "block_inventory",
  "regression_integration",
  "guard_integration",
  "block_gate_integration",
  "orchestrator_seam_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type IntegratedBaselineCategory = (typeof INTEGRATED_BASELINE_CATEGORIES)[number];

/** Canonical sealed P01 blocks B01–B09 with fixture and orchestrator verification methods. */
export const SEALED_FORGE_BLOCK_INVENTORY = [
  {
    blockId: "P01-B01",
    title: "Mission ve acceptance contract",
    fixture: "forge-baseline-v1.json",
    regressionMethod: "verifyForgeBaselineRegression",
    blockGateMethod: "verifyForgeBaselineBlockGate",
  },
  {
    blockId: "P01-B02",
    title: "Mevcut pipeline davranış haritası",
    fixture: "forge-pipeline-behavior-map-v1.json",
    regressionMethod: "verifyForgeBehaviorMapRegression",
    blockGateMethod: "verifyForgeBehaviorMapBlockGate",
  },
  {
    blockId: "P01-B03",
    title: "Formal state machine",
    fixture: "forge-formal-state-machine-v1.json",
    regressionMethod: "verifyForgeFormalStateMachineRegression",
    blockGateMethod: "verifyForgeFormalStateMachineBlockGate",
  },
  {
    blockId: "P01-B04",
    title: "Typed phase/event schema",
    fixture: "forge-phase-event-schema-v1.json",
    regressionMethod: "verifyForgePhaseEventSchemaRegression",
    blockGateMethod: "verifyForgePhaseEventSchemaBlockGate",
  },
  {
    blockId: "P01-B05",
    title: "Pipeline invariant engine",
    fixture: "forge-pipeline-invariant-engine-v1.json",
    regressionMethod: "verifyForgePipelineInvariantEngineRegression",
    blockGateMethod: "verifyForgePipelineInvariantEngineBlockGate",
  },
  {
    blockId: "P01-B06",
    title: "Benchmark ve eval harness",
    fixture: "forge-benchmark-eval-harness-v1.json",
    regressionMethod: "verifyForgeBenchmarkEvalRegression",
    blockGateMethod: "verifyForgeBenchmarkEvalBlockGate",
  },
  {
    blockId: "P01-B07",
    title: "Reproducible fixture sistemi",
    fixture: "forge-reproducible-fixture-v1.json",
    regressionMethod: "verifyForgeReproducibleFixtureRegression",
    blockGateMethod: "verifyForgeReproducibleFixtureBlockGate",
  },
  {
    blockId: "P01-B08",
    title: "Evidence ve artifact schema",
    fixture: "forge-evidence-artifact-v1.json",
    regressionMethod: "verifyForgeEvidenceArtifactRegression",
    blockGateMethod: "verifyForgeEvidenceArtifactBlockGate",
  },
  {
    blockId: "P01-B09",
    title: "Orchestrator seam ve modülerleşme",
    fixture: "forge-orchestrator-seam-v1.json",
    regressionMethod: "verifyForgeOrchestratorSeamRegression",
    blockGateMethod: "verifyForgeOrchestratorSeamBlockGate",
  },
] as const;

export const EXPECTED_SEALED_BLOCK_COUNT = SEALED_FORGE_BLOCK_INVENTORY.length;

export const INTEGRATED_FORGE_REGRESSION_METHODS = [
  ...ORCHESTRATOR_FORGE_REGRESSION_METHODS,
  "verifyForgeOrchestratorSeamRegression",
] as const;

export const INTEGRATED_FORGE_BLOCK_GATE_METHODS = [
  ...ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS,
  "verifyForgeOrchestratorSeamBlockGate",
] as const;

export interface IntegratedBaselineFixtureEntry {
  id: string;
  category: IntegratedBaselineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface IntegratedBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceOrchestratorSeam: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    orchestratorSeamCategories: number;
  };
  probes: IntegratedBaselineFixtureEntry[];
}

export interface IntegratedBaselineProbeResult {
  id: string;
  category: IntegratedBaselineCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface IntegratedBaselineProbeSummary {
  total: number;
  aligned: number;
  mismatches: IntegratedBaselineProbeResult[];
  knownGaps: IntegratedBaselineProbeResult[];
  byCategory: Record<
    IntegratedBaselineCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface IntegratedBaselineValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: IntegratedBaselineCategory;
  detail: string;
}

export interface IntegratedBaselineValidationResult {
  valid: boolean;
  issues: IntegratedBaselineValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const INTEGRATED_BASELINE_A01_MIN_PROBES: Readonly<
  Record<IntegratedBaselineCategory, number>
> = {
  gate_versioning: 3,
  block_inventory: 3,
  regression_integration: 3,
  guard_integration: 2,
  block_gate_integration: 2,
  orchestrator_seam_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type IntegratedBaselineProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface IntegratedBaselineProbeContract {
  id: string;
  category: IntegratedBaselineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: IntegratedBaselineProbeDisposition;
  criterion: string;
}

export interface IntegratedBaselineCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface IntegratedBaselineCategoryContract {
  category: IntegratedBaselineCategory;
  acceptance: IntegratedBaselineCategoryAcceptance;
  probes: readonly IntegratedBaselineProbeContract[];
}

export interface IntegratedBaselineContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<IntegratedBaselineCategory, IntegratedBaselineCategoryContract>;
  probes: readonly IntegratedBaselineProbeContract[];
}

export interface IntegratedBaselineContractCoverageIssue {
  kind: "missing_category" | "underflow" | "missing_criterion" | "duplicate_probe" | "coverage_mismatch";
  probeId?: string;
  category?: IntegratedBaselineCategory;
  detail: string;
}

export interface IntegratedBaselineContractCoverageResult {
  valid: boolean;
  issues: IntegratedBaselineContractCoverageIssue[];
}

function flattenIntegratedBaselineCategoryProbes(
  categories: Record<IntegratedBaselineCategory, IntegratedBaselineCategoryContract>,
): readonly IntegratedBaselineProbeContract[] {
  return INTEGRATED_BASELINE_CATEGORIES.flatMap(category => categories[category].probes);
}

const INTEGRATED_BASELINE_CATEGORY_CONTRACTS: Record<
  IntegratedBaselineCategory,
  IntegratedBaselineCategoryContract
> = {
  gate_versioning: {
    category: "gate_versioning",
    acceptance: {
      invariant:
        "Integrated baseline declares semver version, atom id and exported harness version for cross-block gate measurement.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.version_tagged",
        category: "gate_versioning",
        description: "Integrated baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Integrated baseline declares semver version field",
      },
      {
        id: "ibase.atom_tagged",
        category: "gate_versioning",
        description: "Integrated baseline declares P01-B10-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Integrated baseline declares P01-B10-A01 atom id",
      },
      {
        id: "ibase.harness_version_exported",
        category: "gate_versioning",
        description: "FORGE_INTEGRATED_BASELINE_VERSION exported for integrated gate harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_INTEGRATED_BASELINE_VERSION exported for integrated gate harness",
      },
    ],
  },
  block_inventory: {
    category: "block_inventory",
    acceptance: {
      invariant:
        "Sealed P01 block inventory exposes nine block-gate methods and fixture registry; unified catalog export is a documented gap.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.nine_blocks_sealed",
        category: "block_inventory",
        description: "Orchestrator exposes nine verifyForge*BlockGate methods for sealed P01 blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes nine verifyForge*BlockGate methods for sealed P01 blocks",
      },
      {
        id: "ibase.block_fixture_registry",
        category: "block_inventory",
        description: "All nine sealed block baseline fixtures exist under src/fixtures",
        expected: "PASS",
        disposition: "observed",
        criterion: "All nine sealed block baseline fixtures exist under src/fixtures",
      },
      {
        id: "ibase.unified_block_catalog",
        category: "block_inventory",
        description: "Central SealedForgeBlockCatalog type exports canonical block inventory for integrated gate",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Central SealedForgeBlockCatalog type exports canonical block inventory for integrated gate",
      },
    ],
  },
  regression_integration: {
    category: "regression_integration",
    acceptance: {
      invariant:
        "Orchestrator exposes nine regression methods including orchestrator seam wiring; unified integrated regression runner is a documented gap.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.nine_regression_methods",
        category: "regression_integration",
        description: "Orchestrator exposes nine verifyForge*Regression methods including orchestrator seam",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes nine verifyForge*Regression methods including orchestrator seam",
      },
      {
        id: "ibase.orchestrator_seam_regression_wired",
        category: "regression_integration",
        description: "verifyForgeOrchestratorSeamRegression lazy-loads orchestrator seam regression gate",
        expected: "PASS",
        disposition: "observed",
        criterion: "verifyForgeOrchestratorSeamRegression lazy-loads orchestrator seam regression gate",
      },
      {
        id: "ibase.unified_regression_runner",
        category: "regression_integration",
        description: "Orchestrator exposes verifyForgeIntegratedRegression for cross-block integrated baseline gate",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator exposes verifyForgeIntegratedRegression for cross-block integrated baseline gate",
      },
    ],
  },
  guard_integration: {
    category: "guard_integration",
    acceptance: {
      invariant:
        "Orchestrator exposes verifyForge guard methods for sealed blocks; unified integrated guard sweep is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.orchestrator_guard_methods",
        category: "guard_integration",
        description: "Orchestrator exposes verifyForge*Guard methods for sealed block guard gates",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes verifyForge*Guard methods for sealed block guard gates",
      },
      {
        id: "ibase.integrated_guard_orchestrator",
        category: "guard_integration",
        description: "Orchestrator exposes verifyForgeIntegratedGuard for unified adversarial guard sweep",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator exposes verifyForgeIntegratedGuard for unified adversarial guard sweep",
      },
    ],
  },
  block_gate_integration: {
    category: "block_gate_integration",
    acceptance: {
      invariant:
        "Orchestrator block gate inventory includes orchestrator seam gate; integrated block gate method sealing P01 phase is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.nine_block_gate_methods",
        category: "block_gate_integration",
        description: "Orchestrator block gate inventory includes orchestrator seam block gate",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator block gate inventory includes orchestrator seam block gate",
      },
      {
        id: "ibase.integrated_block_gate_method",
        category: "block_gate_integration",
        description: "Orchestrator exposes verifyForgeIntegratedBlockGate sealing P01 phase integrated gate",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator exposes verifyForgeIntegratedBlockGate sealing P01 phase integrated gate",
      },
    ],
  },
  orchestrator_seam_link: {
    category: "orchestrator_seam_link",
    acceptance: {
      invariant:
        "Integrated baseline links to sealed B09 orchestrator seam handoff with aligned probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.b09_handoff_entry",
        category: "orchestrator_seam_link",
        description: "FORGE_P01_B09_TO_B10_HANDOFF_V1 targets P01-B10-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P01_B09_TO_B10_HANDOFF_V1 targets P01-B10-A01 entry atom",
      },
      {
        id: "ibase.b09_sealed_probe_count",
        category: "orchestrator_seam_link",
        description: "Sealed B09 handoff probeCount matches active orchestrator seam contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B09 handoff probeCount matches active orchestrator seam contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline fixture references sealed sourceOrchestratorSeam artifacts and documents measurable FAIL integrated gate gaps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.source_orchestrator_seam_ref",
        category: "boundary",
        description: "Baseline fixture references sealed sourceOrchestratorSeam artifacts from B09-A10",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed sourceOrchestratorSeam artifacts from B09-A10",
      },
      {
        id: "ibase.probe_runner_exported",
        category: "boundary",
        description: "runIntegratedBaselineProbes executes contract-wired integrated probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runIntegratedBaselineProbes executes contract-wired integrated probe matrix",
      },
      {
        id: "ibase.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL integrated gate gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL integrated gate gap",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "validateIntegratedBaseline rejects invalid versions and enforces per-category minimum probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.invalid_version_rejected",
        category: "failure_path",
        description: "validateIntegratedBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateIntegratedBaseline rejects unexpected fixture version",
      },
      {
        id: "ibase.min_category_probes",
        category: "failure_path",
        description: "validateIntegratedBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateIntegratedBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Integrated gate harness resets cross-block verification state on recovery; B09 handoff fallback loader is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.recovery_integrated_state_reset",
        category: "recovery_path",
        description: "Integrated gate harness resets cross-block verification state on pipeline recovery transition",
        expected: "FAIL",
        disposition: "recovery",
        criterion: "Integrated gate harness resets cross-block verification state on pipeline recovery transition",
      },
      {
        id: "ibase.recovery_missing_b09_handoff_fallback",
        category: "recovery_path",
        description: "Recovery loader falls back when B09 handoff artifact is missing or invalid",
        expected: "FAIL",
        disposition: "recovery",
        criterion: "Recovery loader falls back when B09 handoff artifact is missing or invalid",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates halt eval on sealed block inventory drift and reject integrated gate probe signature mismatches.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "ibase.nogo_block_inventory_drift",
        category: "nogo_path",
        description: "NO-GO gate halts eval when sealed block inventory drifts from integrated baseline",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate halts eval when sealed block inventory drifts from integrated baseline",
      },
      {
        id: "ibase.nogo_integrated_gate_mismatch",
        category: "nogo_path",
        description: "NO-GO gate rejects run when integrated gate probe signatures mismatch sealed inventory",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate rejects run when integrated gate probe signatures mismatch sealed inventory",
      },
    ],
  },
};

/** Typed integrated baseline contract v1 — source of truth for measurable acceptance. */
export const FORGE_INTEGRATED_BASELINE_CONTRACT_V1: IntegratedBaselineContract = {
  version: "1.0.0",
  atom: "P01-B10-A05",
  purpose:
    "Measurable acceptance criteria for integrated Forge baseline gate (versioning, block inventory, regression, guard, block gate, B09 link, boundary, failure, recovery, NO-GO).",
  categories: INTEGRATED_BASELINE_CATEGORY_CONTRACTS,
  probes: flattenIntegratedBaselineCategoryProbes(INTEGRATED_BASELINE_CATEGORY_CONTRACTS),
};

export function getActiveIntegratedBaselineContract(): IntegratedBaselineContract {
  return FORGE_INTEGRATED_BASELINE_CONTRACT_V1;
}

export function getIntegratedBaselineCategoryContract(
  category: IntegratedBaselineCategory,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineCategoryContract {
  return contract.categories[category];
}

export function listIntegratedBaselineContractProbeIds(
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listIntegratedBaselineProbesByDisposition(
  disposition: IntegratedBaselineProbeDisposition,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listIntegratedBaselineContractProbesByCategory(
  category: IntegratedBaselineCategory,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeIntegratedBaselineContractCoverage(
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<IntegratedBaselineCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<IntegratedBaselineProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    IntegratedBaselineCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<IntegratedBaselineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of INTEGRATED_BASELINE_CATEGORIES) {
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

export function validateIntegratedBaselineContractCoverage(
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineContractCoverageResult {
  const issues: IntegratedBaselineContractCoverageIssue[] = [];

  for (const category of INTEGRATED_BASELINE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < INTEGRATED_BASELINE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${INTEGRATED_BASELINE_A01_MIN_PROBES[category]}`,
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

  const ids = listIntegratedBaselineContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeIntegratedBaselineContractCoverage(contract);
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
    if (!probe.id.startsWith("ibase.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing ibase. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateIntegratedBaselineAgainstContract(
  fixture: IntegratedBaseline,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineValidationResult {
  const issues: IntegratedBaselineValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of INTEGRATED_BASELINE_CATEGORIES) {
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

export function buildDefaultIntegratedSourceOrchestratorSeam(): IntegratedBaseline["sourceOrchestratorSeam"] {
  const contract = getActiveOrchestratorSeamContract();
  const coverage = summarizeOrchestratorSeamContractCoverage(contract);
  const handoff = getForgeP01B09ToB10Handoff();
  return {
    version: handoff.sealedArtifacts.fixtureVersion,
    atom: "P01-B09-A10",
    contractVersion: contract.version,
    probeCount: coverage.totalProbes,
    orchestratorSeamCategories: ORCHESTRATOR_SEAM_CATEGORIES.length,
  };
}

export function validateIntegratedBaseline(
  fixture: IntegratedBaseline,
): IntegratedBaselineValidationResult {
  const issues: IntegratedBaselineValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B10-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    INTEGRATED_BASELINE_CATEGORIES.map(category => [category, 0]),
  ) as Record<IntegratedBaselineCategory, number>;

  for (const probe of fixture.probes) {
    if (ids.has(probe.id)) {
      issues.push({ kind: "extra_probe", probeId: probe.id, detail: "duplicate probe id" });
    }
    ids.add(probe.id);
    byCategory[probe.category]++;
  }

  for (const category of INTEGRATED_BASELINE_CATEGORIES) {
    const min = INTEGRATED_BASELINE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B09ToB10Handoff();
  if (fixture.sourceOrchestratorSeam.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceOrchestratorSeam.probeCount=${fixture.sourceOrchestratorSeam.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }
  if (
    fixture.sourceOrchestratorSeam.orchestratorSeamCategories !==
    handoff.sealedArtifacts.orchestratorSeamCategories.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail: "sourceOrchestratorSeam.orchestratorSeamCategories mismatch with B09 handoff",
    });
  }
  if (fixture.sourceOrchestratorSeam.contractVersion !== handoff.sealedArtifacts.contractVersion) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceOrchestratorSeam.contractVersion=${fixture.sourceOrchestratorSeam.contractVersion} handoff=${handoff.sealedArtifacts.contractVersion}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P01-B10-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B09 handoff entryAtom=${handoff.targetBlock.entryAtom}`,
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

export function summarizeIntegratedBaselineMatrix(
  results: IntegratedBaselineProbeResult[],
): IntegratedBaselineProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as IntegratedBaselineProbeSummary["byCategory"];
  for (const cat of INTEGRATED_BASELINE_CATEGORIES) {
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

export function listIntegratedBaselineProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: IntegratedBaseline,
): IntegratedBaselineFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listIntegratedBaselineKnownGaps(
  results: IntegratedBaselineProbeResult[],
): IntegratedBaselineProbeResult[] {
  return results.filter(r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned);
}

export interface IntegratedBaselineProbeMatrixValidationIssue {
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

export interface IntegratedBaselineProbeMatrixValidationResult {
  valid: boolean;
  issues: IntegratedBaselineProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateIntegratedBaselineProbeMatrix(
  results: IntegratedBaselineProbeResult[],
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineProbeMatrixValidationResult {
  const issues: IntegratedBaselineProbeMatrixValidationIssue[] = [];
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
 * Validate boundary-category probe matrix — A04 slice gate.
 * PASS boundary probes must align; documented FAIL gaps in boundary category preserved.
 */
export function validateIntegratedBaselineBoundaryProbeMatrix(
  results: IntegratedBaselineProbeResult[],
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineProbeMatrixValidationResult {
  const boundaryProbes = listIntegratedBaselineContractProbesByCategory("boundary", contract);
  const boundaryContract: IntegratedBaselineContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateIntegratedBaselineProbeMatrix(boundaryResults, boundaryContract);
}

export const INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly IntegratedBaselineCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateIntegratedBaselineFailureRecoveryProbeMatrix(
  results: IntegratedBaselineProbeResult[],
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineProbeMatrixValidationResult {
  const failureRecoveryProbes = INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listIntegratedBaselineContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: IntegratedBaselineContract = {
    ...contract,
    probes: failureRecoveryProbes,
    categories: {
      ...contract.categories,
      failure_path: contract.categories.failure_path,
      recovery_path: contract.categories.recovery_path,
      nogo_path: contract.categories.nogo_path,
    },
  };
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  return validateIntegratedBaselineProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listIntegratedBaselineFailureRecoveryProbeIds(
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): string[] {
  return INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listIntegratedBaselineContractProbesByCategory(category, contract).map(p => p.id),
  );
}
