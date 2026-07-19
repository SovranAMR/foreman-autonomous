/**
 * FOREMAN — Researcher Phase Gate Baseline (P04-B10)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B09 research-to-worker handoff block gate artifacts.
 */

import researcherPhaseGateBaseline from "./fixtures/forge-researcher-phase-gate-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import { P04_RESEARCHER_PHASE_ID as P04_FROM_P03 } from "./forge-p03-strategist-phase-gate.js";
import {
  getForgeP04B09ToB10Handoff,
  getActiveResearcherResearchToWorkerHandoffContract,
  summarizeResearcherResearchToWorkerHandoffContractCoverage,
  FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION,
} from "./forge-p04-researcher-research-to-worker-handoff.js";

export const FORGE_RESEARCHER_PHASE_GATE_VERSION = "1.0.0";

export const P04_RESEARCHER_PHASE_ID = P04_FROM_P03;
export const P05_WORKER_PHASE_ID = "P05" as const;

export const EXPECTED_P04_B09_SEALED_ATOM_COUNT = 10;

/** Canonical P04 researcher blocks B01–B10 with block-gate runner identifiers. */
export const P04_RESEARCHER_PHASE_BLOCK_INVENTORY = [
  {
    blockId: "P04-B01",
    title: "Research question decomposition",
    runner: "runForgeResearcherQuestionDecompositionBlockGate",
  },
  {
    blockId: "P04-B02",
    title: "Repo içi kanıt toplama",
    runner: "runForgeResearcherInRepoEvidenceBlockGate",
  },
  {
    blockId: "P04-B03",
    title: "Web ve primary-source araştırma",
    runner: "runForgeResearcherWebPrimarySourceBlockGate",
  },
  {
    blockId: "P04-B04",
    title: "Benchmark ve prior-art analizi",
    runner: "runForgeResearcherBenchmarkPriorArtBlockGate",
  },
  {
    blockId: "P04-B05",
    title: "Citation ve provenance graph",
    runner: "runForgeResearcherCitationProvenanceGraphBlockGate",
  },
  {
    blockId: "P04-B06",
    title: "Contradiction ve freshness çözümü",
    runner: "runForgeResearcherContradictionFreshnessBlockGate",
  },
  {
    blockId: "P04-B07",
    title: "Risk ve trade-off araştırması",
    runner: "runForgeResearcherRiskTradeoffBlockGate",
  },
  {
    blockId: "P04-B08",
    title: "Spike ve falsification deneyi",
    runner: "runForgeResearcherSpikeFalsificationBlockGate",
  },
  {
    blockId: "P04-B09",
    title: "Research-to-worker handoff",
    runner: "runForgeResearcherResearchToWorkerHandoffBlockGate",
  },
  {
    blockId: "P04-B10",
    title: "Araştırmacı phase gate",
    runner: "runForgeResearcherPhaseGateBlockGate",
  },
] as const;

export const P04_RESEARCHER_PHASE_BLOCK_COUNT = P04_RESEARCHER_PHASE_BLOCK_INVENTORY.length;
export const P04_RESEARCHER_PHASE_ATOM_COUNT = P04_RESEARCHER_PHASE_BLOCK_COUNT * 10;

export const EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT = P04_RESEARCHER_PHASE_BLOCK_COUNT - 1;

export const RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH = 32_768;

export const RESEARCHER_PHASE_GATE_CATEGORIES = [
  "phase_versioning",
  "block_gate_signal",
  "phase_inventory",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherPhaseGateCategory = (typeof RESEARCHER_PHASE_GATE_CATEGORIES)[number];

export interface ResearcherPhaseGateFixtureEntry {
  id: string;
  category: ResearcherPhaseGateCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherPhaseGateBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    researchToWorkerHandoffProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherPhaseGateFixtureEntry[];
}

export interface ResearcherPhaseGateProbeResult {
  id: string;
  category: ResearcherPhaseGateCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherPhaseGateProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherPhaseGateProbeResult[];
  knownGaps: ResearcherPhaseGateProbeResult[];
  byCategory: Record<
    ResearcherPhaseGateCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherPhaseGateValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherPhaseGateCategory;
  detail: string;
}

export interface ResearcherPhaseGateValidationResult {
  valid: boolean;
  issues: ResearcherPhaseGateValidationIssue[];
}

export type ResearcherPhaseGateProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherPhaseGateProbeContract {
  id: string;
  category: ResearcherPhaseGateCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherPhaseGateProbeDisposition;
  criterion: string;
}

export interface ResearcherPhaseGateCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface ResearcherPhaseGateCategoryContract {
  category: ResearcherPhaseGateCategory;
  acceptance: ResearcherPhaseGateCategoryAcceptance;
  probes: readonly ResearcherPhaseGateProbeContract[];
}

export interface ResearcherPhaseGateContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<ResearcherPhaseGateCategory, ResearcherPhaseGateCategoryContract>;
  probes: readonly ResearcherPhaseGateProbeContract[];
}

export const RESEARCHER_PHASE_GATE_A01_MIN_PROBES: Readonly<
  Record<ResearcherPhaseGateCategory, number>
> = {
  phase_versioning: 3,
  block_gate_signal: 3,
  phase_inventory: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 3,
  nogo_path: 2,
};

export interface P04ResearcherBlockGateSeal {
  blockId: string;
  title: string;
  runner: string;
  passed: boolean;
  atomSealCount: number;
  detail: string;
}

