/**
 * FOREMAN — Strategist Resource & Budget Baseline (P03-B06)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P03-B05 risk reversibility block gate artifacts.
 */

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

export const FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION = "1.0.0-a04";

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
