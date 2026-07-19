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
        "Orchestrator exposes nine regression methods including orchestrator seam wiring and verifyForgeIntegratedRegression for integrated baseline gate.",
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
        description: "verifyForgeIntegratedRegression lazy-loads integrated baseline regression gate",
        expected: "PASS",
        disposition: "observed",
        criterion: "verifyForgeIntegratedRegression lazy-loads integrated baseline regression gate",
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

// ─── Evidence, telemetry and provenance (P01-B10-A06) ───────────────────────

export interface IntegratedBaselineProbeEvidence {
  probeId: string;
  category: IntegratedBaselineCategory;
  disposition: IntegratedBaselineProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

export interface IntegratedBaselineProbeTelemetry {
  probeId: string;
  category: IntegratedBaselineCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B10-A06). */
export interface IntegratedBaselineProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceOrchestratorSeamVersion: string;
  sourceOrchestratorSeamAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly IntegratedBaselineCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated integrated baseline run record bundling evidence, telemetry and provenance. */
export interface IntegratedBaselineRunRecord {
  provenance: IntegratedBaselineProvenance;
  evidence: IntegratedBaselineProbeEvidence[];
  telemetry: IntegratedBaselineProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<IntegratedBaselineCategory, number>;
    byDisposition: Record<IntegratedBaselineProbeDisposition, number>;
  };
}

export interface IntegratedBaselineRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface IntegratedBaselineRunValidationResult {
  valid: boolean;
  issues: IntegratedBaselineRunValidationIssue[];
}

export function buildIntegratedBaselineProbeEvidence(
  probeId: string,
  category: IntegratedBaselineCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: IntegratedBaselineProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): IntegratedBaselineProbeEvidence {
  return {
    probeId,
    category,
    disposition,
    expected,
    actual,
    aligned,
    criterion,
    detail,
    recordedAt,
  };
}

