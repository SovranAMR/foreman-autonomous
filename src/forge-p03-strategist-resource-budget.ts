/**
 * FOREMAN — Strategist Resource & Budget Baseline (P03-B06)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P03-B05 risk reversibility block gate artifacts.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistResourceBudgetBaseline from "./fixtures/forge-strategist-resource-budget-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B05ToB06Handoff,
  summarizeStrategistRiskReversibilityCoverage,
  getActiveStrategistRiskReversibilityContract,
  FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION,
} from "./forge-p03-strategist-risk-reversibility.js";
import {
  recoverStrategistDecompose,
  type StrategistDecomposeRecoveryHints,
} from "./forge-p03-strategist-intent.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION = "1.0.0-a07";

export const EXPECTED_P03_B05_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH = 64000;

export type StrategistResourceBudgetInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistResourceBudgetInputBoundary {
  disposition: StrategistResourceBudgetInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistResourceBudgetInputBoundary(
  decomposeOutput: string,
): StrategistResourceBudgetInputBoundary {
  if (decomposeOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: "null byte detected in decompose output",
    };
  }

  const trimmed = decomposeOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistResourceBudgetInputDisposition =
      decomposeOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: disposition === "empty" ? "empty decompose output" : "whitespace-only decompose output",
    };
  }

  let normalizedDecompose = decomposeOutput;
  let truncated = false;
  if (normalizedDecompose.length > STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistResourceBudgetRecoveryHints extends StrategistDecomposeRecoveryHints {
  resourcePlan?: string;
  tokenBudget?: string;
}

export interface StrategistResourceBudgetRecoveryResult {
  recovered: boolean;
  resourceBudgetCompliant: boolean;
  composedDecompose: string;
  blocks: string[];
  blockCount: number;
  hasResourcePlan: boolean;
  hasTokenBudget: boolean;
  resourcePlan?: string;
  tokenBudget?: string;
  parseErrors: string[];
  detail: string;
}

const DEFAULT_STRATEGIST_RESOURCE_PLAN =
  "Block 1 lightweight setup; Block 2 moderate wiring; Block 3 integration tests";
const DEFAULT_STRATEGIST_TOKEN_BUDGET =
  "perThought=4096, perChain=50000, session cap per orchestrator MAX_TOKENS_SESSION";

function resourceBudgetSectionPresence(text: string): {
  hasResourcePlan: boolean;
  hasTokenBudget: boolean;
} {
  return {
    hasResourcePlan: /RESOURCE PLAN:/i.test(text),
    hasTokenBudget: /TOKEN BUDGET:/i.test(text),
  };
}

function injectStrategistResourceBudgetSections(
  decompose: string,
  resourcePlan: string,
  tokenBudget: string,
): string {
  const confidenceMatch = decompose.match(/\nCONFIDENCE:\s*[\d.]+/);
  if (confidenceMatch && confidenceMatch.index !== undefined) {
    const before = decompose.slice(0, confidenceMatch.index);
    const after = decompose.slice(confidenceMatch.index);
    return `${before}\nRESOURCE PLAN: ${resourcePlan}\nTOKEN BUDGET: ${tokenBudget}${after}`;
  }
  return `${decompose}\nRESOURCE PLAN: ${resourcePlan}\nTOKEN BUDGET: ${tokenBudget}`;
}

/**
 * Restructure failed decompose parse into resource-budget compliant plan (P03-B06-A03).
 */
export function recoverStrategistResourceBudget(
  failedParse: string,
  hints: StrategistResourceBudgetRecoveryHints = {},
): StrategistResourceBudgetRecoveryResult {
  const boundary = assessStrategistResourceBudgetInputBoundary(failedParse);
  if (!boundary.acceptable) {
    const parseErrors =
      boundary.disposition === "contains_null_byte"
        ? ["null_byte_in_decompose"]
        : boundary.disposition === "empty"
          ? ["empty_decompose"]
          : ["whitespace_only_decompose"];
    return {
      recovered: false,
      resourceBudgetCompliant: false,
      composedDecompose: "",
      blocks: [],
      blockCount: 0,
      hasResourcePlan: false,
      hasTokenBudget: false,
      parseErrors,
      detail: boundary.detail,
    };
  }

  const decomposeRecovery = recoverStrategistDecompose(boundary.normalizedDecompose, hints);
  if (!decomposeRecovery.recovered) {
    return {
      recovered: false,
      resourceBudgetCompliant: false,
      composedDecompose: decomposeRecovery.composedDecompose,
      blocks: decomposeRecovery.blocks,
      blockCount: decomposeRecovery.blockCount,
      hasResourcePlan: false,
      hasTokenBudget: false,
      parseErrors: decomposeRecovery.parseErrors,
      detail: decomposeRecovery.detail,
    };
  }

  let composed = decomposeRecovery.composedDecompose;
  let { hasResourcePlan, hasTokenBudget } = resourceBudgetSectionPresence(composed);
  const parseErrors = [...decomposeRecovery.parseErrors];

  if (!hasResourcePlan || !hasTokenBudget) {
    composed = injectStrategistResourceBudgetSections(
      composed,
      hints.resourcePlan ?? DEFAULT_STRATEGIST_RESOURCE_PLAN,
      hints.tokenBudget ?? DEFAULT_STRATEGIST_TOKEN_BUDGET,
    );
    ({ hasResourcePlan, hasTokenBudget } = resourceBudgetSectionPresence(composed));
    if (!resourceBudgetSectionPresence(decomposeRecovery.composedDecompose).hasResourcePlan) {
      parseErrors.push("resource_plan_injected");
    }
    if (!resourceBudgetSectionPresence(decomposeRecovery.composedDecompose).hasTokenBudget) {
      parseErrors.push("token_budget_injected");
    }
  }

  const reparsed = parseDecomposeResponse(composed);
  const resourceBudgetCompliant =
    hasResourcePlan &&
    hasTokenBudget &&
    boundary.acceptable &&
    reparsed.ok === true &&
    reparsed.data.blocks.length >= 1 &&
    (reparsed.data.resourcePlan !== undefined || reparsed.data.tokenBudget !== undefined);

  return {
    recovered: decomposeRecovery.recovered,
    resourceBudgetCompliant,
    composedDecompose: resourceBudgetCompliant ? composed : "",
    blocks: reparsed.ok ? reparsed.data.blocks : decomposeRecovery.blocks,
    blockCount: reparsed.ok ? reparsed.data.blocks.length : decomposeRecovery.blockCount,
    hasResourcePlan,
    hasTokenBudget,
    resourcePlan: reparsed.ok ? reparsed.data.resourcePlan : undefined,
    tokenBudget: reparsed.ok ? reparsed.data.tokenBudget : undefined,
    parseErrors,
    detail: resourceBudgetCompliant
      ? `resource-budget compliant decompose with ${reparsed.ok ? reparsed.data.blocks.length : 0} blocks`
      : `recovery incomplete: ${parseErrors.join(", ") || decomposeRecovery.detail}`,
  };
}

export interface StrategistResourceBudgetValidationOutcome {
  valid: boolean;
  hasResourcePlan: boolean;
  hasTokenBudget: boolean;
  blockCount: number;
  issues: string[];
}

/**
 * Validate strategist decompose output declares resource plan and token budget (P03-B06-A03).
 */
export function validateStrategistResourceBudget(
  decomposeOutput: string,
): StrategistResourceBudgetValidationOutcome {
  const boundary = assessStrategistResourceBudgetInputBoundary(decomposeOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      hasResourcePlan: false,
      hasTokenBudget: false,
      blockCount: 0,
      issues: [boundary.detail],
    };
  }

  const parsed = parseDecomposeResponse(boundary.normalizedDecompose);
  if (!parsed.ok) {
    return {
      valid: false,
      hasResourcePlan: false,
      hasTokenBudget: false,
      blockCount: 0,
      issues: parsed.error.missing,
    };
  }

  const { hasResourcePlan, hasTokenBudget } = resourceBudgetSectionPresence(boundary.normalizedDecompose);
  const issues: string[] = [];
  if (!hasResourcePlan) issues.push("missing_resource_plan");
  if (!hasTokenBudget) issues.push("missing_token_budget");
  if (parsed.data.blocks.length === 0) issues.push("missing_blocks");

  return {
    valid: issues.length === 0,
    hasResourcePlan,
    hasTokenBudget,
    blockCount: parsed.data.blocks.length,
    issues,
  };
}

