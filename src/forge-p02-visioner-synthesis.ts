/**
 * FOREMAN — Visioner Product Synthesis Baseline (P02-B03)
 *
 * Measures product vision synthesis — emotion, focal point, aesthetic tokens —
 * on sealed P02-B02 visioner constraint block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  buildVisionConstraintSummary,
  getActiveVisionerConstraintContract,
  getForgeP02B02ToB03Handoff,
  summarizeVisionerConstraintContractCoverage,
} from "./forge-p02-visioner-constraint.js";

export const FORGE_VISIONER_SYNTHESIS_VERSION = "1.0.0-a03";

/** Maximum normalized vision length before truncation (P02-B03-A04 boundary). */
export const VISIONER_SYNTHESIS_VISION_MAX_LENGTH = 32000;

export const VISIONER_SYNTHESIS_CATEGORIES = [
  "synthesis_versioning",
  "synthesis_signal",
  "aesthetic_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerSynthesisCategory = (typeof VISIONER_SYNTHESIS_CATEGORIES)[number];

export type VisionerSynthesisInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerSynthesisInputBoundary {
  disposition: VisionerSynthesisInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerSynthesisPresence {
  hasEmotionTarget: boolean;
  hasFocalPoint: boolean;
  hasColorPhilosophy: boolean;
  hasTypographyHierarchy: boolean;
  emotionLines: string[];
  focalLines: string[];
  colorLines: string[];
  typographyLines: string[];
  detail: string;
}

export interface VisionerSynthesisExtract {
  emotionTarget: string[];
  focalPoint: string[];
  colorPhilosophy: string[];
  typographyHierarchy: string[];
  hasEmotionTarget: boolean;
  hasFocalPoint: boolean;
  hasColorPhilosophy: boolean;
  hasTypographyHierarchy: boolean;
  presence: VisionerSynthesisPresence;
  detail: string;
}

/**
 * Assess vision output boundary conditions — empty, whitespace-only, null bytes, max length (P02-B03-A01).
 */
export function assessVisionerSynthesisInputBoundary(
  visionOutput: string,
): VisionerSynthesisInputBoundary {
  if (visionOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: "null byte in vision output",
    };
  }

  const trimmed = visionOutput.trim();
  if (trimmed.length === 0) {
    const disposition: VisionerSynthesisInputDisposition =
      visionOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: disposition === "empty" ? "empty vision output" : "whitespace-only vision output",
    };
  }

  let normalizedVision = visionOutput;
  let truncated = false;
  if (normalizedVision.length > VISIONER_SYNTHESIS_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, VISIONER_SYNTHESIS_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${VISIONER_SYNTHESIS_VISION_MAX_LENGTH} characters`
      : "valid vision output",
  };
}

const SYNTHESIS_SECTION_HEADERS = {
  emotion: /^\*?\*?\s*EMOTION\s*TARGET/i,
  focal: /^\*?\*?\s*FOCAL\s*POINT/i,
  color: /^\*?\*?\s*COLOR\s*PHILOSOPHY/i,
  typography: /^\*?\*?\s*TYPOGRAPHY\s*HIERARCHY/i,
} as const;

const GENERIC_SECTION_HEADER = /^\*?\*?\s*[A-Z][A-Z\s-]+/;

function collectSynthesisSectionLines(
  visionOutput: string,
  headerPattern: RegExp,
): string[] {
  const lines = visionOutput.split("\n");
  const sectionLines: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (headerPattern.test(trimmed)) {
      capturing = true;
      sectionLines.push(trimmed);
      continue;
    }
    if (capturing) {
      if (trimmed.length === 0) continue;
      if (GENERIC_SECTION_HEADER.test(trimmed) && !headerPattern.test(trimmed)) {
        capturing = false;
      } else {
        sectionLines.push(trimmed);
      }
    }
  }

  return sectionLines;
}

/**
 * Assess whether vision output declares product synthesis sections (P02-B03-A01).
 */
export function assessVisionerSynthesisPresence(visionOutput: string): VisionerSynthesisPresence {
  const boundary = assessVisionerSynthesisInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasEmotionTarget: false,
      hasFocalPoint: false,
      hasColorPhilosophy: false,
      hasTypographyHierarchy: false,
      emotionLines: [],
      focalLines: [],
      colorLines: [],
      typographyLines: [],
      detail: boundary.detail,
    };
  }

  const normalized = boundary.normalizedVision;
  const emotionLines = collectSynthesisSectionLines(normalized, SYNTHESIS_SECTION_HEADERS.emotion);
  const focalLines = collectSynthesisSectionLines(normalized, SYNTHESIS_SECTION_HEADERS.focal);
  const colorLines = collectSynthesisSectionLines(normalized, SYNTHESIS_SECTION_HEADERS.color);
  const typographyLines = collectSynthesisSectionLines(
    normalized,
    SYNTHESIS_SECTION_HEADERS.typography,
  );

  return {
    hasEmotionTarget: emotionLines.length > 0,
    hasFocalPoint: focalLines.length > 0,
    hasColorPhilosophy: colorLines.length > 0,
    hasTypographyHierarchy: typographyLines.length > 0,
    emotionLines,
    focalLines,
    colorLines,
    typographyLines,
    detail:
      `emotion=${emotionLines.length}, focal=${focalLines.length}, ` +
      `color=${colorLines.length}, typography=${typographyLines.length}`,
  };
}

function stripSectionHeader(line: string, headerPattern: RegExp): string {
  return line.replace(headerPattern, "").replace(/^:\s*/, "").replace(/^[-*]\s*/, "").trim();
}

/**
 * Parse vision output into structured product synthesis tokens (P02-B03-A01 measurement).
 */
export function extractVisionerSynthesis(visionOutput: string): VisionerSynthesisExtract {
  const presence = assessVisionerSynthesisPresence(visionOutput);

  const emotionTarget = presence.emotionLines
    .map(line => stripSectionHeader(line, SYNTHESIS_SECTION_HEADERS.emotion))
    .filter(Boolean);
  const focalPoint = presence.focalLines
    .map(line => stripSectionHeader(line, SYNTHESIS_SECTION_HEADERS.focal))
    .filter(Boolean);
  const colorPhilosophy = presence.colorLines
    .map(line => stripSectionHeader(line, SYNTHESIS_SECTION_HEADERS.color))
    .filter(Boolean);
  const typographyHierarchy = presence.typographyLines
    .map(line => stripSectionHeader(line, SYNTHESIS_SECTION_HEADERS.typography))
    .filter(Boolean);

  return {
    emotionTarget,
    focalPoint,
    colorPhilosophy,
    typographyHierarchy,
    hasEmotionTarget: presence.hasEmotionTarget,
    hasFocalPoint: presence.hasFocalPoint,
    hasColorPhilosophy: presence.hasColorPhilosophy,
    hasTypographyHierarchy: presence.hasTypographyHierarchy,
    presence,
    detail: presence.detail,
  };
}

/**
 * Build compact synthesis summary preserving aesthetic headers for worker injection.
 */
export function buildVisionSynthesisSummary(visionOutput: string): string {
  return buildVisionConstraintSummary(visionOutput);
}

export interface VisionerSynthesisFixtureEntry {
  id: string;
  category: VisionerSynthesisCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerSynthesisBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerConstraintProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerSynthesisFixtureEntry[];
}

export interface VisionerSynthesisProbeResult {
  id: string;
  category: VisionerSynthesisCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerSynthesisProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerSynthesisProbeResult[];
  knownGaps: VisionerSynthesisProbeResult[];
  byCategory: Record<
    VisionerSynthesisCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerSynthesisValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerSynthesisCategory;
  detail: string;
}

export interface VisionerSynthesisValidationResult {
  valid: boolean;
  issues: VisionerSynthesisValidationIssue[];
}

export interface VisionerSynthesisContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerSynthesisCategory;
  detail: string;
}

export interface VisionerSynthesisContractCoverageResult {
  valid: boolean;
  issues: VisionerSynthesisContractCoverageIssue[];
}

export type VisionerSynthesisProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerSynthesisProbeContract {
  id: string;
  category: VisionerSynthesisCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerSynthesisProbeDisposition;
  criterion: string;
}

export interface VisionerSynthesisCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerSynthesisCategoryContract {
  category: VisionerSynthesisCategory;
  acceptance: VisionerSynthesisCategoryAcceptance;
  probes: readonly VisionerSynthesisProbeContract[];
}

export interface VisionerSynthesisContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerSynthesisCategory, VisionerSynthesisCategoryContract>;
  probes: readonly VisionerSynthesisProbeContract[];
}

export const VISIONER_SYNTHESIS_A01_MIN_PROBES: Readonly<
  Record<VisionerSynthesisCategory, number>
> = {
  synthesis_versioning: 3,
  synthesis_signal: 3,
  aesthetic_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerSynthesisCategoryProbes(
  categories: Record<VisionerSynthesisCategory, VisionerSynthesisCategoryContract>,
): readonly VisionerSynthesisProbeContract[] {
  return VISIONER_SYNTHESIS_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_SYNTHESIS_CATEGORY_CONTRACTS: Record<
  VisionerSynthesisCategory,
  VisionerSynthesisCategoryContract
> = {
  synthesis_versioning: {
    category: "synthesis_versioning",
    acceptance: {
      invariant:
        "Visioner synthesis baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.version_tagged",
        category: "synthesis_versioning",
        description: "Visioner synthesis baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner synthesis baseline declares semver version field",
      },
      {
        id: "vsyn.atom_tagged",
        category: "synthesis_versioning",
        description: "Visioner synthesis baseline declares P02-B03-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner synthesis baseline declares P02-B03-A01 atom id",
      },
      {
        id: "vsyn.harness_version_exported",
        category: "synthesis_versioning",
        description: "FORGE_VISIONER_SYNTHESIS_VERSION exported for synthesis harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_SYNTHESIS_VERSION exported for synthesis harness",
      },
    ],
  },
  synthesis_signal: {
    category: "synthesis_signal",
    acceptance: {
      invariant:
        "Visioner prompt declares core product synthesis sections: emotion, focal point and synthesize directive.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.prompt_emotion_target",
        category: "synthesis_signal",
        description: "VISIONER_SYSTEM prompt declares EMOTION TARGET output section",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares EMOTION TARGET output section",
      },
      {
        id: "vsyn.prompt_focal_point",
        category: "synthesis_signal",
        description: "VISIONER_SYSTEM prompt declares FOCAL POINT output section",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares FOCAL POINT output section",
      },
      {
        id: "vsyn.prompt_synthesize_directive",
        category: "synthesis_signal",
        description: "VISIONER_SYSTEM prompt declares SYNTHESIZE creative direction step",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares SYNTHESIZE creative direction step",
      },
    ],
  },
  aesthetic_signal: {
    category: "aesthetic_signal",
    acceptance: {
      invariant:
        "Aesthetic synthesis tokens (color, typography) are declared in prompt and preserved in vision summary wiring.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.prompt_color_philosophy",
        category: "aesthetic_signal",
        description: "VISIONER_SYSTEM prompt declares COLOR PHILOSOPHY output section",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares COLOR PHILOSOPHY output section",
      },
      {
        id: "vsyn.prompt_typography_hierarchy",
        category: "aesthetic_signal",
        description: "VISIONER_SYSTEM prompt declares TYPOGRAPHY HIERARCHY output section",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares TYPOGRAPHY HIERARCHY output section",
      },
      {
        id: "vsyn.vision_summary_aesthetic_extract",
        category: "aesthetic_signal",
        description: "Orchestrator buildVisionSummary preserves aesthetic synthesis headers",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator buildVisionSummary preserves aesthetic synthesis headers",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Synthesis baseline links to sealed P02-B02 block gate and visioner constraint handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.b02_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B02_TO_B03_HANDOFF_V1 targets P02-B03-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B02_TO_B03_HANDOFF_V1 targets P02-B03-A01 entry atom",
      },
      {
        id: "vsyn.b02_sealed_constraint_probes",
        category: "baseline_link",
        description: "P02-B02→B03 handoff sealed probeCount matches active visioner constraint contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02-B02→B03 handoff sealed probeCount matches active visioner constraint contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Vision output boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B02 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B02 block gate source artifacts",
      },
      {
        id: "vsyn.probe_runner_exported",
        category: "boundary",
        description: "runVisionerSynthesisProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerSynthesisProbes executes contract-wired probe matrix",
      },
      {
        id: "vsyn.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL synthesis gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL synthesis gap",
      },
      {
        id: "vsyn.empty_vision_synthesis_presence",
        category: "boundary",
        description: "assessVisionerSynthesisInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerSynthesisInputBoundary rejects empty vision output",
      },
      {
        id: "vsyn.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerSynthesisInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerSynthesisInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "vsyn.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerSynthesisInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerSynthesisInputBoundary truncates vision exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Malformed vision guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerSynthesisBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerSynthesisBaseline rejects unexpected fixture version",
      },
      {
        id: "vsyn.malformed_vision_presence_guard",
        category: "failure_path",
        description: "assessVisionerSynthesisPresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerSynthesisPresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves vision synthesis; structured synthesis recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.vision_checkpoint_synthesis",
        category: "recovery_path",
        description: "Pipeline resume reuses checkpoint vision output containing synthesis sections",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses checkpoint vision output containing synthesis sections",
      },
      {
        id: "vsyn.structured_synthesis_recovery",
        category: "recovery_path",
        description: "recoverVisionerSynthesis restructures failed synthesis parse into actionable product vision",
        expected: "FAIL",
        disposition: "gap",
        criterion: "recoverVisionerSynthesis restructures failed synthesis parse into actionable product vision",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Reviewer and reflection layers guard against focal dilution and aesthetic drift from synthesis.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsyn.reviewer_focal_dilution",
        category: "nogo_path",
        description: "Reviewer gate checks FOCAL POINT dilution against vision synthesis",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Reviewer gate checks FOCAL POINT dilution against vision synthesis",
      },
      {
        id: "vsyn.reflection_aesthetic_alignment",
        category: "nogo_path",
        description: "Reflection prompt checks EMOTION TARGET and COLOR PHILOSOPHY alignment",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Reflection prompt checks EMOTION TARGET and COLOR PHILOSOPHY alignment",
      },
    ],
  },
};

export const FORGE_VISIONER_SYNTHESIS_CONTRACT_V1: VisionerSynthesisContract = {
  version: "1.0.0",
  atom: "P02-B03-A05",
  purpose:
    "Typed visioner synthesis contract declaring measurable product vision, aesthetic and guard probes.",
  categories: VISIONER_SYNTHESIS_CATEGORY_CONTRACTS,
  probes: flattenVisionerSynthesisCategoryProbes(VISIONER_SYNTHESIS_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B02_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerSynthesisContract(): VisionerSynthesisContract {
  return FORGE_VISIONER_SYNTHESIS_CONTRACT_V1;
}

export function getVisionerSynthesisCategoryContract(
  category: VisionerSynthesisCategory,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisCategoryContract {
  return contract.categories[category];
}

export function listVisionerSynthesisContractProbeIds(
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerSynthesisProbesByDisposition(
  disposition: VisionerSynthesisProbeDisposition,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerSynthesisContractProbesByCategory(
  category: VisionerSynthesisCategory,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeVisionerSynthesisContractCoverage(
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerSynthesisCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerSynthesisProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerSynthesisCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerSynthesisProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
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

export function validateVisionerSynthesisContractCoverage(
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisContractCoverageResult {
  const issues: VisionerSynthesisContractCoverageIssue[] = [];

  for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_SYNTHESIS_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_SYNTHESIS_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerSynthesisContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerSynthesisContractCoverage(contract);
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
    if (!probe.id.startsWith("vsyn.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vsyn. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateVisionerSynthesisAgainstContract(
  fixture: VisionerSynthesisBaseline,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisValidationResult {
  const issues: VisionerSynthesisValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
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

export function validateVisionerSynthesisBaseline(
  fixture: VisionerSynthesisBaseline,
): VisionerSynthesisValidationResult {
  const issues: VisionerSynthesisValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B03-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_SYNTHESIS_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerSynthesisCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
    const min = VISIONER_SYNTHESIS_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B02ToB03Handoff();
  const constraintCoverage = summarizeVisionerConstraintContractCoverage(
    getActiveVisionerConstraintContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.visionerConstraintProbeCount !== constraintCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerConstraintProbeCount=${fixture.sourceBlockGate.visionerConstraintProbeCount} ` +
        `contract=${constraintCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B02 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B02_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateVisionerSynthesisAgainstContract(
    fixture,
    getActiveVisionerSynthesisContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerSynthesisMatrix(
  results: VisionerSynthesisProbeResult[],
): VisionerSynthesisProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerSynthesisProbeSummary["byCategory"];
  for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
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

export function listVisionerSynthesisProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerSynthesisBaseline,
): VisionerSynthesisFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerSynthesisKnownGaps(
  results: VisionerSynthesisProbeResult[],
): VisionerSynthesisProbeResult[] {
  return summarizeVisionerSynthesisMatrix(results).knownGaps;
}

export interface VisionerSynthesisProbeMatrixValidationIssue {
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

export interface VisionerSynthesisProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerSynthesisProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateVisionerSynthesisProbeMatrix(
  results: VisionerSynthesisProbeResult[],
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisProbeMatrixValidationResult {
  const issues: VisionerSynthesisProbeMatrixValidationIssue[] = [];
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
