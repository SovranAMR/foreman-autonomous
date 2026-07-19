/**
 * FOREMAN — Visioner Intent & Task Understanding Baseline (P02-B01)
 *
 * Measures visioner intent parsing, task depth routing and ambiguity handling
 * on sealed P01 phase gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01ToP02PhaseHandoff,
  P01_PHASE_ATOM_COUNT,
} from "./forge-p01-phase-gate.js";
import {
  EXPECTED_SEALED_BLOCK_COUNT,
  getActiveIntegratedBaselineContract,
  summarizeIntegratedBaselineContractCoverage,
} from "./forge-integrated-baseline.js";

export const FORGE_VISIONER_INTENT_VERSION = "1.0.0-b01";

export const VISIONER_INTENT_CATEGORIES = [
  "intent_versioning",
  "task_signal",
  "intent_depth",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerIntentCategory = (typeof VISIONER_INTENT_CATEGORIES)[number];

export interface VisionerIntentFixtureEntry {
  id: string;
  category: VisionerIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerIntentBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePhaseGate: {
    version: string;
    atom: string;
    contractVersion: string;
    integratedBaselineProbeCount: number;
    sealedBlockCount: number;
  };
  probes: VisionerIntentFixtureEntry[];
}

export interface VisionerIntentProbeResult {
  id: string;
  category: VisionerIntentCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerIntentProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerIntentProbeResult[];
  knownGaps: VisionerIntentProbeResult[];
  byCategory: Record<
    VisionerIntentCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerIntentValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerIntentCategory;
  detail: string;
}

export interface VisionerIntentValidationResult {
  valid: boolean;
  issues: VisionerIntentValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const VISIONER_INTENT_A01_MIN_PROBES: Readonly<
  Record<VisionerIntentCategory, number>
> = {
  intent_versioning: 3,
  task_signal: 3,
  intent_depth: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type VisionerIntentProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerIntentProbeContract {
  id: string;
  category: VisionerIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerIntentProbeDisposition;
  criterion: string;
}

export interface VisionerIntentCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerIntentCategoryContract {
  category: VisionerIntentCategory;
  acceptance: VisionerIntentCategoryAcceptance;
  probes: readonly VisionerIntentProbeContract[];
}

export interface VisionerIntentContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerIntentCategory, VisionerIntentCategoryContract>;
  probes: readonly VisionerIntentProbeContract[];
}

function flattenVisionerIntentCategoryProbes(
  categories: Record<VisionerIntentCategory, VisionerIntentCategoryContract>,
): readonly VisionerIntentProbeContract[] {
  return VISIONER_INTENT_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_INTENT_CATEGORY_CONTRACTS: Record<
  VisionerIntentCategory,
  VisionerIntentCategoryContract
> = {
  intent_versioning: {
    category: "intent_versioning",
    acceptance: {
      invariant:
        "Visioner intent baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.version_tagged",
        category: "intent_versioning",
        description: "Visioner intent baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner intent baseline declares semver version field",
      },
      {
        id: "vint.atom_tagged",
        category: "intent_versioning",
        description: "Visioner intent baseline declares P02-B01-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner intent baseline declares P02-B01-A01 atom id",
      },
      {
        id: "vint.harness_version_exported",
        category: "intent_versioning",
        description: "FORGE_VISIONER_INTENT_VERSION exported for visioner intent harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_INTENT_VERSION exported for visioner intent harness",
      },
    ],
  },
  task_signal: {
    category: "task_signal",
    acceptance: {
      invariant:
        "Raw user task signal reaches visioner layer; structured intent parse is a documented gap until A03.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.raw_task_wired",
        category: "task_signal",
        description: "Orchestrator passes raw user task into visioner step input",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator passes raw user task into visioner step input",
      },
      {
        id: "vint.visioner_layer_invoke",
        category: "task_signal",
        description: "Vision phase invokes engine.stepWithPhase with visioner layer",
        expected: "PASS",
        disposition: "observed",
        criterion: "Vision phase invokes engine.stepWithPhase with visioner layer",
      },
      {
        id: "vint.structured_intent_parse",
        category: "task_signal",
        description: "Typed parseVisionerTaskIntent exports structured intent from raw task",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Typed parseVisionerTaskIntent exports structured intent from raw task",
      },
    ],
  },
  intent_depth: {
    category: "intent_depth",
    acceptance: {
      invariant:
        "Prompt declares depth tiers; programmatic classifier and depth-routed prompts are documented gaps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.prompt_depth_tiers",
        category: "intent_depth",
        description: "VISIONER_SYSTEM prompt declares simple, medium and complex task depth tiers",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares simple, medium and complex task depth tiers",
      },
      {
        id: "vint.programmatic_depth_classifier",
        category: "intent_depth",
        description: "classifyVisionerTaskDepth programmatically classifies task complexity",
        expected: "FAIL",
        disposition: "gap",
        criterion: "classifyVisionerTaskDepth programmatically classifies task complexity",
      },
      {
        id: "vint.depth_routed_prompt",
        category: "intent_depth",
        description: "Orchestrator routes vision prompt variant by classified task depth",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator routes vision prompt variant by classified task depth",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Visioner intent baseline links to sealed P01 phase gate and integrated baseline handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.p01_phase_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P01_TO_P02_PHASE_HANDOFF_V1 targets P02-B01-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P01_TO_P02_PHASE_HANDOFF_V1 targets P02-B01-A01 entry atom",
      },
      {
        id: "vint.p01_integrated_sealed_probes",
        category: "baseline_link",
        description: "P01-B10→P02 handoff sealed probeCount matches active integrated baseline contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P01-B10→P02 handoff sealed probeCount matches active integrated baseline contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline references sealed P01 artifacts, exports probe runner and documents FAIL gaps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.source_phase_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P01 phase gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P01 phase gate source artifacts",
      },
      {
        id: "vint.probe_runner_exported",
        category: "boundary",
        description: "runVisionerIntentProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerIntentProbes executes contract-wired probe matrix",
      },
      {
        id: "vint.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL intent gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL intent gap",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Empty vision guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.empty_vision_guard",
        category: "failure_path",
        description: "Orchestrator rejects empty or trivially short vision output",
        expected: "PASS",
        disposition: "failure",
        criterion: "Orchestrator rejects empty or trivially short vision output",
      },
      {
        id: "vint.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerIntentBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerIntentBaseline rejects unexpected fixture version",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Checkpoint resume reuses vision; structured intent recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.vision_checkpoint_resume",
        category: "recovery_path",
        description: "Pipeline resume reuses prior checkpoint vision output without re-invoking LLM",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses prior checkpoint vision output without re-invoking LLM",
      },
      {
        id: "vint.structured_intent_recovery",
        category: "recovery_path",
        description: "recoverVisionerIntent restructures failed intent parse into actionable vision input",
        expected: "FAIL",
        disposition: "gap",
        criterion: "recoverVisionerIntent restructures failed intent parse into actionable vision input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant: "Vision fact-check BLOCK exists; intent ambiguity NO-GO gate is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.vision_fact_check_block",
        category: "nogo_path",
        description: "Vision after_thought hook can BLOCK pipeline on fact-check failure",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Vision after_thought hook can BLOCK pipeline on fact-check failure",
      },
      {
        id: "vint.intent_ambiguity_nogo",
        category: "nogo_path",
        description: "checkVisionerIntentAmbiguity NO-GO gate blocks ambiguous tasks before vision spend",
        expected: "FAIL",
        disposition: "gap",
        criterion: "checkVisionerIntentAmbiguity NO-GO gate blocks ambiguous tasks before vision spend",
      },
    ],
  },
};

export const FORGE_VISIONER_INTENT_CONTRACT_V1: VisionerIntentContract = {
  version: "1.0.0",
  atom: "P02-B01-A05",
  purpose:
    "Typed visioner intent contract declaring measurable task signal, depth routing and ambiguity probes.",
  categories: VISIONER_INTENT_CATEGORY_CONTRACTS,
  probes: flattenVisionerIntentCategoryProbes(VISIONER_INTENT_CATEGORY_CONTRACTS),
};

export function getActiveVisionerIntentContract(): VisionerIntentContract {
  return FORGE_VISIONER_INTENT_CONTRACT_V1;
}

export function buildDefaultSourcePhaseGate(): VisionerIntentBaseline["sourcePhaseGate"] {
  const handoff = getForgeP01ToP02PhaseHandoff();
  const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.version,
    integratedBaselineProbeCount: coverage.totalProbes,
    sealedBlockCount: EXPECTED_SEALED_BLOCK_COUNT,
  };
}

export function validateVisionerIntentBaseline(
  fixture: VisionerIntentBaseline,
): VisionerIntentValidationResult {
  const issues: VisionerIntentValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B01-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_INTENT_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerIntentCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_INTENT_CATEGORIES) {
    const min = VISIONER_INTENT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01ToP02PhaseHandoff();
  const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());

  if (fixture.sourcePhaseGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.atom=${fixture.sourcePhaseGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourcePhaseGate.integratedBaselineProbeCount !== coverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.integratedBaselineProbeCount=${fixture.sourcePhaseGate.integratedBaselineProbeCount} contract=${coverage.totalProbes}`,
    });
  }
  if (fixture.sourcePhaseGate.sealedBlockCount !== EXPECTED_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.sealedBlockCount=${fixture.sourcePhaseGate.sealedBlockCount} expected=${EXPECTED_SEALED_BLOCK_COUNT}`,
    });
  }
  if (handoff.sourcePhase.completedAtoms !== P01_PHASE_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail: `P01 handoff completedAtoms=${handoff.sourcePhase.completedAtoms} expected=${P01_PHASE_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contract = getActiveVisionerIntentContract();
  for (const contractProbe of contract.probes) {
    const fixtureProbe = fixture.probes.find(p => p.id === contractProbe.id);
    if (!fixtureProbe) {
      issues.push({
        kind: "missing_probe",
        probeId: contractProbe.id,
        detail: `fixture missing contract probe ${contractProbe.id}`,
      });
      continue;
    }
    if (fixtureProbe.expected !== contractProbe.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: contractProbe.id,
        detail: `fixture expected=${fixtureProbe.expected} contract=${contractProbe.expected}`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerIntentMatrix(
  results: VisionerIntentProbeResult[],
): VisionerIntentProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerIntentProbeSummary["byCategory"];
  for (const category of VISIONER_INTENT_CATEGORIES) {
    const catResults = results.filter(r => r.category === category);
    byCategory[category] = {
      total: catResults.length,
      aligned: catResults.filter(r => r.aligned).length,
      expectedFail: catResults.filter(r => r.expected === "FAIL").length,
    };
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listVisionerIntentProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerIntentBaseline,
): VisionerIntentFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerIntentKnownGaps(
  results: VisionerIntentProbeResult[],
): VisionerIntentProbeResult[] {
  return summarizeVisionerIntentMatrix(results).knownGaps;
}