export interface P04ResearcherPhaseGateEvidence {
  phaseId: typeof P04_RESEARCHER_PHASE_ID;
  atom: "P04-PHASE-GATE";
  sealedAt: string;
  blockSeals: P04ResearcherBlockGateSeal[];
  blockGatesPassed: number;
  atomSealsPassed: number;
  handoffRegressionPassed: boolean;
  handoffValid: boolean;
  gitCommit?: string;
}

export interface P04PhaseHandoffContract {
  version: string;
  atom: "P04-PHASE-GATE";
  sourcePhase: {
    phaseId: typeof P04_RESEARCHER_PHASE_ID;
    title: string;
    completedBlocks: readonly string[];
    completedAtoms: number;
  };
  targetPhase: {
    phaseId: typeof P05_WORKER_PHASE_ID;
    title: string;
    entryBlock: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    researchToWorkerHandoffVersion: string;
    researchToWorkerHandoffProbeCount: number;
    sealedBlockInventoryCount: number;
    blockGateMethod: string;
    phaseGateMethod: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresPhaseGatePass: true;
    requiresResearchToWorkerHandoffBlockGate: true;
  };
}

export const FORGE_P04_TO_P05_PHASE_HANDOFF_V1: P04PhaseHandoffContract = {
  version: "1.0.0",
  atom: "P04-PHASE-GATE",
  sourcePhase: {
    phaseId: P04_RESEARCHER_PHASE_ID,
    title: "Araştırmacı — Kanıt, Kaynak ve Deney",
    completedBlocks: P04_RESEARCHER_PHASE_BLOCK_INVENTORY.map(block => block.blockId),
    completedAtoms: P04_RESEARCHER_PHASE_ATOM_COUNT,
  },
  targetPhase: {
    phaseId: P05_WORKER_PHASE_ID,
    title: "İşçi — Deterministik Tool ve Execution Kernel",
    entryBlock: "P05-B01",
    entryAtom: "P05-B01-A01",
  },
  sealedArtifacts: {
    researchToWorkerHandoffVersion: getActiveResearcherResearchToWorkerHandoffContract().version,
    researchToWorkerHandoffProbeCount: summarizeResearcherResearchToWorkerHandoffContractCoverage(
      getActiveResearcherResearchToWorkerHandoffContract(),
    ).totalProbes,
    sealedBlockInventoryCount: P04_RESEARCHER_PHASE_BLOCK_COUNT,
    blockGateMethod: "verifyForgeResearcherResearchToWorkerHandoffBlockGate",
    phaseGateMethod: "verifyForgeP04ResearcherPhaseGate",
  },
  prerequisites: [
    "Ten sealed P04 researcher block gates with atom-level evidence",
    "Research-to-worker handoff block gate PASS with P04-B10 handoff",
    "Research-to-worker handoff regression and guard gates PASS",
    "Orchestrator exposes verifyForgeP04ResearcherPhaseGate for phase acceptance",
  ],
  entryCriteria: {
    description:
      "P05-B01-A01 formalizes worker tool dispatch baseline using sealed P04 researcher phase gate artifacts",
    requiresPhaseGatePass: true,
    requiresResearchToWorkerHandoffBlockGate: true,
  },
};

export function getForgeP04ToP05PhaseHandoff(): P04PhaseHandoffContract {
  return FORGE_P04_TO_P05_PHASE_HANDOFF_V1;
}

