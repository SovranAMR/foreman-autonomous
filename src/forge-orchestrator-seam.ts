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
