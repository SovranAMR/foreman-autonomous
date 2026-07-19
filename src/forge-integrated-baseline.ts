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