export const STRATEGIST_RESOURCE_BUDGET_CATEGORIES = [
  "budget_versioning",
  "token_budget",
  "cost_budget",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistResourceBudgetCategory =
  (typeof STRATEGIST_RESOURCE_BUDGET_CATEGORIES)[number];

export const STRATEGIST_RESOURCE_BUDGET_A01_MIN_PROBES: Readonly<
  Record<StrategistResourceBudgetCategory, number>
> = {
  budget_versioning: 3,
  token_budget: 3,
  cost_budget: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export interface StrategistResourceBudgetFixtureEntry {
  id: string;
  category: StrategistResourceBudgetCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistResourceBudgetBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    riskReversibilityProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistResourceBudgetFixtureEntry[];
}

export interface StrategistResourceBudgetProbeResult {
  id: string;
  category: StrategistResourceBudgetCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistResourceBudgetProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistResourceBudgetProbeResult[];
  knownGaps: StrategistResourceBudgetProbeResult[];
  byCategory: Record<
    StrategistResourceBudgetCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistResourceBudgetValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistResourceBudgetCategory;
  detail: string;
}

export interface StrategistResourceBudgetValidationResult {
  valid: boolean;
  issues: StrategistResourceBudgetValidationIssue[];
}

export type StrategistResourceBudgetProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistResourceBudgetProbeContract {
  id: string;
  category: StrategistResourceBudgetCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistResourceBudgetProbeDisposition;
  criterion: string;
}

export interface StrategistResourceBudgetCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistResourceBudgetCategoryContract {
  category: StrategistResourceBudgetCategory;
  acceptance: StrategistResourceBudgetCategoryAcceptance;
  probes: readonly StrategistResourceBudgetProbeContract[];
}

export interface StrategistResourceBudgetContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistResourceBudgetCategory, StrategistResourceBudgetCategoryContract>;
  probes: readonly StrategistResourceBudgetProbeContract[];
}

function flattenStrategistResourceBudgetCategoryProbes(
  categories: Record<StrategistResourceBudgetCategory, StrategistResourceBudgetCategoryContract>,
): readonly StrategistResourceBudgetProbeContract[] {
  return STRATEGIST_RESOURCE_BUDGET_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_RESOURCE_BUDGET_CATEGORY_CONTRACTS: Record<
  StrategistResourceBudgetCategory,
  StrategistResourceBudgetCategoryContract
> = {
  budget_versioning: {
    category: "budget_versioning",
    acceptance: {
      invariant:
        "Strategist resource budget baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sbudget.version_tagged",
        category: "budget_versioning",
        description: "Strategist resource budget baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist resource budget baseline declares semver version field",
      },
      {
        id: "sbudget.atom_tagged",
        category: "budget_versioning",
        description: "Strategist resource budget baseline declares P03-B06-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist resource budget baseline declares P03-B06-A01 atom id",
      },
      {
        id: "sbudget.harness_version_exported",
        category: "budget_versioning",
        description: "FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION exported for resource budget harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION exported for resource budget harness",
      },
    ],
  },
  token_budget: {
    category: "token_budget",
    acceptance: {
      invariant:
        "Token budget infrastructure enforces rate limiter scopes and orchestrator session/phase caps.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "sbudget.rate_limiter_token_budget",
        category: "token_budget",
        description: "RateLimiter enforces perThought, perChain and perSession TokenBudget scopes",
        expected: "PASS",
        disposition: "observed",
        criterion: "RateLimiter enforces perThought, perChain and perSession TokenBudget scopes",
      },
      {
        id: "sbudget.orchestrator_session_budget_gate",
        category: "token_budget",
        description: "Orchestrator MAX_TOKENS_SESSION halts pipeline when session token budget exceeded",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator MAX_TOKENS_SESSION halts pipeline when session token budget exceeded",
      },
      {
        id: "sbudget.orchestrator_phase_budget_caps",
        category: "token_budget",
        description: "Orchestrator PHASE_BUDGET_PCT enforces phase-level token budget caps",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator PHASE_BUDGET_PCT enforces phase-level token budget caps",
      },
      {
        id: "sbudget.prompt_decompose_resource_plan",
        category: "token_budget",
        description: "STRATEGIST decompose format declares RESOURCE PLAN and TOKEN BUDGET sections",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST decompose format declares RESOURCE PLAN and TOKEN BUDGET sections",
      },
      {
        id: "sbudget.orchestrator_pre_exec_budget_gate",
        category: "token_budget",
        description: "Orchestrator validates strategist resource budget plan before atom execution",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator validates strategist resource budget plan before atom execution",
      },
    ],
  },
  cost_budget: {
    category: "cost_budget",
    acceptance: {
      invariant:
        "Cost budget infrastructure tracks phase costs and declares strategist resource estimate fields.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "sbudget.cost_tracker_exported",
        category: "cost_budget",
        description: "CostTracker exported with phase-level cost breakdown and budget alerts",
        expected: "PASS",
        disposition: "observed",
        criterion: "CostTracker exported with phase-level cost breakdown and budget alerts",
      },
      {
        id: "sbudget.engine_cost_tracker_wired",
        category: "cost_budget",
        description: "Engine wires CostTracker to LLM call token accounting",
        expected: "PASS",
        disposition: "observed",
        criterion: "Engine wires CostTracker to LLM call token accounting",
      },
      {
        id: "sbudget.parser_resource_plan_fields",
        category: "cost_budget",
        description: "parseDecomposeResponse exports resource plan and token budget fields",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse exports resource plan and token budget fields",
      },
      {
        id: "sbudget.prompt_atom_resource_estimate",
        category: "cost_budget",
        description: "STRATEGIST atomize format declares resource_estimate per atom",
        expected: "FAIL",
        disposition: "gap",
        criterion: "STRATEGIST atomize format declares resource_estimate per atom",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Resource budget baseline links to sealed P03-B05 risk reversibility block gate handoff artifacts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sbudget.b05_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B05_TO_B06_HANDOFF_V1 targets P03-B06-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B05_TO_B06_HANDOFF_V1 targets P03-B06-A01 entry atom",
      },
      {
        id: "sbudget.b05_sealed_risk_reversibility_probes",
        category: "baseline_link",
        description: "P03-B05→B06 handoff sealed probeCount matches active risk reversibility contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B05→B06 handoff sealed probeCount matches active risk reversibility contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Resource budget baseline documents source block gate references and decompose input boundaries.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sbudget.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B05 risk reversibility block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B05 risk reversibility block gate source artifacts",
      },
      {
        id: "sbudget.probe_runner_exported",
        category: "boundary",
        description: "runStrategistResourceBudgetProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistResourceBudgetProbes executes contract-wired probe matrix",
      },
      {
        id: "sbudget.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL resource budget gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL resource budget gap",
      },
      {
        id: "sbudget.empty_decompose_boundary",
        category: "boundary",
        description: "assessStrategistResourceBudgetInputBoundary rejects empty decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistResourceBudgetInputBoundary rejects empty decompose output",
      },
      {
        id: "sbudget.whitespace_decompose_boundary",
        category: "boundary",
        description: "assessStrategistResourceBudgetInputBoundary rejects whitespace-only decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistResourceBudgetInputBoundary rejects whitespace-only decompose output",
      },
      {
        id: "sbudget.long_decompose_truncation_boundary",
        category: "boundary",
        description: "assessStrategistResourceBudgetInputBoundary truncates decompose exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistResourceBudgetInputBoundary truncates decompose exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "Resource budget baseline validation rejects invalid versions and enforces minimum category probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sbudget.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistResourceBudgetBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistResourceBudgetBaseline rejects unexpected fixture version",
      },
      {
        id: "sbudget.malformed_decompose_guard",
        category: "failure_path",
        description: "assessStrategistResourceBudgetInputBoundary rejects null-byte decompose output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessStrategistResourceBudgetInputBoundary rejects null-byte decompose output safely",
      },
      {
        id: "sbudget.min_category_probes",
        category: "failure_path",
        description: "validateStrategistResourceBudgetBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistResourceBudgetBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Resource budget recovery paths include rate limit backoff and cost alert thresholds.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sbudget.recovery_rate_limit_backoff",
        category: "recovery_path",
        description: "RateLimiter exponential backoff on 429 enables budget recovery after burst",
        expected: "PASS",
        disposition: "recovery",
        criterion: "RateLimiter exponential backoff on 429 enables budget recovery after burst",
      },
      {
        id: "sbudget.recovery_cost_alert",
        category: "recovery_path",
        description: "CostTracker fires budget alert threshold before session cost limit",
        expected: "PASS",
        disposition: "recovery",
        criterion: "CostTracker fires budget alert threshold before session cost limit",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO paths halt execution when resource budget is exhausted without strategist recovery plan.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "sbudget.nogo_budget_recovery_halt",
        category: "nogo_path",
        description: "Pipeline halts atom when resource budget exhausted without strategist recovery plan",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "Pipeline halts atom when resource budget exhausted without strategist recovery plan",
      },
      {
        id: "sbudget.exported_orchestrator_budget_validator",
        category: "nogo_path",
        description: "validateStrategistResourceBudget exported for orchestrator pre-execution checks",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "validateStrategistResourceBudget exported for orchestrator pre-execution checks",
      },
    ],
  },
};