export function buildIntegratedBaselineProbeTelemetry(
  probeId: string,
  category: IntegratedBaselineCategory,
  sequenceIndex: number,
  durationMs: number,
): IntegratedBaselineProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildIntegratedBaselineProvenance(
  runId: string,
  fixture: IntegratedBaseline,
  contract: IntegratedBaselineContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly IntegratedBaselineCategory[];
  },
): IntegratedBaselineProvenance {
  return {
    runId,
    harnessVersion: FORGE_INTEGRATED_BASELINE_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceOrchestratorSeamVersion: fixture.sourceOrchestratorSeam.version,
    sourceOrchestratorSeamAtom: fixture.sourceOrchestratorSeam.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildIntegratedBaselineRunRecord(
  provenance: IntegratedBaselineProvenance,
  evidence: IntegratedBaselineProbeEvidence[],
  telemetry: IntegratedBaselineProbeTelemetry[],
): IntegratedBaselineRunRecord {
  const byCategory = {} as Record<IntegratedBaselineCategory, number>;
  const byDisposition: Record<IntegratedBaselineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of INTEGRATED_BASELINE_CATEGORIES) {
    byCategory[category] = 0;
  }
  let aligned = 0;
  for (const item of evidence) {
    byCategory[item.category]++;
    byDisposition[item.disposition]++;
    if (item.aligned) aligned++;
  }
  return {
    provenance,
    evidence,
    telemetry,
    summary: {
      total: evidence.length,
      aligned,
      mismatches: evidence.length - aligned,
      byCategory,
      byDisposition,
    },
  };
}

function validateIntegratedBaselineRunRecordAgainstProbeIds(
  record: IntegratedBaselineRunRecord,
  expectedProbeIds: string[],
  contract: IntegratedBaselineContract,
): IntegratedBaselineRunValidationResult {
  const issues: IntegratedBaselineRunValidationIssue[] = [];
  const expectedProbeCount = expectedProbeIds.length;

  if (record.provenance.totalProbes !== expectedProbeCount) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `provenance.totalProbes=${record.provenance.totalProbes} expected=${expectedProbeCount}`,
    });
  }

  if (record.evidence.length !== expectedProbeCount) {
    issues.push({
      kind: "count_mismatch",
      detail: `evidence count=${record.evidence.length} expected=${expectedProbeCount}`,
    });
  }

  if (record.telemetry.length !== expectedProbeCount) {
    issues.push({
      kind: "count_mismatch",
      detail: `telemetry count=${record.telemetry.length} expected=${expectedProbeCount}`,
    });
  }

  const evidenceIds = new Set(record.evidence.map(e => e.probeId));
  const telemetryIds = new Set(record.telemetry.map(t => t.probeId));

  for (const probeId of expectedProbeIds) {
    if (!evidenceIds.has(probeId)) {
      issues.push({ kind: "missing_evidence", probeId, detail: `no evidence for ${probeId}` });
    }
    if (!telemetryIds.has(probeId)) {
      issues.push({ kind: "missing_telemetry", probeId, detail: `no telemetry for ${probeId}` });
    }
  }

  if (record.provenance.contractVersion !== contract.version) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `contractVersion=${record.provenance.contractVersion} expected=${contract.version}`,
    });
  }

  for (const item of record.evidence) {
    if (!item.criterion || item.criterion.length === 0) {
      issues.push({
        kind: "missing_evidence",
        probeId: item.probeId,
        detail: `${item.probeId} evidence missing criterion provenance`,
      });
    }

    const contractProbe = contract.probes.find(p => p.id === item.probeId);
    if (contractProbe) {
      if (item.disposition !== contractProbe.disposition) {
        issues.push({
          kind: "provenance_mismatch",
          probeId: item.probeId,
          detail: `${item.probeId} disposition=${item.disposition} expected=${contractProbe.disposition}`,
        });
      }
      if (item.criterion !== contractProbe.criterion) {
        issues.push({
          kind: "provenance_mismatch",
          probeId: item.probeId,
          detail: `${item.probeId} criterion mismatch`,
        });
      }
      if (!item.aligned) {
        issues.push({
          kind: "missing_evidence",
          probeId: item.probeId,
          detail: `${item.probeId} probe outcome not aligned`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateIntegratedBaselineRunRecord(
  record: IntegratedBaselineRunRecord,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineRunValidationResult {
  return validateIntegratedBaselineRunRecordAgainstProbeIds(
    record,
    listIntegratedBaselineContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateIntegratedBaselineFailureRecoveryRunRecord(
  record: IntegratedBaselineRunRecord,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselineRunValidationResult {
  const issues: IntegratedBaselineRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P01-B10-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P01-B10-A06`,
    });
  }

  const expectedCategories = [...INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES];
  const sliceCategories = record.provenance.sliceCategories ?? [];
  if (
    sliceCategories.length !== expectedCategories.length ||
    !expectedCategories.every(cat => sliceCategories.includes(cat))
  ) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceCategories=${sliceCategories.join(",")} expected=${expectedCategories.join(",")}`,
    });
  }

  const probeValidation = validateIntegratedBaselineRunRecordAgainstProbeIds(
    record,
    listIntegratedBaselineFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

// ─── Property and fuzz validation (P01-B10-A07) ───────────────────────────────

export interface IntegratedBaselinePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface IntegratedBaselinePropertyResult {
  passed: number;
  failed: IntegratedBaselinePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type IntegratedBaselinePropertyCheck = {
  id: string;
  description: string;
  check: (contract: IntegratedBaselineContract) => string | null;
};

const INTEGRATED_BASELINE_STRUCTURAL_PROPERTIES: readonly IntegratedBaselinePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All ten integrated baseline categories are declared",
    check: contract => {
      for (const category of INTEGRATED_BASELINE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listIntegratedBaselineContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of INTEGRATED_BASELINE_CATEGORIES) {
        const categoryContract = contract.categories[category];
        if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
          return `${category} has ${categoryContract.probes.length} probes; requires >= ${categoryContract.acceptance.minProbeCount}`;
        }
      }
      return null;
    },
  },
  {
    id: "criterion_measurable",
    description: "Every probe declares a measurable criterion",
    check: contract => {
      for (const probe of contract.probes) {
        if (probe.criterion.trim().length <= 10) {
          return `${probe.id} criterion too short`;
        }
      }
      return null;
    },
  },
  {
    id: "coverage_consistent",
    description: "summarizeIntegratedBaselineContractCoverage totals match listIntegratedBaselineContractProbeIds",
    check: contract => {
      const summary = summarizeIntegratedBaselineContractCoverage(contract);
      const ids = listIntegratedBaselineContractProbeIds(contract);
      if (summary.totalProbes !== ids.length) {
        return `totalProbes=${summary.totalProbes} ids=${ids.length}`;
      }
      const dispositionSum =
        summary.byDisposition.observed +
        summary.byDisposition.gap +
        summary.byDisposition.failure +
        summary.byDisposition.recovery +
        summary.byDisposition.nogo;
      if (dispositionSum !== summary.totalProbes) {
        return `disposition sum=${dispositionSum} total=${summary.totalProbes}`;
      }
      return null;
    },
  },
  {
    id: "probe_id_prefix",
    description: "Probe ids are namespaced with ibase. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("ibase.")) {
          return `${probe.id} missing ibase. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listIntegratedBaselineContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildIntegratedBaselineProbeEvidence(
          id,
          probe.category,
          probe.expected,
          probe.expected,
          true,
          probe.criterion,
          "synthetic",
          probe.disposition,
        );
      });
      const telemetry = probeIds.map((id, index) => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildIntegratedBaselineProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildIntegratedBaselineRunRecord(
        buildIntegratedBaselineProvenance(
          "property-check",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourceOrchestratorSeam: buildDefaultIntegratedSourceOrchestratorSeam(),
            probes: [],
          },
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
        ),
        evidence,
        telemetry,
      );
      if (record.summary.aligned + record.summary.mismatches !== record.summary.total) {
        return `aligned(${record.summary.aligned}) + mismatches(${record.summary.mismatches}) != total(${record.summary.total})`;
      }
      return null;
    },
  },
  {
    id: "failure_recovery_run_record_gate",
    description: "Synthetic failure/recovery slice record passes validateIntegratedBaselineFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listIntegratedBaselineFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildIntegratedBaselineProbeEvidence(
          id,
          probe.category,
          probe.expected,
          probe.expected,
          true,
          probe.criterion,
          "synthetic",
          probe.disposition,
        );
      });
      const telemetry = probeIds.map((id, index) => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildIntegratedBaselineProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildIntegratedBaselineRunRecord(
        buildIntegratedBaselineProvenance(
          "property-check-failure-recovery",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourceOrchestratorSeam: buildDefaultIntegratedSourceOrchestratorSeam(),
            probes: [],
          },
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P01-B10-A06",
            sliceCategories: INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateIntegratedBaselineFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runIntegratedBaselinePropertyChecks(
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): IntegratedBaselinePropertyResult {
  const failed: IntegratedBaselinePropertyViolation[] = [];
  for (const property of INTEGRATED_BASELINE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = INTEGRATED_BASELINE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type IntegratedBaselineFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface IntegratedBaselineFuzzMutationCase {
  seed: number;
  kind: IntegratedBaselineFuzzMutationKind;
  probeId?: string;
  category?: IntegratedBaselineCategory;
}

export interface IntegratedBaselineFuzzValidationCaseResult {
  mutation: IntegratedBaselineFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface IntegratedBaselineFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: IntegratedBaselineFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createIntegratedBaselineFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneIntegratedBaseline(fixture: IntegratedBaseline): IntegratedBaseline {
  return {
    ...fixture,
    sourceOrchestratorSeam: { ...fixture.sourceOrchestratorSeam },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickIntegratedBaselineFuzzTarget(
  fixture: IntegratedBaseline,
  rng: () => number,
): { category: IntegratedBaselineCategory; index: number; entry: IntegratedBaselineFixtureEntry } {
  const category = INTEGRATED_BASELINE_CATEGORIES[Math.floor(rng() * INTEGRATED_BASELINE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyIntegratedBaselineFuzzMutation(
  fixture: IntegratedBaseline,
  mutation: IntegratedBaselineFuzzMutationCase,
): IntegratedBaseline {
  const mutated = cloneIntegratedBaseline(fixture);
  const targetCategory = mutation.category ?? INTEGRATED_BASELINE_CATEGORIES[0]!;
  const categoryEntries = mutated.probes.filter(p => p.category === targetCategory);

  switch (mutation.kind) {
    case "flip_expected": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      entry.expected = entry.expected === "PASS" ? "FAIL" : "PASS";
      break;
    }
    case "drop_probe": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      mutated.probes = mutated.probes.filter(e => e.id !== probeId);
      break;
    }
    case "extra_probe":
      mutated.probes = [
        ...mutated.probes,
        {
          id: `ibase.fuzz.extra.${mutation.seed}`,
          category: targetCategory,
          description: "synthetic extra probe",
          expected: "PASS",
        },
      ];
      break;
    case "rename_probe": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      entry.id = `${entry.id}.fuzz_${mutation.seed}`;
      break;
    }
    case "flip_category": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      const other = INTEGRATED_BASELINE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateIntegratedBaselineFuzzMutationCases(
  fixture: IntegratedBaseline,
  seed: number,
  iterations: number,
): IntegratedBaselineFuzzMutationCase[] {
  const rng = createIntegratedBaselineFuzzRng(seed);
  const kinds: IntegratedBaselineFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: IntegratedBaselineFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickIntegratedBaselineFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P01-B10-A07). */
export function runIntegratedBaselineFuzzValidation(
  fixture: IntegratedBaseline,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
  seed = 42,
  iterations = 24,
): IntegratedBaselineFuzzValidationResult {
  const cases = generateIntegratedBaselineFuzzMutationCases(fixture, seed, iterations);
  const results: IntegratedBaselineFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyIntegratedBaselineFuzzMutation(fixture, mutation);
    const validation = validateIntegratedBaselineAgainstContract(mutated, contract);
    if (validation.valid) accepted++;
    else rejected++;
    results.push({
      mutation,
      valid: validation.valid,
      issueKinds: [...new Set(validation.issues.map(i => i.kind))],
    });
  }

  return {
    seed,
    iterations,
    rejected,
    accepted,
    cases: results,
    allMutationsRejected: accepted === 0,
  };
}

export type IntegratedBaselineRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface IntegratedBaselineRunRecordFuzzCase {
  kind: IntegratedBaselineRunRecordFuzzKind;
  probeId?: string;
}

export function applyIntegratedBaselineRunRecordFuzzMutation(
  record: IntegratedBaselineRunRecord,
  mutation: IntegratedBaselineRunRecordFuzzCase,
): IntegratedBaselineRunRecord {
  const cloned: IntegratedBaselineRunRecord = {
    provenance: { ...record.provenance },
    evidence: record.evidence.map(item => ({ ...item })),
    telemetry: record.telemetry.map(item => ({ ...item })),
    summary: {
      ...record.summary,
      byCategory: { ...record.summary.byCategory },
      byDisposition: { ...record.summary.byDisposition },
    },
  };

  switch (mutation.kind) {
    case "drop_evidence": {
      const probeId = mutation.probeId ?? cloned.evidence[0]?.probeId;
      cloned.evidence = cloned.evidence.filter(item => item.probeId !== probeId);
      break;
    }
    case "drop_telemetry": {
      const probeId = mutation.probeId ?? cloned.telemetry[0]?.probeId;
      cloned.telemetry = cloned.telemetry.filter(item => item.probeId !== probeId);
      break;
    }
    case "wrong_total":
      cloned.provenance = { ...cloned.provenance, totalProbes: cloned.provenance.totalProbes + 1 };
      break;
    case "wrong_slice_atom":
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P01-B10-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["gate_versioning"],
      };
      break;
  }

  cloned.summary = buildIntegratedBaselineRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveIntegratedBaselineRunRecordValidator(
  record: IntegratedBaselineRunRecord,
): (
  record: IntegratedBaselineRunRecord,
  contract: IntegratedBaselineContract,
) => IntegratedBaselineRunValidationResult {
  return record.provenance.sliceAtom === "P01-B10-A06"
    ? validateIntegratedBaselineFailureRecoveryRunRecord
    : validateIntegratedBaselineRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P01-B10-A07). */
export function runIntegratedBaselineRunRecordFuzzValidation(
  record: IntegratedBaselineRunRecord,
  contract: IntegratedBaselineContract = getActiveIntegratedBaselineContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveIntegratedBaselineRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: IntegratedBaselineRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P01-B10-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyIntegratedBaselineRunRecordFuzzMutation(record, mutation);
    const validation = validate(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
}

// ─── Probe regression detection (P01-B10-A08) ─────────────────────────────────

export interface IntegratedBaselineProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

export function detectIntegratedBaselineProbeRegression(
  prior: IntegratedBaselineRunRecord,
  current: IntegratedBaselineRunRecord,
): IntegratedBaselineProbeRegressionReport {
  const priorById = new Map(prior.evidence.map(item => [item.probeId, item]));
  const regressions: string[] = [];
  const fixed: string[] = [];
  const newMismatches: string[] = [];

  for (const item of current.evidence) {
    const previous = priorById.get(item.probeId);
    if (!previous) {
      newMismatches.push(item.probeId);
      continue;
    }
    if (previous.aligned && !item.aligned) {
      regressions.push(item.probeId);
    } else if (!previous.aligned && item.aligned) {
      fixed.push(item.probeId);
    } else if (!item.aligned) {
      newMismatches.push(item.probeId);
    }
  }

  const hasRegression = regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
  const parts: string[] = [];
  if (regressions.length > 0) parts.push(`${regressions.length} probe regression(s)`);
  if (newMismatches.length > 0) parts.push(`${newMismatches.length} new mismatch(es)`);
  if (fixed.length > 0) parts.push(`${fixed.length} fixed`);
  if (parts.length === 0) parts.push("no alignment regression");

  return {
    hasRegression,
    regressions,
    fixed,
    newMismatches,
    summary: parts.join("; "),
  };
}