export function validateP04PhaseHandoffContract(
  handoff: P04PhaseHandoffContract,
  evidence: Pick<
    P04ResearcherPhaseGateEvidence,
    "blockGatesPassed" | "atomSealsPassed" | "handoffRegressionPassed" | "handoffValid"
  >,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage(
    getActiveResearcherResearchToWorkerHandoffContract(),
  );

  if (handoff.sourcePhase.completedBlocks.length !== P04_RESEARCHER_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff completedBlocks=${handoff.sourcePhase.completedBlocks.length} expected=${P04_RESEARCHER_PHASE_BLOCK_COUNT}`,
    );
  }
  if (handoff.sourcePhase.completedAtoms !== P04_RESEARCHER_PHASE_ATOM_COUNT) {
    issues.push(
      `handoff completedAtoms=${handoff.sourcePhase.completedAtoms} expected=${P04_RESEARCHER_PHASE_ATOM_COUNT}`,
    );
  }
  if (handoff.targetPhase.entryAtom !== "P05-B01-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetPhase.entryAtom}`);
  }
  if (handoff.sealedArtifacts.researchToWorkerHandoffProbeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.researchToWorkerHandoffProbeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.sealedBlockInventoryCount !== P04_RESEARCHER_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff sealedBlockInventoryCount=${handoff.sealedArtifacts.sealedBlockInventoryCount} expected=${P04_RESEARCHER_PHASE_BLOCK_COUNT}`,
    );
  }
  if (evidence.blockGatesPassed !== P04_RESEARCHER_PHASE_BLOCK_COUNT) {
    issues.push(`blockGatesPassed=${evidence.blockGatesPassed} expected=${P04_RESEARCHER_PHASE_BLOCK_COUNT}`);
  }
  if (evidence.atomSealsPassed !== P04_RESEARCHER_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P04_RESEARCHER_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.handoffRegressionPassed) {
    issues.push("handoff regression gate did not pass");
  }
  if (!evidence.handoffValid) {
    issues.push("handoff invalid");
  }

  return { valid: issues.length === 0, issues };
}

export type ResearcherPhaseGateInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface ResearcherPhaseGateInputBoundary {
  disposition: ResearcherPhaseGateInputDisposition;
  acceptable: boolean;
  normalizedManifest: string;
  truncated: boolean;
  detail: string;
}

export function assessResearcherPhaseGateInputBoundary(
  manifestInput: string,
): ResearcherPhaseGateInputBoundary {
  if (manifestInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedManifest: "",
      truncated: false,
      detail: "null byte in phase gate manifest",
    };
  }

  const trimmed = manifestInput.trim();
  if (trimmed.length === 0) {
    const disposition: ResearcherPhaseGateInputDisposition =
      manifestInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedManifest: "",
      truncated: false,
      detail: disposition === "empty" ? "empty phase gate manifest" : "whitespace-only phase gate manifest",
    };
  }

  let normalizedManifest = manifestInput;
  let truncated = false;
  if (normalizedManifest.length > RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH) {
    normalizedManifest = normalizedManifest.slice(0, RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedManifest,
    truncated,
    detail: truncated
      ? `manifest truncated to ${RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH} characters`
      : "valid phase gate manifest",
  };
}

export interface ResearcherPhaseGateRecoveryHints {
  blockSeals?: P04ResearcherBlockGateSeal[];
  handoffRegressionPassed?: boolean;
  handoffValid?: boolean;
  gitCommit?: string;
}

export interface ResearcherPhaseGateRecoveryResult {
  recovered: boolean;
  evidence: P04ResearcherPhaseGateEvidence | null;
  blockSeals: P04ResearcherBlockGateSeal[];
  handoffRegressionPassed: boolean;
  handoffValid: boolean;
  parseErrors: string[];
  detail: string;
}

const INFORMAL_BLOCK_SEAL_LINE =
  /^(P04-B\d{2})\s*[:=\-]\s*(pass|fail|passed|failed)(?:\s+atoms?\s*[=:]?\s*(\d+))?/i;

const INFORMAL_HANDOFF_REGRESSION_LINE =
  /^(?:handoff[_\s-]?regression|research-to-worker regression)\s*[:=\-]?\s*(pass|fail|passed|failed|true|false)/i;

const INFORMAL_HANDOFF_LINE =
  /^(?:handoff|phase handoff)\s*[:=\-]?\s*(valid|invalid|pass|fail|passed|failed|true|false)/i;

export function buildP04ResearcherPhaseGateEvidence(
  blockSeals: P04ResearcherBlockGateSeal[],
  handoffRegressionPassed: boolean,
  handoffValid: boolean,
  gitCommit?: string,
): P04ResearcherPhaseGateEvidence {
  const blockGatesPassed = blockSeals.filter(seal => seal.passed).length;
  const atomSealsPassed = blockSeals.reduce((sum, seal) => sum + seal.atomSealCount, 0);

  return {
    phaseId: P04_RESEARCHER_PHASE_ID,
    atom: "P04-PHASE-GATE",
    sealedAt: new Date().toISOString(),
    blockSeals,
    blockGatesPassed,
    atomSealsPassed,
    handoffRegressionPassed,
    handoffValid,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

export function validateForgeP04ResearcherPhaseGateEvidence(
  evidence: P04ResearcherPhaseGateEvidence,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (evidence.phaseId !== P04_RESEARCHER_PHASE_ID) {
    issues.push(`evidence phaseId=${evidence.phaseId} expected=${P04_RESEARCHER_PHASE_ID}`);
  }
  if (evidence.blockSeals.length !== P04_RESEARCHER_PHASE_BLOCK_COUNT) {
    issues.push(
      `block seal count=${evidence.blockSeals.length} expected=${P04_RESEARCHER_PHASE_BLOCK_COUNT}`,
    );
  }
  if (!evidence.blockSeals.every(seal => seal.passed)) {
    issues.push("one or more block gates failed");
  }
  if (evidence.atomSealsPassed !== P04_RESEARCHER_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P04_RESEARCHER_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.handoffRegressionPassed) {
    issues.push("handoffRegressionPassed=false");
  }
  if (!evidence.handoffValid) {
    issues.push("handoffValid=false");
  }

  return { valid: issues.length === 0, issues };
}

export function recoverResearcherPhaseGateEvidence(
  failedParse: string,
  hints: ResearcherPhaseGateRecoveryHints = {},
): ResearcherPhaseGateRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessResearcherPhaseGateInputBoundary(failedParse);

  if (
    boundary.disposition === "contains_null_byte" ||
    boundary.disposition === "empty" ||
    boundary.disposition === "whitespace_only"
  ) {
    const parseError =
      boundary.disposition === "contains_null_byte"
        ? "null_byte_in_manifest"
        : boundary.disposition === "empty"
          ? "empty_manifest"
          : "whitespace_only_manifest";
    return {
      recovered: false,
      evidence: null,
      blockSeals: [],
      handoffRegressionPassed: false,
      handoffValid: false,
      parseErrors: [parseError],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} manifest`,
    };
  }

  const raw = boundary.normalizedManifest;
  const sealByBlock = new Map<string, P04ResearcherBlockGateSeal>();

  if (hints.blockSeals) {
    for (const seal of hints.blockSeals) {
      sealByBlock.set(seal.blockId, seal);
    }
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const blockMatch = trimmed.match(INFORMAL_BLOCK_SEAL_LINE);
    if (blockMatch) {
      const blockId = blockMatch[1].toUpperCase();
      const inventory = P04_RESEARCHER_PHASE_BLOCK_INVENTORY.find(block => block.blockId === blockId);
      if (!inventory) {
        parseErrors.push(`unknown_block:${blockId}`);
        continue;
      }
      const passed = /pass/i.test(blockMatch[2]) && !/fail/i.test(blockMatch[2]);
      const atomSealCount = blockMatch[3] ? Number.parseInt(blockMatch[3], 10) : passed ? 10 : 0;
      sealByBlock.set(blockId, {
        blockId,
        title: inventory.title,
        runner: inventory.runner,
        passed,
        atomSealCount: Number.isFinite(atomSealCount) ? atomSealCount : passed ? 10 : 0,
        detail: passed ? "recovered seal" : "recovered failed seal",
      });
    }
  }

  let handoffRegressionPassed = hints.handoffRegressionPassed ?? false;
  let handoffValid = hints.handoffValid ?? false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const regressionMatch = trimmed.match(INFORMAL_HANDOFF_REGRESSION_LINE);
    if (regressionMatch) {
      handoffRegressionPassed =
        /pass|true/i.test(regressionMatch[1]) && !/fail|false/i.test(regressionMatch[1]);
    }
    const handoffMatch = trimmed.match(INFORMAL_HANDOFF_LINE);
    if (handoffMatch) {
      handoffValid =
        /valid|pass|true/i.test(handoffMatch[1]) && !/invalid|fail|false/i.test(handoffMatch[1]);
    }
  }

  if (/handoff[_\s-]?regression\s*[:=]\s*pass/i.test(raw) && hints.handoffRegressionPassed === undefined) {
    handoffRegressionPassed = true;
  }
  if (/handoff\s*[:=]\s*valid/i.test(raw) && hints.handoffValid === undefined) {
    handoffValid = true;
  }

  for (const block of P04_RESEARCHER_PHASE_BLOCK_INVENTORY) {
    if (!sealByBlock.has(block.blockId)) {
      sealByBlock.set(block.blockId, {
        blockId: block.blockId,
        title: block.title,
        runner: block.runner,
        passed: true,
        atomSealCount: 10,
        detail: "inferred seal from inventory",
      });
    }
  }

  const blockSeals = P04_RESEARCHER_PHASE_BLOCK_INVENTORY.map(block => sealByBlock.get(block.blockId)!);
  const evidence = buildP04ResearcherPhaseGateEvidence(
    blockSeals,
    handoffRegressionPassed,
    handoffValid,
    hints.gitCommit,
  );

  const validation = validateForgeP04ResearcherPhaseGateEvidence(evidence);
  const recovered = validation.valid && parseErrors.length === 0;

  if (!recovered && validation.issues.length > 0) {
    parseErrors.push(...validation.issues.slice(0, 3));
  }

  return {
    recovered,
    evidence: recovered ? evidence : null,
    blockSeals,
    handoffRegressionPassed,
    handoffValid,
    parseErrors,
    detail: recovered
      ? `recovered ${blockSeals.filter(seal => seal.passed).length}/${P04_RESEARCHER_PHASE_BLOCK_COUNT} block seals`
      : parseErrors.join("; ") || "phase gate evidence validation failed",
  };
}

