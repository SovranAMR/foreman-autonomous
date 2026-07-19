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

export const FORGE_VISIONER_SYNTHESIS_VERSION = "1.0.0-a07";

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

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateVisionerSynthesisBoundaryProbeMatrix(
  results: VisionerSynthesisProbeResult[],
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisProbeMatrixValidationResult {
  const boundaryProbes = listVisionerSynthesisContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerSynthesisContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerSynthesisProbeMatrix(boundaryResults, boundaryContract);
}

export const VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerSynthesisCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerSynthesisFailureRecoveryProbeMatrix(
  results: VisionerSynthesisProbeResult[],
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerSynthesisContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerSynthesisContract = {
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
  return validateVisionerSynthesisProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerSynthesisFailureRecoveryProbeIds(
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): string[] {
  return VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerSynthesisContractProbesByCategory(category, contract).map(p => p.id),
  );
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P02-B03-A06). */
export interface VisionerSynthesisProbeEvidence {
  probeId: string;
  category: VisionerSynthesisCategory;
  disposition: VisionerSynthesisProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for visioner synthesis runs (P02-B03-A06). */
export interface VisionerSynthesisProbeTelemetry {
  probeId: string;
  category: VisionerSynthesisCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P02-B03-A06). */
export interface VisionerSynthesisProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly VisionerSynthesisCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated visioner synthesis run record bundling evidence, telemetry and provenance. */
export interface VisionerSynthesisRunRecord {
  provenance: VisionerSynthesisProvenance;
  evidence: VisionerSynthesisProbeEvidence[];
  telemetry: VisionerSynthesisProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<VisionerSynthesisCategory, number>;
    byDisposition: Record<VisionerSynthesisProbeDisposition, number>;
  };
}

export interface VisionerSynthesisRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface VisionerSynthesisRunValidationResult {
  valid: boolean;
  issues: VisionerSynthesisRunValidationIssue[];
}

export function buildVisionerSynthesisProbeEvidence(
  probeId: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: VisionerSynthesisProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): VisionerSynthesisProbeEvidence {
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

export function buildVisionerSynthesisProbeTelemetry(
  probeId: string,
  category: VisionerSynthesisCategory,
  sequenceIndex: number,
  durationMs: number,
): VisionerSynthesisProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildVisionerSynthesisProvenance(
  runId: string,
  fixture: VisionerSynthesisBaseline,
  contract: VisionerSynthesisContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly VisionerSynthesisCategory[];
  },
): VisionerSynthesisProvenance {
  return {
    runId,
    harnessVersion: FORGE_VISIONER_SYNTHESIS_VERSION,
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

export function buildVisionerSynthesisRunRecord(
  provenance: VisionerSynthesisProvenance,
  evidence: VisionerSynthesisProbeEvidence[],
  telemetry: VisionerSynthesisProbeTelemetry[],
): VisionerSynthesisRunRecord {
  const byCategory = {} as Record<VisionerSynthesisCategory, number>;
  const byDisposition: Record<VisionerSynthesisProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
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

function validateVisionerSynthesisRunRecordAgainstProbeIds(
  record: VisionerSynthesisRunRecord,
  expectedProbeIds: string[],
  contract: VisionerSynthesisContract,
): VisionerSynthesisRunValidationResult {
  const issues: VisionerSynthesisRunValidationIssue[] = [];
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

export function validateVisionerSynthesisRunRecord(
  record: VisionerSynthesisRunRecord,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisRunValidationResult {
  return validateVisionerSynthesisRunRecordAgainstProbeIds(
    record,
    listVisionerSynthesisContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateVisionerSynthesisFailureRecoveryRunRecord(
  record: VisionerSynthesisRunRecord,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisRunValidationResult {
  const issues: VisionerSynthesisRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P02-B03-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P02-B03-A06`,
    });
  }

  const expectedCategories = [...VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateVisionerSynthesisRunRecordAgainstProbeIds(
    record,
    listVisionerSynthesisFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

// ─── Property and fuzz validation (P02-B03-A07) ─────────────────────────────

export interface VisionerSynthesisPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface VisionerSynthesisPropertyResult {
  passed: number;
  failed: VisionerSynthesisPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type VisionerSynthesisPropertyCheck = {
  id: string;
  description: string;
  check: (contract: VisionerSynthesisContract) => string | null;
};

const SYNTHESIS_PROPERTY_CHECK_FIXTURE: VisionerSynthesisBaseline = {
  version: "0",
  atom: "x",
  purpose: "x",
  sourceBlockGate: {
    version: "0",
    atom: "x",
    contractVersion: "0",
    visionerConstraintProbeCount: 0,
    sealedAtomCount: 0,
  },
  probes: [],
};

const VISIONER_SYNTHESIS_STRUCTURAL_PROPERTIES: readonly VisionerSynthesisPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight visioner synthesis categories are declared",
    check: contract => {
      for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listVisionerSynthesisContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
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
    description: "summarizeVisionerSynthesisContractCoverage totals match listVisionerSynthesisContractProbeIds",
    check: contract => {
      const summary = summarizeVisionerSynthesisContractCoverage(contract);
      const ids = listVisionerSynthesisContractProbeIds(contract);
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
    description: "Probe ids are namespaced with vsyn. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("vsyn.")) {
          return `${probe.id} missing vsyn. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listVisionerSynthesisContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerSynthesisProbeEvidence(
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
        return buildVisionerSynthesisProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildVisionerSynthesisRunRecord(
        buildVisionerSynthesisProvenance(
          "property-check",
          SYNTHESIS_PROPERTY_CHECK_FIXTURE,
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
    description: "Synthetic failure/recovery slice record passes validateVisionerSynthesisFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listVisionerSynthesisFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerSynthesisProbeEvidence(
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
        return buildVisionerSynthesisProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildVisionerSynthesisRunRecord(
        buildVisionerSynthesisProvenance(
          "property-check-failure-recovery",
          SYNTHESIS_PROPERTY_CHECK_FIXTURE,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P02-B03-A06",
            sliceCategories: VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateVisionerSynthesisFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runVisionerSynthesisPropertyChecks(
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): VisionerSynthesisPropertyResult {
  const failed: VisionerSynthesisPropertyViolation[] = [];
  for (const property of VISIONER_SYNTHESIS_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = VISIONER_SYNTHESIS_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type VisionerSynthesisFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface VisionerSynthesisFuzzMutationCase {
  seed: number;
  kind: VisionerSynthesisFuzzMutationKind;
  probeId?: string;
  category?: VisionerSynthesisCategory;
}

export interface VisionerSynthesisFuzzValidationCaseResult {
  mutation: VisionerSynthesisFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface VisionerSynthesisFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: VisionerSynthesisFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createVisionerSynthesisFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneVisionerSynthesisBaseline(fixture: VisionerSynthesisBaseline): VisionerSynthesisBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickVisionerSynthesisFuzzTarget(
  fixture: VisionerSynthesisBaseline,
  rng: () => number,
): { category: VisionerSynthesisCategory; index: number; entry: VisionerSynthesisFixtureEntry } {
  const category = VISIONER_SYNTHESIS_CATEGORIES[Math.floor(rng() * VISIONER_SYNTHESIS_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyVisionerSynthesisFuzzMutation(
  fixture: VisionerSynthesisBaseline,
  mutation: VisionerSynthesisFuzzMutationCase,
): VisionerSynthesisBaseline {
  const mutated = cloneVisionerSynthesisBaseline(fixture);
  const targetCategory = mutation.category ?? VISIONER_SYNTHESIS_CATEGORIES[0]!;
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
          id: `vsyn.fuzz.extra.${mutation.seed}`,
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
      const other = VISIONER_SYNTHESIS_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateVisionerSynthesisFuzzMutationCases(
  fixture: VisionerSynthesisBaseline,
  seed: number,
  iterations: number,
): VisionerSynthesisFuzzMutationCase[] {
  const rng = createVisionerSynthesisFuzzRng(seed);
  const kinds: VisionerSynthesisFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: VisionerSynthesisFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickVisionerSynthesisFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P02-B03-A07). */
export function runVisionerSynthesisFuzzValidation(
  fixture: VisionerSynthesisBaseline,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
  seed = 42,
  iterations = 24,
): VisionerSynthesisFuzzValidationResult {
  const cases = generateVisionerSynthesisFuzzMutationCases(fixture, seed, iterations);
  const results: VisionerSynthesisFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyVisionerSynthesisFuzzMutation(fixture, mutation);
    const validation = validateVisionerSynthesisAgainstContract(mutated, contract);
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

export type VisionerSynthesisRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface VisionerSynthesisRunRecordFuzzCase {
  kind: VisionerSynthesisRunRecordFuzzKind;
  probeId?: string;
}

export function applyVisionerSynthesisRunRecordFuzzMutation(
  record: VisionerSynthesisRunRecord,
  mutation: VisionerSynthesisRunRecordFuzzCase,
): VisionerSynthesisRunRecord {
  const cloned: VisionerSynthesisRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P02-B03-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["synthesis_versioning"],
      };
      break;
  }

  cloned.summary = buildVisionerSynthesisRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveVisionerSynthesisRunRecordValidator(
  record: VisionerSynthesisRunRecord,
): (
  record: VisionerSynthesisRunRecord,
  contract: VisionerSynthesisContract,
) => VisionerSynthesisRunValidationResult {
  return record.provenance.sliceAtom === "P02-B03-A06"
    ? validateVisionerSynthesisFailureRecoveryRunRecord
    : validateVisionerSynthesisRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P02-B03-A07). */
export function runVisionerSynthesisRunRecordFuzzValidation(
  record: VisionerSynthesisRunRecord,
  contract: VisionerSynthesisContract = getActiveVisionerSynthesisContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveVisionerSynthesisRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: VisionerSynthesisRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P02-B03-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyVisionerSynthesisRunRecordFuzzMutation(record, mutation);
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