export const FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1: StrategistResourceBudgetContract = {
  version: "1.0.0",
  atom: "P03-B06-A06",
  purpose:
    "Typed strategist resource and budget contract aligned to baseline probe matrix and sealed P03-B05 block gate.",
  categories: STRATEGIST_RESOURCE_BUDGET_CATEGORY_CONTRACTS,
  probes: flattenStrategistResourceBudgetCategoryProbes(STRATEGIST_RESOURCE_BUDGET_CATEGORY_CONTRACTS),
};

export function getActiveStrategistResourceBudgetContract(): StrategistResourceBudgetContract {
  return FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1;
}

export function summarizeStrategistResourceBudgetCoverage(
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistResourceBudgetCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistResourceBudgetProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistResourceBudgetCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistResourceBudgetProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    totalProbes += categoryContract.probes.length;
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.expected === "PASS") {
        expectedPass++;
      } else {
        expectedFail++;
      }
      byDisposition[probeEntry.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateStrategistResourceBudgetAgainstContract(
  fixture: StrategistResourceBudgetBaseline,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetValidationResult {
  const issues: StrategistResourceBudgetValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryProbes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
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
    issues.push({
      kind: "missing_category",
      detail: "fixture must document known FAIL gaps matching contract",
    });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export interface StrategistResourceBudgetCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistResourceBudgetCategory;
  detail: string;
}

export interface StrategistResourceBudgetCoverageResult {
  valid: boolean;
  issues: StrategistResourceBudgetCoverageIssue[];
}

export function getStrategistResourceBudgetCategoryContract(
  category: StrategistResourceBudgetCategory,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetCategoryContract {
  return contract.categories[category];
}

export function listStrategistResourceBudgetContractProbeIds(
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistResourceBudgetProbesByDisposition(
  disposition: StrategistResourceBudgetProbeDisposition,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistResourceBudgetContractProbesByCategory(
  category: StrategistResourceBudgetCategory,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetProbeContract[] {
  return contract.categories[category].probes;
}

export function validateStrategistResourceBudgetCoverage(
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetCoverageResult {
  const issues: StrategistResourceBudgetCoverageIssue[] = [];

  for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_RESOURCE_BUDGET_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_RESOURCE_BUDGET_A01_MIN_PROBES[category]}`,
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
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probeEntry.id,
          detail: `${probeEntry.id} criterion too short`,
        });
      }
    }
  }

  const ids = listStrategistResourceBudgetContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistResourceBudgetCoverage(contract);
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

  for (const probeEntry of contract.probes) {
    if (!probeEntry.id.startsWith("sbudget.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing sbudget. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const FORGE_STRATEGIST_RESOURCE_BUDGET_A01_PROBE_MATRIX: readonly StrategistResourceBudgetFixtureEntry[] =
  strategistResourceBudgetBaseline.probes as StrategistResourceBudgetFixtureEntry[];

export function loadStrategistResourceBudgetBaseline(): StrategistResourceBudgetBaseline {
  return strategistResourceBudgetBaseline as StrategistResourceBudgetBaseline;
}

export function validateStrategistResourceBudgetBaseline(
  fixture: StrategistResourceBudgetBaseline,
): StrategistResourceBudgetValidationResult {
  const issues: StrategistResourceBudgetValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B06-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_RESOURCE_BUDGET_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistResourceBudgetCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
    const min = STRATEGIST_RESOURCE_BUDGET_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_RESOURCE_BUDGET_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_RESOURCE_BUDGET_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_RESOURCE_BUDGET_A01_PROBE_MATRIX) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `category mismatch for ${expected.id}`,
      });
    }
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `expected mismatch for ${expected.id}`,
      });
    }
  }

  const handoff = getForgeP03B05ToB06Handoff();
  const riskCoverage = summarizeStrategistRiskReversibilityCoverage(
    getActiveStrategistRiskReversibilityContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P03-B05-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B05-A10`,
    });
  }
  if (fixture.sourceBlockGate.contractVersion !== FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION}`,
    });
  }
  if (fixture.sourceBlockGate.riskReversibilityProbeCount !== riskCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.riskReversibilityProbeCount=${fixture.sourceBlockGate.riskReversibilityProbeCount} ` +
        `contract=${riskCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B05_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B05_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B05_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B05 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B05_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B06-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B05 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B06-A01`,
    });
  }

  const contractAlignment = validateStrategistResourceBudgetAgainstContract(
    fixture,
    getActiveStrategistResourceBudgetContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistResourceBudgetMatrix(
  results: StrategistResourceBudgetProbeResult[],
): StrategistResourceBudgetProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistResourceBudgetProbeSummary["byCategory"];
  for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
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

export function listStrategistResourceBudgetProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistResourceBudgetKnownGaps(
  results: StrategistResourceBudgetProbeResult[],
): StrategistResourceBudgetProbeResult[] {
  return summarizeStrategistResourceBudgetMatrix(results).knownGaps;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistResourceBudgetProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function productionResourceBudgetSource(): string {
  return readSrc("forge-p03-strategist-resource-budget.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionResourceBudgetSource());
}

const SAMPLE_DECOMPOSE_OUTPUT = `REASONING: Resource-aware decomposition
OUTPUT:
Block 1: Setup resource budget baseline types
Block 2: Wire token budget seam
Block 3: Add resource budget tests
DEPENDENCIES: 2→1, 3→1,2
RESOURCE PLAN: Block 1 lightweight setup; Block 2 moderate wiring; Block 3 integration tests
TOKEN BUDGET: perThought=4096, perChain=50000, session cap per orchestrator MAX_TOKENS_SESSION
CONFIDENCE: 0.85`;

function decomposeFormatSection(): string {
  const prompts = promptsSource();
  const decomposeStart = prompts.indexOf("## Output Format — DECOMPOSE");
  const atomizeStart = prompts.indexOf("## Output Format — ATOMIZE");
  if (decomposeStart === -1 || atomizeStart === -1 || atomizeStart <= decomposeStart) {
    return prompts;
  }
  return prompts.slice(decomposeStart, atomizeStart);
}

function atomizeFormatSection(): string {
  const prompts = promptsSource();
  const atomizeStart = prompts.indexOf("## Output Format — ATOMIZE");
  const checklistStart = prompts.indexOf("## Atomize Quality Checklist");
  if (atomizeStart === -1) {
    return prompts;
  }
  const end = checklistStart === -1 ? prompts.length : checklistStart;
  return prompts.slice(atomizeStart, end);
}

function probeBudgetVersioning(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistResourceBudgetBaseline,
): StrategistResourceBudgetProbeResult {
  switch (id) {
    case "sbudget.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sbudget.atom_tagged": {
      const ok = fixture.atom === "P03-B06-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sbudget.harness_version_exported": {
      const ok = FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown budget_versioning probe");
  }
}

function probeTokenBudget(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistResourceBudgetProbeResult {
  const rateLimiter = readSrc("rate-limiter.ts");
  const orchestrator = orchestratorSource();
  const decomposeFormat = decomposeFormatSection();

  switch (id) {
    case "sbudget.rate_limiter_token_budget": {
      const ok =
        rateLimiter.includes("BudgetExceededError") &&
        rateLimiter.includes("perThought") &&
        rateLimiter.includes("perChain") &&
        rateLimiter.includes("perSession") &&
        rateLimiter.includes("recordTokens(");
      return probe(id, category, expected, ok, `rateLimiterBudget=${ok}`);
    }
    case "sbudget.orchestrator_session_budget_gate": {
      const ok =
        orchestrator.includes("MAX_TOKENS_SESSION") &&
        orchestrator.includes("Session budget exceeded");
      return probe(id, category, expected, ok, `sessionBudgetGate=${ok}`);
    }
    case "sbudget.orchestrator_phase_budget_caps": {
      const ok =
        orchestrator.includes("PHASE_BUDGET_PCT") &&
        orchestrator.includes("exceeded token budget");
      return probe(id, category, expected, ok, `phaseBudgetCaps=${ok}`);
    }
    case "sbudget.prompt_decompose_resource_plan": {
      const hasResourcePlan = /RESOURCE PLAN:/i.test(decomposeFormat);
      const hasTokenBudget = /TOKEN BUDGET:/i.test(decomposeFormat);
      const ok = hasResourcePlan && hasTokenBudget;
      return probe(
        id,
        category,
        expected,
        ok,
        `resourcePlan=${hasResourcePlan}, tokenBudget=${hasTokenBudget}`,
      );
    }
    case "sbudget.orchestrator_pre_exec_budget_gate": {
      const ok =
        orchestrator.includes("validateStrategistResourceBudget(") ||
        (orchestrator.includes("resource budget") && orchestrator.includes("before atom"));
      return probe(id, category, expected, ok, `preExecBudgetGate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown token_budget probe");
  }
}

function probeCostBudget(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistResourceBudgetProbeResult {
  const costTracker = readSrc("cost-tracker.ts");
  const engine = readSrc("engine.ts");
  const atomizeFormat = atomizeFormatSection();

  switch (id) {
    case "sbudget.cost_tracker_exported": {
      const ok =
        costTracker.includes("export class CostTracker") &&
        costTracker.includes("byPhase") &&
        costTracker.includes("alertThreshold");
      return probe(id, category, expected, ok, `costTracker=${ok}`);
    }
    case "sbudget.engine_cost_tracker_wired": {
      const ok =
        engine.includes("CostTracker") &&
        engine.includes("this.costTracker") &&
        engine.includes("this.costTracker.record(");
      return probe(id, category, expected, ok, `engineCostTracker=${ok}`);
    }
    case "sbudget.parser_resource_plan_fields": {
      const parsed = parseDecomposeResponse(SAMPLE_DECOMPOSE_OUTPUT);
      const data = parsed.ok ? parsed.data : null;
      const ok =
        parsed.ok === true &&
        data !== null &&
        data.resourcePlan !== undefined &&
        data.tokenBudget !== undefined;
      return probe(id, category, expected, ok, `resourcePlanFields=${ok}`);
    }
    case "sbudget.prompt_atom_resource_estimate": {
      const ok = /resource_estimate/i.test(atomizeFormat);
      return probe(id, category, expected, ok, `atomResourceEstimate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown cost_budget probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistResourceBudgetProbeResult {
  switch (id) {
    case "sbudget.b05_block_handoff_entry": {
      const handoff = getForgeP03B05ToB06Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B06" &&
        handoff.targetBlock.entryAtom === "P03-B06-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "sbudget.b05_sealed_risk_reversibility_probes": {
      const handoff = getForgeP03B05ToB06Handoff();
      const coverage = summarizeStrategistRiskReversibilityCoverage(
        getActiveStrategistRiskReversibilityContract(),
      );
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract=${coverage.totalProbes}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistResourceBudgetBaseline,
): StrategistResourceBudgetProbeResult {
  switch (id) {
    case "sbudget.source_block_gate_ref": {
      const handoff = getForgeP03B05ToB06Handoff();
      const coverage = summarizeStrategistRiskReversibilityCoverage(
        getActiveStrategistRiskReversibilityContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P03-B05-A10" &&
        fixture.sourceBlockGate.contractVersion === FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION &&
        fixture.sourceBlockGate.riskReversibilityProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B05_SEALED_ATOM_COUNT &&
        handoff.atom === "P03-B05-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.riskReversibilityProbeCount}`,
      );
    }
    case "sbudget.probe_runner_exported": {
      const ok = productionResourceBudgetSource().includes(
        "export function runStrategistResourceBudgetProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sbudget.known_gaps_documented": {
      const contract = getActiveStrategistResourceBudgetContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "sbudget.empty_decompose_boundary": {
      const result = assessStrategistResourceBudgetInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistResourceBudgetInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "sbudget.whitespace_decompose_boundary": {
      const result = assessStrategistResourceBudgetInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistResourceBudgetInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "sbudget.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistResourceBudgetInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistResourceBudgetInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, truncated=${result.truncated}, len=${result.normalizedDecompose.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistResourceBudgetBaseline,
): StrategistResourceBudgetProbeResult {
  switch (id) {
    case "sbudget.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistResourceBudgetBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "sbudget.malformed_decompose_guard": {
      const boundary = assessStrategistResourceBudgetInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistResourceBudgetInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    case "sbudget.min_category_probes": {
      const underflow = { ...fixture, probes: fixture.probes.filter(p => p.category !== "nogo_path") };
      const ok = validateStrategistResourceBudgetBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistResourceBudgetProbeResult {
  const rateLimiter = readSrc("rate-limiter.ts");
  const costTracker = readSrc("cost-tracker.ts");

  switch (id) {
    case "sbudget.recovery_rate_limit_backoff": {
      const ok =
        rateLimiter.includes("backoffStrategy") &&
        rateLimiter.includes("exponential") &&
        rateLimiter.includes("429");
      return probe(id, category, expected, ok, `rateLimitBackoff=${ok}`);
    }
    case "sbudget.recovery_cost_alert": {
      const ok =
        costTracker.includes("alertThreshold") &&
        costTracker.includes("approaching budget") &&
        costTracker.includes("onAlert(");
      return probe(id, category, expected, ok, `costAlert=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistResourceBudgetProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sbudget.nogo_budget_recovery_halt": {
      const checksBudgetExhaustion =
        orchestrator.includes("budget_exceeded") ||
        orchestrator.includes("Session budget exceeded");
      const requiresRecoveryPlan =
        orchestrator.includes("resource recovery plan") ||
        orchestrator.includes("strategist budget recovery");
      const ok = checksBudgetExhaustion && requiresRecoveryPlan;
      return probe(id, category, expected, ok, `budgetRecoveryHalt=${ok}`);
    }
    case "sbudget.exported_orchestrator_budget_validator": {
      const ok =
        hasProductionExport("validateStrategistResourceBudget") &&
        orchestrator.includes("validateStrategistResourceBudget(");
      return probe(id, category, expected, ok, `budgetValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistResourceBudgetBaseline,
): StrategistResourceBudgetProbeResult {
  switch (category) {
    case "budget_versioning":
      return probeBudgetVersioning(id, category, expected, fixture);
    case "token_budget":
      return probeTokenBudget(id, category, expected);
    case "cost_budget":
      return probeCostBudget(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, "unknown category");
  }
}

export function runStrategistResourceBudgetProbes(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetProbeResult[] {
  const contract = getActiveStrategistResourceBudgetContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export interface StrategistResourceBudgetProbeMatrixValidationIssue {
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

export interface StrategistResourceBudgetProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistResourceBudgetProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistResourceBudgetProbeMatrix(
  results: StrategistResourceBudgetProbeResult[],
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetProbeMatrixValidationResult {
  const issues: StrategistResourceBudgetProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(result => [result.id, result]));
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

export interface StrategistResourceBudgetProductionSliceResult {
  atom: "P03-B06-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistResourceBudgetProbeResult[];
  summary: StrategistResourceBudgetProbeSummary;
  matrixValidation: StrategistResourceBudgetProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverStrategistResourceBudget wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistResourceBudgetProductionSlice(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetProductionSliceResult {
  const contract = getActiveStrategistResourceBudgetContract();
  const fixtureValidation = validateStrategistResourceBudgetBaseline(fixture);
  const contractValidation = validateStrategistResourceBudgetAgainstContract(fixture, contract);
  const results = runStrategistResourceBudgetProbes(fixture);
  const summary = summarizeStrategistResourceBudgetMatrix(results);
  const matrixValidation = validateStrategistResourceBudgetProbeMatrix(results, contract);

  return {
    atom: "P03-B06-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistResourceBudgetBoundarySliceResult {
  atom: "P03-B06-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistResourceBudgetProbeResult[];
  boundaryResults: StrategistResourceBudgetProbeResult[];
  matrixValidation: StrategistResourceBudgetProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateStrategistResourceBudgetBoundaryProbeMatrix(
  results: StrategistResourceBudgetProbeResult[],
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetProbeMatrixValidationResult {
  const boundaryProbes = listStrategistResourceBudgetContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistResourceBudgetContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistResourceBudgetProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (decompose input edge cases, probe runner,
 * documented gaps, source block gate refs) with zero unexpected mismatches.
 */
export function runStrategistResourceBudgetBoundarySlice(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetBoundarySliceResult {
  const contract = getActiveStrategistResourceBudgetContract();
  const results = runStrategistResourceBudgetProbes(fixture);
  const boundaryProbes = listStrategistResourceBudgetContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistResourceBudgetBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B06-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly StrategistResourceBudgetCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery probes and documented FAIL NO-GO gaps must align; zero unexpected mismatches.
 */
export function validateStrategistResourceBudgetFailureRecoveryProbeMatrix(
  results: StrategistResourceBudgetProbeResult[],
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetProbeMatrixValidationResult {
  const failureRecoveryProbes = STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistResourceBudgetContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: StrategistResourceBudgetContract = {
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
  return validateStrategistResourceBudgetProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listStrategistResourceBudgetFailureRecoveryProbeIds(
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): string[] {
  return STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listStrategistResourceBudgetContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface StrategistResourceBudgetFailureRecoverySliceResult {
  atom: "P03-B06-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: StrategistResourceBudgetProbeResult[];
  failureRecoveryResults: StrategistResourceBudgetProbeResult[];
  matrixValidation: StrategistResourceBudgetProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runStrategistResourceBudgetFailureRecoverySlice(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetFailureRecoverySliceResult {
  const contract = getActiveStrategistResourceBudgetContract();
  const results = runStrategistResourceBudgetProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistResourceBudgetContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistResourceBudgetFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P03-B06-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

// ─── Evidence, telemetry and provenance (P03-B06-A06) ────────────────────────

export interface StrategistResourceBudgetProbeEvidence {
  probeId: string;
  category: StrategistResourceBudgetCategory;
  disposition: StrategistResourceBudgetProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

export interface StrategistResourceBudgetProbeTelemetry {
  probeId: string;
  category: StrategistResourceBudgetCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P03-B06-A06). */
export interface StrategistResourceBudgetProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly StrategistResourceBudgetCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated resource budget run record bundling evidence, telemetry and provenance. */
export interface StrategistResourceBudgetRunRecord {
  provenance: StrategistResourceBudgetProvenance;
  evidence: StrategistResourceBudgetProbeEvidence[];
  telemetry: StrategistResourceBudgetProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<StrategistResourceBudgetCategory, number>;
    byDisposition: Record<StrategistResourceBudgetProbeDisposition, number>;
  };
}

export interface StrategistResourceBudgetRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistResourceBudgetRunValidationResult {
  valid: boolean;
  issues: StrategistResourceBudgetRunValidationIssue[];
}

export function buildStrategistResourceBudgetProbeEvidence(
  probeId: string,
  category: StrategistResourceBudgetCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: StrategistResourceBudgetProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): StrategistResourceBudgetProbeEvidence {
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

export function buildStrategistResourceBudgetProbeTelemetry(
  probeId: string,
  category: StrategistResourceBudgetCategory,
  sequenceIndex: number,
  durationMs: number,
): StrategistResourceBudgetProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildStrategistResourceBudgetProvenance(
  runId: string,
  fixture: StrategistResourceBudgetBaseline,
  contract: StrategistResourceBudgetContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly StrategistResourceBudgetCategory[];
  },
): StrategistResourceBudgetProvenance {
  return {
    runId,
    harnessVersion: FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION,
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

export function buildStrategistResourceBudgetRunRecord(
  provenance: StrategistResourceBudgetProvenance,
  evidence: StrategistResourceBudgetProbeEvidence[],
  telemetry: StrategistResourceBudgetProbeTelemetry[],
): StrategistResourceBudgetRunRecord {
  const byCategory = {} as Record<StrategistResourceBudgetCategory, number>;
  const byDisposition: Record<StrategistResourceBudgetProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
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

function validateStrategistResourceBudgetRunRecordAgainstProbeIds(
  record: StrategistResourceBudgetRunRecord,
  expectedProbeIds: string[],
  contract: StrategistResourceBudgetContract,
): StrategistResourceBudgetRunValidationResult {
  const issues: StrategistResourceBudgetRunValidationIssue[] = [];
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

export function validateStrategistResourceBudgetRunRecord(
  record: StrategistResourceBudgetRunRecord,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetRunValidationResult {
  return validateStrategistResourceBudgetRunRecordAgainstProbeIds(
    record,
    listStrategistResourceBudgetContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateStrategistResourceBudgetFailureRecoveryRunRecord(
  record: StrategistResourceBudgetRunRecord,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetRunValidationResult {
  const issues: StrategistResourceBudgetRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P03-B06-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P03-B06-A06`,
    });
  }

  const expectedCategories = [...STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateStrategistResourceBudgetRunRecordAgainstProbeIds(
    record,
    listStrategistResourceBudgetFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface StrategistResourceBudgetEvidenceSliceResult {
  atom: "P03-B06-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: StrategistResourceBudgetProbeResult[];
  evidenceResults: StrategistResourceBudgetProbeResult[];
  matrixValidation: StrategistResourceBudgetProbeMatrixValidationResult;
  record: StrategistResourceBudgetRunRecord;
  recordValidation: StrategistResourceBudgetRunValidationResult;
}

function resolveStrategistResourceBudgetGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runStrategistResourceBudgetProbeWithTiming(
  entry: StrategistResourceBudgetFixtureEntry,
  fixture: StrategistResourceBudgetBaseline,
  contractProbe:
    | { criterion: string; disposition: StrategistResourceBudgetProbeDisposition }
    | undefined,
): {
  result: StrategistResourceBudgetProbeResult;
  durationMs: number;
  disposition: StrategistResourceBudgetProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
  const enriched = contractProbe?.criterion
    ? { ...result, criterion: contractProbe.criterion }
    : result;
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildStrategistResourceBudgetRecordFromEntries(
  entries: StrategistResourceBudgetFixtureEntry[],
  fixture: StrategistResourceBudgetBaseline,
  contract: StrategistResourceBudgetContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly StrategistResourceBudgetCategory[];
  },
): StrategistResourceBudgetRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: StrategistResourceBudgetProbeEvidence[] = [];
  const telemetry: StrategistResourceBudgetProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runStrategistResourceBudgetProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildStrategistResourceBudgetProbeEvidence(
        result.id,
        result.category,
        result.expected,
        result.actual,
        result.aligned,
        criterion,
        result.detail,
        disposition,
      ),
    );
    telemetry.push(
      buildStrategistResourceBudgetProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildStrategistResourceBudgetProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveStrategistResourceBudgetGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildStrategistResourceBudgetRunRecord(provenance, evidence, telemetry);
}

/** Run all resource budget probes and emit auditable evidence, telemetry and provenance (P03-B06-A06). */
export function runStrategistResourceBudgetProbesWithRecord(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetRunRecord {
  const contract = getActiveStrategistResourceBudgetContract();
  return buildStrategistResourceBudgetRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P03-B06-A06). */
export function runStrategistResourceBudgetFailureRecoverySliceWithRecord(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetRunRecord {
  const contract = getActiveStrategistResourceBudgetContract();
  const failureRecoveryIds = new Set(listStrategistResourceBudgetFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildStrategistResourceBudgetRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P03-B06-A06",
    sliceCategories: STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runStrategistResourceBudgetEvidenceSlice(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetEvidenceSliceResult {
  const contract = getActiveStrategistResourceBudgetContract();
  const results = runStrategistResourceBudgetProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistResourceBudgetContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistResourceBudgetFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runStrategistResourceBudgetFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateStrategistResourceBudgetFailureRecoveryRunRecord(
    record,
    contract,
  );

  return {
    atom: "P03-B06-A06",
    evidenceProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    recordValid: recordValidation.valid && record.summary.mismatches === 0,
    results,
    evidenceResults,
    matrixValidation,
    record,
    recordValidation,
  };
}

// ─── Property and fuzz validation (P03-B06-A07) ──────────────────────────────

export interface StrategistResourceBudgetPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface StrategistResourceBudgetPropertyResult {
  passed: number;
  failed: StrategistResourceBudgetPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type StrategistResourceBudgetPropertyCheck = {
  id: string;
  description: string;
  check: (contract: StrategistResourceBudgetContract) => string | null;
};

const STRATEGIST_RESOURCE_BUDGET_STRUCTURAL_PROPERTIES: readonly StrategistResourceBudgetPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight strategist resource budget categories are declared",
    check: contract => {
      for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listStrategistResourceBudgetContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
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
      "summarizeStrategistResourceBudgetCoverage totals match listStrategistResourceBudgetContractProbeIds",
    check: contract => {
      const summary = summarizeStrategistResourceBudgetCoverage(contract);
      const ids = listStrategistResourceBudgetContractProbeIds(contract);
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
    description: "Probe ids are namespaced with sbudget. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("sbudget.")) {
          return `${probe.id} missing sbudget. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const fixture = loadStrategistResourceBudgetBaseline();
      const probeIds = listStrategistResourceBudgetContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistResourceBudgetProbeEvidence(
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
        return buildStrategistResourceBudgetProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildStrategistResourceBudgetRunRecord(
        buildStrategistResourceBudgetProvenance(
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
      "Synthetic failure/recovery slice record passes validateStrategistResourceBudgetFailureRecoveryRunRecord",
    check: contract => {
      const fixture = loadStrategistResourceBudgetBaseline();
      const probeIds = listStrategistResourceBudgetFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistResourceBudgetProbeEvidence(
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
        return buildStrategistResourceBudgetProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildStrategistResourceBudgetRunRecord(
        buildStrategistResourceBudgetProvenance(
          "property-check-failure-recovery",
          fixture,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P03-B06-A06",
            sliceCategories: STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateStrategistResourceBudgetFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runStrategistResourceBudgetPropertyChecks(
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): StrategistResourceBudgetPropertyResult {
  const failed: StrategistResourceBudgetPropertyViolation[] = [];
  for (const property of STRATEGIST_RESOURCE_BUDGET_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = STRATEGIST_RESOURCE_BUDGET_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type StrategistResourceBudgetFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface StrategistResourceBudgetFuzzMutationCase {
  seed: number;
  kind: StrategistResourceBudgetFuzzMutationKind;
  probeId?: string;
  category?: StrategistResourceBudgetCategory;
}

export interface StrategistResourceBudgetFuzzValidationCaseResult {
  mutation: StrategistResourceBudgetFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface StrategistResourceBudgetFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: StrategistResourceBudgetFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createStrategistResourceBudgetFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneStrategistResourceBudgetBaseline(
  fixture: StrategistResourceBudgetBaseline,
): StrategistResourceBudgetBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickStrategistResourceBudgetFuzzTarget(
  fixture: StrategistResourceBudgetBaseline,
  rng: () => number,
): { category: StrategistResourceBudgetCategory; index: number; entry: StrategistResourceBudgetFixtureEntry } {
  const category =
    STRATEGIST_RESOURCE_BUDGET_CATEGORIES[Math.floor(rng() * STRATEGIST_RESOURCE_BUDGET_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyStrategistResourceBudgetFuzzMutation(
  fixture: StrategistResourceBudgetBaseline,
  mutation: StrategistResourceBudgetFuzzMutationCase,
): StrategistResourceBudgetBaseline {
  const mutated = cloneStrategistResourceBudgetBaseline(fixture);
  const targetCategory = mutation.category ?? STRATEGIST_RESOURCE_BUDGET_CATEGORIES[0]!;
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
          id: `sbudget.fuzz.extra.${mutation.seed}`,
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
      const other = STRATEGIST_RESOURCE_BUDGET_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateStrategistResourceBudgetFuzzMutationCases(
  fixture: StrategistResourceBudgetBaseline,
  seed: number,
  iterations: number,
): StrategistResourceBudgetFuzzMutationCase[] {
  const rng = createStrategistResourceBudgetFuzzRng(seed);
  const kinds: StrategistResourceBudgetFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: StrategistResourceBudgetFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickStrategistResourceBudgetFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P03-B06-A07). */
export function runStrategistResourceBudgetFuzzValidation(
  fixture: StrategistResourceBudgetBaseline,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
  seed = 42,
  iterations = 24,
): StrategistResourceBudgetFuzzValidationResult {
  const cases = generateStrategistResourceBudgetFuzzMutationCases(fixture, seed, iterations);
  const results: StrategistResourceBudgetFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyStrategistResourceBudgetFuzzMutation(fixture, mutation);
    const validation = validateStrategistResourceBudgetAgainstContract(mutated, contract);
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

export type StrategistResourceBudgetRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface StrategistResourceBudgetRunRecordFuzzCase {
  kind: StrategistResourceBudgetRunRecordFuzzKind;
  probeId?: string;
}

export function applyStrategistResourceBudgetRunRecordFuzzMutation(
  record: StrategistResourceBudgetRunRecord,
  mutation: StrategistResourceBudgetRunRecordFuzzCase,
): StrategistResourceBudgetRunRecord {
  const cloned: StrategistResourceBudgetRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P03-B06-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["budget_versioning"],
      };
      break;
  }

  cloned.summary = buildStrategistResourceBudgetRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveStrategistResourceBudgetRunRecordValidator(
  record: StrategistResourceBudgetRunRecord,
): (
  record: StrategistResourceBudgetRunRecord,
  contract: StrategistResourceBudgetContract,
) => StrategistResourceBudgetRunValidationResult {
  return record.provenance.sliceAtom === "P03-B06-A06"
    ? validateStrategistResourceBudgetFailureRecoveryRunRecord
    : validateStrategistResourceBudgetRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P03-B06-A07). */
export function runStrategistResourceBudgetRunRecordFuzzValidation(
  record: StrategistResourceBudgetRunRecord,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveStrategistResourceBudgetRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: StrategistResourceBudgetRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P03-B06-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyStrategistResourceBudgetRunRecordFuzzMutation(record, mutation);
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

export interface StrategistResourceBudgetPropertyFuzzSliceResult {
  atom: "P03-B06-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: StrategistResourceBudgetPropertyResult;
  contractFuzz: StrategistResourceBudgetFuzzValidationResult;
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
export function runStrategistResourceBudgetPropertyFuzzSlice(
  fixture: StrategistResourceBudgetBaseline = loadStrategistResourceBudgetBaseline(),
): StrategistResourceBudgetPropertyFuzzSliceResult {
  const contract = getActiveStrategistResourceBudgetContract();
  const propertyResult = runStrategistResourceBudgetPropertyChecks(contract);
  const contractFuzz = runStrategistResourceBudgetFuzzValidation(fixture, contract);
  const record = runStrategistResourceBudgetFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runStrategistResourceBudgetRunRecordFuzzValidation(record, contract);

  return {
    atom: "P03-B06-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Probe regression detection (P03-B06-A08) ────────────────────────────────

export interface StrategistResourceBudgetProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare resource budget run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectStrategistResourceBudgetProbeRegression(
  prior: StrategistResourceBudgetRunRecord,
  current: StrategistResourceBudgetRunRecord,
): StrategistResourceBudgetProbeRegressionReport {
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

  const hasRegression =
    regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
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

/** Alias matching ACTIVE_FRONT target name. */
export const runStrategistResourceBudgetProbeRegression = detectStrategistResourceBudgetProbeRegression;

export interface StrategistResourceBudgetProbeRegressionValidation {
  valid: boolean;
  report: StrategistResourceBudgetProbeRegressionReport;
}

/** Validate probe alignment between prior and current resource budget run records. */
export function validateStrategistResourceBudgetProbeRegression(
  prior: StrategistResourceBudgetRunRecord,
  current: StrategistResourceBudgetRunRecord,
): StrategistResourceBudgetProbeRegressionValidation {
  const report = detectStrategistResourceBudgetProbeRegression(prior, current);
  return { valid: !report.hasRegression, report };
}

export interface StrategistResourceBudgetForgeRegressionResult {
  atom: "P03-B06-A08";
  passed: boolean;
  productionSlice: StrategistResourceBudgetProductionSliceResult;
  propertyFuzzSlice: StrategistResourceBudgetPropertyFuzzSliceResult;
  record: StrategistResourceBudgetRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: StrategistResourceBudgetProbeRegressionReport | null;
  detail: string;
}

/**
 * Execute resource budget probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P03-B06-A08).
 */
export function runStrategistResourceBudgetForgeRegression(
  priorRecord?: StrategistResourceBudgetRunRecord,
): StrategistResourceBudgetForgeRegressionResult {
  const fixture = loadStrategistResourceBudgetBaseline();
  const contract = getActiveStrategistResourceBudgetContract();
  const productionSlice = runStrategistResourceBudgetProductionSlice(fixture);
  const propertyFuzzSlice = runStrategistResourceBudgetPropertyFuzzSlice(fixture);
  const record = runStrategistResourceBudgetProbesWithRecord(fixture);
  const validation = validateStrategistResourceBudgetRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateStrategistResourceBudgetRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectStrategistResourceBudgetProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;

  const productionSliceOk =
    productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0;
  const propertyFuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;

  const passed =
    productionSliceOk && recordValid && priorRecordValid && !alignmentRegression && propertyFuzzOk;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  detailParts.push(
    `productionSlice: unexpected=${productionSlice.matrixValidation.unexpectedMismatches}`,
  );
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (!priorRecordValid) {
    detailParts.push(
      `priorValidation: ${priorValidationIssues.join("; ") || "tampered prior record"}`,
    );
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  detailParts.push(
    `propertyFuzz: properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}`,
  );

  return {
    atom: "P03-B06-A08",
    passed,
    productionSlice,
    propertyFuzzSlice,
    record,
    recordValid,
    priorRecordValid,
    validationIssues,
    priorValidationIssues,
    probeRegression,
    detail: detailParts.join(" | "),
  };
}

// ─── Guard controls (P03-B06-A09) ─────────────────────────────────────────────

export interface ForgeStrategistResourceBudgetGuardControls {
  atom: string;
  adversarial: {
    rejectTamperedRecords: true;
    rejectFalseAlignment: true;
    rejectSummaryEvidenceMismatch: true;
  };
  performance: {
    maxSuiteDurationMs: number;
    maxProbeDurationMs: number;
    maxWallClockMs: number;
  };
  cost: {
    maxTotalCostUsd: number;
    maxLlmCalls: number;
  };
  safety: {
    maxDetailLength: number;
    forbiddenPatterns: readonly RegExp[];
  };
}

export interface StrategistResourceBudgetGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface StrategistResourceBudgetGuardCheckResult {
  passed: boolean;
  issues: StrategistResourceBudgetGuardCheckIssue[];
  metrics: {
    suiteDurationMs: number;
    wallClockMs: number;
    maxProbeDurationMs: number;
    totalCostUsd: number;
    llmCalls: number;
    adversarialScenariosRejected: number;
    adversarialScenariosTotal: number;
  };
}

export interface StrategistResourceBudgetAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: StrategistResourceBudgetRunRecord) => StrategistResourceBudgetRunRecord;
  expectRejected: true;
}

export const FORGE_STRATEGIST_RESOURCE_BUDGET_GUARD_CONTROLS_V1: ForgeStrategistResourceBudgetGuardControls =
  {
    atom: "P03-B06-A09",
    adversarial: {
      rejectTamperedRecords: true,
      rejectFalseAlignment: true,
      rejectSummaryEvidenceMismatch: true,
    },
    performance: {
      maxSuiteDurationMs: 30_000,
      maxProbeDurationMs: 5_000,
      maxWallClockMs: 45_000,
    },
    cost: {
      maxTotalCostUsd: 0,
      maxLlmCalls: 0,
    },
    safety: {
      maxDetailLength: 4096,
      forbiddenPatterns: [
        /sk-[a-zA-Z0-9]{20,}/,
        /api[_-]?key\s*[:=]\s*\S+/i,
        /Bearer\s+[a-zA-Z0-9._-]{20,}/i,
        /password\s*[:=]\s*\S+/i,
        /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
      ],
    },
  };

export function getForgeStrategistResourceBudgetGuardControls(): ForgeStrategistResourceBudgetGuardControls {
  return FORGE_STRATEGIST_RESOURCE_BUDGET_GUARD_CONTROLS_V1;
}

function parseStrategistResourceBudgetIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeStrategistResourceBudgetTelemetry(
  telemetry: StrategistResourceBudgetProbeTelemetry[],
): {
  suiteDurationMs: number;
  maxProbeDurationMs: number;
} {
  let suiteDurationMs = 0;
  let maxProbeDurationMs = 0;
  for (const item of telemetry) {
    suiteDurationMs += item.durationMs;
    if (item.durationMs > maxProbeDurationMs) maxProbeDurationMs = item.durationMs;
  }
  return { suiteDurationMs, maxProbeDurationMs };
}

export function detectStrategistResourceBudgetEvidenceSummaryMismatch(
  record: StrategistResourceBudgetRunRecord,
): string | null {
  let alignedCount = 0;
  for (const item of record.evidence) {
    if (item.aligned) alignedCount++;
  }
  const mismatches = record.evidence.length - alignedCount;
  if (record.summary.aligned !== alignedCount) {
    return `summary.aligned=${record.summary.aligned} evidence=${alignedCount}`;
  }
  if (record.summary.mismatches !== mismatches) {
    return `summary.mismatches=${record.summary.mismatches} evidence=${mismatches}`;
  }
  if (record.summary.total !== record.evidence.length) {
    return `summary.total=${record.summary.total} evidence=${record.evidence.length}`;
  }
  return null;
}

export function detectStrategistResourceBudgetFalseAlignment(
  record: StrategistResourceBudgetRunRecord,
): string[] {
  const violations: string[] = [];
  for (const item of record.evidence) {
    const shouldAlign = item.actual === item.expected;
    if (item.aligned !== shouldAlign) {
      violations.push(
        `${item.probeId}: aligned=${item.aligned} actual=${item.actual} expected=${item.expected}`,
      );
    }
    if (item.aligned && item.actual !== item.expected) {
      violations.push(`${item.probeId}: false PASS claim`);
    }
  }
  return violations;
}

export function validateStrategistResourceBudgetSafety(
  record: StrategistResourceBudgetRunRecord,
  controls: ForgeStrategistResourceBudgetGuardControls = getForgeStrategistResourceBudgetGuardControls(),
): StrategistResourceBudgetGuardCheckIssue[] {
  const issues: StrategistResourceBudgetGuardCheckIssue[] = [];
  for (const item of record.evidence) {
    if (item.detail.length > controls.safety.maxDetailLength) {
      issues.push({
        domain: "safety",
        code: "detail_too_long",
        detail: `${item.probeId} detail length=${item.detail.length}`,
      });
    }
    for (const pattern of controls.safety.forbiddenPatterns) {
      if (pattern.test(item.detail) || pattern.test(item.criterion)) {
        issues.push({
          domain: "safety",
          code: "forbidden_pattern",
          detail: `${item.probeId} matched ${pattern.source}`,
        });
      }
    }
  }
  return issues;
}

export function validateStrategistResourceBudgetPerformance(
  record: StrategistResourceBudgetRunRecord,
  controls: ForgeStrategistResourceBudgetGuardControls = getForgeStrategistResourceBudgetGuardControls(),
): StrategistResourceBudgetGuardCheckIssue[] {
  const issues: StrategistResourceBudgetGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeStrategistResourceBudgetTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseStrategistResourceBudgetIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  if (suiteDurationMs > controls.performance.maxSuiteDurationMs) {
    issues.push({
      domain: "performance",
      code: "suite_duration_exceeded",
      detail: `${suiteDurationMs}ms > ${controls.performance.maxSuiteDurationMs}ms`,
    });
  }
  if (maxProbeDurationMs > controls.performance.maxProbeDurationMs) {
    issues.push({
      domain: "performance",
      code: "probe_duration_exceeded",
      detail: `${maxProbeDurationMs}ms > ${controls.performance.maxProbeDurationMs}ms`,
    });
  }
  if (wallClockMs > controls.performance.maxWallClockMs) {
    issues.push({
      domain: "performance",
      code: "wall_clock_exceeded",
      detail: `${wallClockMs}ms > ${controls.performance.maxWallClockMs}ms`,
    });
  }
  return issues;
}

export function validateStrategistResourceBudgetCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeStrategistResourceBudgetGuardControls = getForgeStrategistResourceBudgetGuardControls(),
): StrategistResourceBudgetGuardCheckIssue[] {
  const issues: StrategistResourceBudgetGuardCheckIssue[] = [];
  if (totalCostUsd > controls.cost.maxTotalCostUsd) {
    issues.push({
      domain: "cost",
      code: "cost_exceeded",
      detail: `$${totalCostUsd.toFixed(4)} > $${controls.cost.maxTotalCostUsd}`,
    });
  }
  if (llmCalls > controls.cost.maxLlmCalls) {
    issues.push({
      domain: "cost",
      code: "llm_calls_exceeded",
      detail: `${llmCalls} > ${controls.cost.maxLlmCalls}`,
    });
  }
  return issues;
}

export function buildStrategistResourceBudgetAdversarialGuardScenarios(): StrategistResourceBudgetAdversarialGuardScenario[] {
  return [
    {
      id: "adversarial.false_alignment_claim",
      description: "Evidence claims aligned while actual !== expected",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = true;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        return cloned;
      },
    },
    {
      id: "adversarial.summary_mismatch",
      description: "Summary reports zero mismatches while evidence is tampered",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = false;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        cloned.summary = { ...cloned.summary, aligned: cloned.summary.total, mismatches: 0 };
        return cloned;
      },
    },
    {
      id: "adversarial.dropped_probe",
      description: "Run record omits required probe evidence",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        cloned.evidence = cloned.evidence.slice(1);
        cloned.telemetry = cloned.telemetry.slice(1);
        cloned.summary = {
          ...cloned.summary,
          total: cloned.evidence.length,
          aligned: cloned.evidence.filter(item => item.aligned).length,
          mismatches: cloned.evidence.filter(item => !item.aligned).length,
        };
        return cloned;
      },
    },
  ];
}

export function runStrategistResourceBudgetAdversarialGuardChecks(
  fixtureRecord: StrategistResourceBudgetRunRecord,
  contract: StrategistResourceBudgetContract = getActiveStrategistResourceBudgetContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildStrategistResourceBudgetAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateStrategistResourceBudgetRunRecord(tampered, contract);
    const falseAlignment = detectStrategistResourceBudgetFalseAlignment(tampered);
    const summaryMismatch = detectStrategistResourceBudgetEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeStrategistResourceBudgetGuard(
  record: StrategistResourceBudgetRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: StrategistResourceBudgetContract;
    controls?: ForgeStrategistResourceBudgetGuardControls;
  } = {},
): StrategistResourceBudgetGuardCheckResult {
  const controls = options.controls ?? getForgeStrategistResourceBudgetGuardControls();
  const contract = options.contract ?? getActiveStrategistResourceBudgetContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: StrategistResourceBudgetGuardCheckIssue[] = [];

  issues.push(...validateStrategistResourceBudgetPerformance(record, controls));
  issues.push(...validateStrategistResourceBudgetCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateStrategistResourceBudgetSafety(record, controls));

  const falseAlignment = detectStrategistResourceBudgetFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectStrategistResourceBudgetEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runStrategistResourceBudgetAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeStrategistResourceBudgetTelemetry(record.telemetry);
  const wallClockMs = parseStrategistResourceBudgetIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  return {
    passed: issues.length === 0 && adversarial.rejected === adversarial.total,
    issues,
    metrics: {
      suiteDurationMs: telemetrySummary.suiteDurationMs,
      wallClockMs,
      maxProbeDurationMs: telemetrySummary.maxProbeDurationMs,
      totalCostUsd,
      llmCalls,
      adversarialScenariosRejected: adversarial.rejected,
      adversarialScenariosTotal: adversarial.total,
    },
  };
}

export interface ForgeStrategistResourceBudgetRegressionGateResult
  extends StrategistResourceBudgetForgeRegressionResult {
  guard: StrategistResourceBudgetGuardCheckResult;
}

/**
 * Resource budget regression gate with guard controls (P03-B06-A08 + A09 integration).
 */
export function runForgeStrategistResourceBudgetRegressionGate(
  priorRecord?: StrategistResourceBudgetRunRecord,
): ForgeStrategistResourceBudgetRegressionGateResult {
  const contract = getActiveStrategistResourceBudgetContract();
  const regression = runStrategistResourceBudgetForgeRegression(priorRecord);
  const guard = validateForgeStrategistResourceBudgetGuard(regression.record, {
    totalCostUsd: 0,
    llmCalls: 0,
    contract,
  });

  const passed = regression.passed && guard.passed;
  const detailParts = [regression.detail];
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  return {
    ...regression,
    passed,
    guard,
    detail: detailParts.join(" | "),
  };
}