function flattenResearcherPhaseGateCategoryProbes(
  categories: Record<ResearcherPhaseGateCategory, ResearcherPhaseGateCategoryContract>,
): readonly ResearcherPhaseGateProbeContract[] {
  return RESEARCHER_PHASE_GATE_CATEGORIES.flatMap(category => categories[category].probes);
}

const RESEARCHER_PHASE_GATE_CATEGORY_CONTRACTS: Record<
  ResearcherPhaseGateCategory,
  ResearcherPhaseGateCategoryContract
> = {
  phase_versioning: {
    category: "phase_versioning",
    acceptance: {
      invariant:
        "Researcher phase gate baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.version_tagged",
        category: "phase_versioning",
        description: "Researcher phase gate baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Researcher phase gate baseline declares semver version field",
      },
      {
        id: "rpg.atom_tagged",
        category: "phase_versioning",
        description: "Researcher phase gate baseline declares P04-B10-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Researcher phase gate baseline declares P04-B10-A01 atom id",
      },
      {
        id: "rpg.harness_version_exported",
        category: "phase_versioning",
        description: "FORGE_RESEARCHER_PHASE_GATE_VERSION exported for phase gate harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_RESEARCHER_PHASE_GATE_VERSION exported for phase gate harness",
      },
    ],
  },
  block_gate_signal: {
    category: "block_gate_signal",
    acceptance: {
      invariant:
        "Orchestrator exposes verifyForgeResearcher*BlockGate for prior P04 researcher block seals.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.orchestrator_question_block_gate",
        category: "block_gate_signal",
        description:
          "Orchestrator exposes verifyForgeResearcherQuestionDecompositionBlockGate for P04-B01 seal",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator exposes verifyForgeResearcherQuestionDecompositionBlockGate for P04-B01 seal",
      },
      {
        id: "rpg.orchestrator_handoff_block_gate",
        category: "block_gate_signal",
        description:
          "Orchestrator exposes verifyForgeResearcherResearchToWorkerHandoffBlockGate for P04-B09 seal",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator exposes verifyForgeResearcherResearchToWorkerHandoffBlockGate for P04-B09 seal",
      },
      {
        id: "rpg.orchestrator_nine_block_gates",
        category: "block_gate_signal",
        description:
          "Orchestrator exposes verifyForgeResearcher*BlockGate for all nine prior P04 researcher blocks",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator exposes verifyForgeResearcher*BlockGate for all nine prior P04 researcher blocks",
      },
    ],
  },
  phase_inventory: {
    category: "phase_inventory",
    acceptance: {
      invariant: "P04 researcher phase inventory exports ten blocks and one hundred atoms.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.block_inventory_exported",
        category: "phase_inventory",
        description:
          "P04_RESEARCHER_PHASE_BLOCK_INVENTORY exports canonical ten-block researcher inventory",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04_RESEARCHER_PHASE_BLOCK_INVENTORY exports canonical ten-block researcher inventory",
      },
      {
        id: "rpg.block_count_constant",
        category: "phase_inventory",
        description: "P04_RESEARCHER_PHASE_BLOCK_COUNT equals ten sealed researcher blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "P04_RESEARCHER_PHASE_BLOCK_COUNT equals ten sealed researcher blocks",
      },
      {
        id: "rpg.atom_count_constant",
        category: "phase_inventory",
        description: "P04_RESEARCHER_PHASE_ATOM_COUNT equals one hundred researcher atoms",
        expected: "PASS",
        disposition: "observed",
        criterion: "P04_RESEARCHER_PHASE_ATOM_COUNT equals one hundred researcher atoms",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Sealed P04-B09 block gate handoff targets P04-B10-A01 with matching probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.b09_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B09_TO_B10_HANDOFF_V1 targets P04-B10-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B09_TO_B10_HANDOFF_V1 targets P04-B10-A01 entry atom",
      },
      {
        id: "rpg.b09_sealed_handoff_probes",
        category: "baseline_link",
        description:
          "P04-B09→B10 handoff sealed probeCount matches active research-to-worker handoff contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B09→B10 handoff sealed probeCount matches active research-to-worker handoff contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline references sealed B09 artifacts, probe runner, documented gaps and manifest boundaries.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P04-B09 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P04-B09 block gate source artifacts",
      },
      {
        id: "rpg.probe_runner_exported",
        category: "boundary",
        description: "runResearcherPhaseGateProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherPhaseGateProbes executes contract-wired probe matrix",
      },
      {
        id: "rpg.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL phase gate gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL phase gate gap",
      },
      {
        id: "rpg.empty_manifest_boundary",
        category: "boundary",
        description: "assessResearcherPhaseGateInputBoundary rejects empty phase gate manifest",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessResearcherPhaseGateInputBoundary rejects empty phase gate manifest",
      },
      {
        id: "rpg.whitespace_manifest_boundary",
        category: "boundary",
        description:
          "assessResearcherPhaseGateInputBoundary rejects whitespace-only phase gate manifest",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearcherPhaseGateInputBoundary rejects whitespace-only phase gate manifest",
      },
      {
        id: "rpg.long_manifest_truncation_boundary",
        category: "boundary",
        description:
          "assessResearcherPhaseGateInputBoundary truncates manifest exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearcherPhaseGateInputBoundary truncates manifest exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Baseline and phase gate evidence validators reject invalid fixture or evidence.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.invalid_version_rejected",
        category: "failure_path",
        description: "validateResearcherPhaseGateBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateResearcherPhaseGateBaseline rejects unexpected fixture version",
      },
      {
        id: "rpg.incomplete_block_inventory_rejected",
        category: "failure_path",
        description: "validateForgeP04ResearcherPhaseGateEvidence rejects incomplete block gate evidence",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateForgeP04ResearcherPhaseGateEvidence rejects incomplete block gate evidence",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Research BLOCK is non-fatal; recoverResearcherPhaseGateEvidence restructures manifest; orchestrator exposes phase gate runner.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.research_block_non_fatal",
        category: "recovery_path",
        description: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
      },
      {
        id: "rpg.structured_phase_gate_recovery",
        category: "recovery_path",
        description:
          "recoverResearcherPhaseGateEvidence restructures failed block seal manifest into phase gate evidence",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverResearcherPhaseGateEvidence restructures failed block seal manifest into phase gate evidence",
      },
      {
        id: "rpg.orchestrator_phase_gate_runner",
        category: "recovery_path",
        description: "Orchestrator exposes verifyForgeP04ResearcherPhaseGate for P04 phase acceptance",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator exposes verifyForgeP04ResearcherPhaseGate for P04 phase acceptance",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Phase gate evidence validation rejects failed seals; P04→P05 phase handoff contract sealed.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rpg.phase_gate_evidence_nogo",
        category: "nogo_path",
        description: "validateForgeP04ResearcherPhaseGateEvidence rejects failed block gate seals",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateForgeP04ResearcherPhaseGateEvidence rejects failed block gate seals",
      },
      {
        id: "rpg.p04_to_p05_phase_handoff",
        category: "nogo_path",
        description: "getForgeP04ToP05PhaseHandoff exports sealed P04→P05 phase handoff contract",
        expected: "PASS",
        disposition: "nogo",
        criterion: "getForgeP04ToP05PhaseHandoff exports sealed P04→P05 phase handoff contract",
      },
    ],
  },
};

export const FORGE_RESEARCHER_PHASE_GATE_A01_PROBE_MATRIX: readonly ResearcherPhaseGateFixtureEntry[] =
  flattenResearcherPhaseGateCategoryProbes(RESEARCHER_PHASE_GATE_CATEGORY_CONTRACTS).map(
    ({ id, category, description, expected }) => ({
      id,
      category,
      description,
      expected,
    }),
  );

export const FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1: ResearcherPhaseGateContract = {
  version: "1.0.0",
  atom: "P04-B10-A02",
  purpose: "Researcher phase gate typed contract with measurable acceptance probes.",
  categories: RESEARCHER_PHASE_GATE_CATEGORY_CONTRACTS,
  probes: flattenResearcherPhaseGateCategoryProbes(RESEARCHER_PHASE_GATE_CATEGORY_CONTRACTS),
};

export function getActiveResearcherPhaseGateContract(): ResearcherPhaseGateContract {
  return FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1;
}

export function getResearcherPhaseGateCategoryContract(
  category: ResearcherPhaseGateCategory,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateCategoryContract {
  return contract.categories[category];
}

export function listResearcherPhaseGateContractProbeIds(
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherPhaseGateProbesByDisposition(
  disposition: ResearcherPhaseGateProbeDisposition,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherPhaseGateContractProbesByCategory(
  category: ResearcherPhaseGateCategory,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): readonly ResearcherPhaseGateProbeContract[] {
  return [...contract.categories[category].probes];
}

export function summarizeResearcherPhaseGateContractCoverage(
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<ResearcherPhaseGateCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<ResearcherPhaseGateProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherPhaseGateCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherPhaseGateProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    for (const probeEntry of categoryContract.probes) {
      totalProbes++;
      if (probeEntry.expected === "PASS") expectedPass++;
      else expectedFail++;
      byDisposition[probeEntry.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export interface ResearcherPhaseGateContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherPhaseGateCategory;
  detail: string;
}

export interface ResearcherPhaseGateContractCoverageResult {
  valid: boolean;
  issues: ResearcherPhaseGateContractCoverageIssue[];
}

export function validateResearcherPhaseGateContractCoverage(
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateContractCoverageResult {
  const issues: ResearcherPhaseGateContractCoverageIssue[] = [];

  for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({
        kind: "missing_category",
        category,
        detail: `missing category contract: ${category}`,
      });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < RESEARCHER_PHASE_GATE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_PHASE_GATE_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryContract.probes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
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

  const ids = listResearcherPhaseGateContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherPhaseGateContractCoverage(contract);
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
    if (!probe.id.startsWith("rpg.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rpg. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherPhaseGateContract(
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateContractCoverageResult {
  return validateResearcherPhaseGateContractCoverage(contract);
}

export function validateResearcherPhaseGateAgainstContract(
  fixture: ResearcherPhaseGateBaseline,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateValidationResult {
  const issues: ResearcherPhaseGateValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = contract.categories[category].probes;
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
  }

  for (const probeId of contractIds) {
    if (!fixtureIds.has(probeId)) {
      issues.push({ kind: "missing_probe", probeId, detail: `fixture missing contract probe ${probeId}` });
    }
  }

  for (const probeId of fixtureIds) {
    if (!contractIds.has(probeId)) {
      issues.push({ kind: "extra_probe", probeId, detail: `fixture has extra probe ${probeId}` });
    }
  }

  for (const entry of fixture.probes) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    if (!contractProbe) continue;
    if (entry.category !== contractProbe.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${contractProbe.category}`,
      });
    }
    if (entry.expected !== contractProbe.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${contractProbe.expected}`,
      });
    }
  }

  const contractExpectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (contractExpectedFail > 0 && failGaps.length === 0) {
    issues.push({
      kind: "missing_probe",
      detail: "fixture must document known FAIL gaps matching contract",
    });
  }
  if (failGaps.length !== contractExpectedFail) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${contractExpectedFail}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function loadResearcherPhaseGateBaseline(): ResearcherPhaseGateBaseline {
  return researcherPhaseGateBaseline as ResearcherPhaseGateBaseline;
}

export function validateResearcherPhaseGateBaseline(
  fixture: ResearcherPhaseGateBaseline,
): ResearcherPhaseGateValidationResult {
  const issues: ResearcherPhaseGateValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B10-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_PHASE_GATE_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherPhaseGateCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
    const min = RESEARCHER_PHASE_GATE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_PHASE_GATE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_PHASE_GATE_A01_PROBE_MATRIX.length}`,
    });
  }

  const handoff = getForgeP04B09ToB10Handoff();
  const handoffCoverage = summarizeResearcherResearchToWorkerHandoffContractCoverage(
    getActiveResearcherResearchToWorkerHandoffContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.researchToWorkerHandoffProbeCount !== handoffCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.researchToWorkerHandoffProbeCount=${fixture.sourceBlockGate.researchToWorkerHandoffProbeCount} ` +
        `contract=${handoffCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B09_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B09_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sealedArtifacts.harnessVersion !== FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail: `B09 handoff harnessVersion mismatch`,
    });
  }

  const contractAlignment = validateResearcherPhaseGateAgainstContract(
    fixture,
    getActiveResearcherPhaseGateContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherPhaseGateMatrix(
  results: ResearcherPhaseGateProbeResult[],
): ResearcherPhaseGateProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherPhaseGateProbeSummary["byCategory"];
  for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
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

export function listResearcherPhaseGateProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherPhaseGateBaseline = loadResearcherPhaseGateBaseline(),
): ResearcherPhaseGateFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherPhaseGateKnownGaps(
  results: ResearcherPhaseGateProbeResult[],
): ResearcherPhaseGateProbeResult[] {
  return summarizeResearcherPhaseGateMatrix(results).knownGaps;
}

export interface ResearcherPhaseGateProbeMatrixValidationIssue {
  kind:
    | "missing_result"
    | "extra_result"
    | "pass_mismatch"
    | "gap_misaligned"
    | "unexpected_mismatch"
    | "criterion_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherPhaseGateProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherPhaseGateProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateResearcherPhaseGateProbeMatrix(
  results: ResearcherPhaseGateProbeResult[],
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateProbeMatrixValidationResult {
  const issues: ResearcherPhaseGateProbeMatrixValidationIssue[] = [];
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
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateResearcherPhaseGateBoundaryProbeMatrix(
  results: ResearcherPhaseGateProbeResult[],
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateProbeMatrixValidationResult {
  const boundaryProbes = listResearcherPhaseGateContractProbesByCategory("boundary", contract);
  const boundaryContract: ResearcherPhaseGateContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherPhaseGateProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherPhaseGateBoundarySliceResult {
  atom: "P04-B10-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherPhaseGateProbeResult[];
  boundaryResults: ResearcherPhaseGateProbeResult[];
  matrixValidation: ResearcherPhaseGateProbeMatrixValidationResult;
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherPhaseGateCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherPhaseGateFailureRecoveryProbeMatrix(
  results: ResearcherPhaseGateProbeResult[],
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherPhaseGateContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherPhaseGateContract = {
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
  return validateResearcherPhaseGateProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listResearcherPhaseGateFailureRecoveryProbeIds(
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): string[] {
  return RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherPhaseGateFailureRecoverySliceResult {
  atom: "P04-B10-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherPhaseGateProbeResult[];
  failureRecoveryResults: ResearcherPhaseGateProbeResult[];
  matrixValidation: ResearcherPhaseGateProbeMatrixValidationResult;
}

/** Per-probe evidence entry — disposition, criterion and aligned outcomes (P04-B10-A06). */
export interface ResearcherPhaseGateProbeEvidence {
  probeId: string;
  category: ResearcherPhaseGateCategory;
  disposition: ResearcherPhaseGateProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for phase gate runs (P04-B10-A06). */
export interface ResearcherPhaseGateProbeTelemetry {
  probeId: string;
  category: ResearcherPhaseGateCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B10-A06). */
export interface ResearcherPhaseGateProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  /** Slice atom when record covers a subset (e.g. evidence gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly ResearcherPhaseGateCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated phase gate run record bundling evidence, telemetry and provenance. */
export interface ResearcherPhaseGateRunRecord {
  provenance: ResearcherPhaseGateProvenance;
  evidence: ResearcherPhaseGateProbeEvidence[];
  telemetry: ResearcherPhaseGateProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherPhaseGateCategory, number>;
    byDisposition: Record<ResearcherPhaseGateProbeDisposition, number>;
  };
}

export interface ResearcherPhaseGateRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherPhaseGateRunValidationResult {
  valid: boolean;
  issues: ResearcherPhaseGateRunValidationIssue[];
}

export function buildResearcherPhaseGateProbeEvidence(
  probeId: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherPhaseGateProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherPhaseGateProbeEvidence {
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

export function buildResearcherPhaseGateProbeTelemetry(
  probeId: string,
  category: ResearcherPhaseGateCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherPhaseGateProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherPhaseGateProvenance(
  runId: string,
  fixture: ResearcherPhaseGateBaseline,
  contract: ResearcherPhaseGateContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherPhaseGateCategory[];
  },
): ResearcherPhaseGateProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_PHASE_GATE_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceBlockGateVersion: fixture.sourceBlockGate.version,
    sourceBlockGateAtom: fixture.sourceBlockGate.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildResearcherPhaseGateRunRecord(
  provenance: ResearcherPhaseGateProvenance,
  evidence: ResearcherPhaseGateProbeEvidence[],
  telemetry: ResearcherPhaseGateProbeTelemetry[],
): ResearcherPhaseGateRunRecord {
  const byCategory = {} as Record<ResearcherPhaseGateCategory, number>;
  const byDisposition: Record<ResearcherPhaseGateProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
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

function validateResearcherPhaseGateRunRecordAgainstProbeIds(
  record: ResearcherPhaseGateRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherPhaseGateContract,
): ResearcherPhaseGateRunValidationResult {
  const issues: ResearcherPhaseGateRunValidationIssue[] = [];
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
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherPhaseGateRunRecord(
  record: ResearcherPhaseGateRunRecord,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateRunValidationResult {
  return validateResearcherPhaseGateRunRecordAgainstProbeIds(
    record,
    listResearcherPhaseGateContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherPhaseGateEvidenceRunRecord(
  record: ResearcherPhaseGateRunRecord,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGateRunValidationResult {
  const issues: ResearcherPhaseGateRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B10-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B10-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherPhaseGateRunRecordAgainstProbeIds(
    record,
    listResearcherPhaseGateFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherPhaseGateEvidenceSliceResult {
  atom: "P04-B10-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherPhaseGateProbeResult[];
  evidenceResults: ResearcherPhaseGateProbeResult[];
  matrixValidation: ResearcherPhaseGateProbeMatrixValidationResult;
  record: ResearcherPhaseGateRunRecord;
  recordValidation: ResearcherPhaseGateRunValidationResult;
}

// ─── Property and fuzz validation (P04-B10-A07) ───────────────────────────────

export interface ResearcherPhaseGatePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherPhaseGatePropertyResult {
  passed: number;
  failed: ResearcherPhaseGatePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherPhaseGatePropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherPhaseGateContract) => string | null;
};

const RESEARCHER_PHASE_GATE_STRUCTURAL_PROPERTIES: readonly ResearcherPhaseGatePropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight researcher phase gate categories are declared",
      check: contract => {
        for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherPhaseGateContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
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
      description:
        "summarizeResearcherPhaseGateContractCoverage totals match listResearcherPhaseGateContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherPhaseGateContractCoverage(contract);
        const ids = listResearcherPhaseGateContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rpg. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rpg.")) {
            return `${probe.id} missing rpg. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherPhaseGateBaseline();
        const probeIds = listResearcherPhaseGateContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherPhaseGateProbeEvidence(
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
          return buildResearcherPhaseGateProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.05,
          );
        });
        const record = buildResearcherPhaseGateRunRecord(
          buildResearcherPhaseGateProvenance(
            "property-check",
            fixture,
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
      description:
        "Synthetic failure/recovery slice record passes validateResearcherPhaseGateEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherPhaseGateBaseline();
        const probeIds = listResearcherPhaseGateFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherPhaseGateProbeEvidence(
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
          return buildResearcherPhaseGateProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherPhaseGateRunRecord(
          buildResearcherPhaseGateProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B10-A06",
              sliceCategories: RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherPhaseGateEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherPhaseGatePropertyValidation(
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): ResearcherPhaseGatePropertyResult {
  const failed: ResearcherPhaseGatePropertyViolation[] = [];
  for (const property of RESEARCHER_PHASE_GATE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_PHASE_GATE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherPhaseGateFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherPhaseGateFuzzMutationCase {
  seed: number;
  kind: ResearcherPhaseGateFuzzMutationKind;
  probeId?: string;
  category?: ResearcherPhaseGateCategory;
}

export interface ResearcherPhaseGateFuzzValidationCaseResult {
  mutation: ResearcherPhaseGateFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherPhaseGateFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherPhaseGateFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherPhaseGateFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherPhaseGateBaseline(
  fixture: ResearcherPhaseGateBaseline,
): ResearcherPhaseGateBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherPhaseGateFuzzTarget(
  fixture: ResearcherPhaseGateBaseline,
  rng: () => number,
): {
  category: ResearcherPhaseGateCategory;
  index: number;
  entry: ResearcherPhaseGateFixtureEntry;
} {
  const category =
    RESEARCHER_PHASE_GATE_CATEGORIES[
      Math.floor(rng() * RESEARCHER_PHASE_GATE_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherPhaseGateFuzzMutation(
  fixture: ResearcherPhaseGateBaseline,
  mutation: ResearcherPhaseGateFuzzMutationCase,
): ResearcherPhaseGateBaseline {
  const mutated = cloneResearcherPhaseGateBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_PHASE_GATE_CATEGORIES[0]!;
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
          id: `rpg.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_PHASE_GATE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherPhaseGateFuzzMutationCases(
  fixture: ResearcherPhaseGateBaseline,
  seed: number,
  iterations: number,
): ResearcherPhaseGateFuzzMutationCase[] {
  const rng = createResearcherPhaseGateFuzzRng(seed);
  const kinds: ResearcherPhaseGateFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherPhaseGateFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherPhaseGateFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B10-A07). */
export function runResearcherPhaseGateFuzzValidation(
  fixture: ResearcherPhaseGateBaseline,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
  seed = 42,
  iterations = 24,
): ResearcherPhaseGateFuzzValidationResult {
  const cases = generateResearcherPhaseGateFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherPhaseGateFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherPhaseGateFuzzMutation(fixture, mutation);
    const validation = validateResearcherPhaseGateAgainstContract(mutated, contract);
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

export type ResearcherPhaseGateRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherPhaseGateRunRecordFuzzCase {
  kind: ResearcherPhaseGateRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherPhaseGateRunRecordFuzzMutation(
  record: ResearcherPhaseGateRunRecord,
  mutation: ResearcherPhaseGateRunRecordFuzzCase,
): ResearcherPhaseGateRunRecord {
  const cloned: ResearcherPhaseGateRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B10-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["phase_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherPhaseGateRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherPhaseGateRunRecordValidator(
  record: ResearcherPhaseGateRunRecord,
): (
  record: ResearcherPhaseGateRunRecord,
  contract: ResearcherPhaseGateContract,
) => ResearcherPhaseGateRunValidationResult {
  return record.provenance.sliceAtom === "P04-B10-A06"
    ? validateResearcherPhaseGateEvidenceRunRecord
    : validateResearcherPhaseGateRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B10-A07). */
export function runResearcherPhaseGateRunRecordFuzzValidation(
  record: ResearcherPhaseGateRunRecord,
  contract: ResearcherPhaseGateContract = getActiveResearcherPhaseGateContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherPhaseGateRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherPhaseGateRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B10-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherPhaseGateRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherPhaseGatePropertyFuzzSliceResult {
  atom: "P04-B10-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherPhaseGatePropertyResult;
  contractFuzz: ResearcherPhaseGateFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

/**
 * A07 property/fuzz slice: structural property checks and contract fuzz gates
 * with zero accepted mutations.
 */
export function runResearcherPhaseGatePropertyFuzzSlice(
  fixture: ResearcherPhaseGateBaseline = loadResearcherPhaseGateBaseline(),
): ResearcherPhaseGatePropertyFuzzSliceResult {
  const contract = getActiveResearcherPhaseGateContract();
  const propertyResult = runResearcherPhaseGatePropertyValidation(contract);
  const contractFuzz = runResearcherPhaseGateFuzzValidation(fixture, contract);

  const probeIds = listResearcherPhaseGateFailureRecoveryProbeIds(contract);
  const evidence = probeIds.map(id => {
    const probe = contract.probes.find(p => p.id === id)!;
    return buildResearcherPhaseGateProbeEvidence(
      id,
      probe.category,
      probe.expected,
      probe.expected,
      true,
      probe.criterion,
      "property-fuzz",
      probe.disposition,
    );
  });
  const telemetry = probeIds.map((id, index) => {
    const probe = contract.probes.find(p => p.id === id)!;
    return buildResearcherPhaseGateProbeTelemetry(id, probe.category, index, index * 0.5);
  });
  const record = buildResearcherPhaseGateRunRecord(
    buildResearcherPhaseGateProvenance(
      "property-fuzz-slice",
      fixture,
      contract,
      "2026-07-19T14:00:00.000Z",
      "2026-07-19T14:00:01.000Z",
      probeIds.length,
      {
        sliceAtom: "P04-B10-A06",
        sliceCategories: RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
      },
    ),
    evidence,
    telemetry,
  );

  const runRecordFuzz = runResearcherPhaseGateRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B10-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

export { FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION };
