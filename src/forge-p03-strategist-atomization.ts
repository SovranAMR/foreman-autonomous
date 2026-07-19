/**
 * FOREMAN — Strategist Atomization & Atom Sizing Baseline (P03-B03)
 *
 * Measures atomize structure, sizing rules and production wiring
 * on sealed P03-B02 block production contract block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistAtomizationBaseline from "./fixtures/forge-strategist-atomization-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B02ToB03Handoff,
  getActiveStrategistBlockContract,
  summarizeStrategistBlockContractCoverage,
  EXPECTED_P03_B02_SEALED_ATOM_COUNT,
} from "./forge-p03-strategist-block-contract.js";
import { parseAtomizeResponse } from "./parser.js";

export const FORGE_STRATEGIST_ATOMIZATION_VERSION = "1.0.0-a01";

/** Maximum normalized atomize length before truncation (P03-B03-A01 boundary debt). */
export const STRATEGIST_ATOMIZE_MAX_LENGTH = 32000;

export const STRATEGIST_ATOMIZATION_CATEGORIES = [
  "atom_versioning",
  "atom_structure",
  "atom_sizing",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistAtomizationCategory = (typeof STRATEGIST_ATOMIZATION_CATEGORIES)[number];

export const STRATEGIST_ATOMIZATION_A01_MIN_PROBES: Readonly<
  Record<StrategistAtomizationCategory, number>
> = {
  atom_versioning: 3,
  atom_structure: 3,
  atom_sizing: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export interface StrategistAtomizationFixtureEntry {
  id: string;
  category: StrategistAtomizationCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistAtomizationBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    blockContractProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistAtomizationFixtureEntry[];
}

export interface StrategistAtomizationProbeResult {
  id: string;
  category: StrategistAtomizationCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
}

export interface StrategistAtomizationProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistAtomizationProbeResult[];
  knownGaps: StrategistAtomizationProbeResult[];
  byCategory: Record<
    StrategistAtomizationCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistAtomizationValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistAtomizationCategory;
  detail: string;
}

export interface StrategistAtomizationValidationResult {
  valid: boolean;
  issues: StrategistAtomizationValidationIssue[];
}

/** A01 baseline probe matrix — fixture and harness must stay aligned. */
export const FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX: readonly StrategistAtomizationFixtureEntry[] =
  strategistAtomizationBaseline.probes as StrategistAtomizationFixtureEntry[];

export function getStrategistAtomizationA01ExpectedFailCount(): number {
  return FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadStrategistAtomizationBaseline(): StrategistAtomizationBaseline {
  return strategistAtomizationBaseline as StrategistAtomizationBaseline;
}

function validateStrategistAtomizationAgainstA01Matrix(
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationValidationResult {
  const issues: StrategistAtomizationValidationIssue[] = [];

  if (fixture.probes.length !== FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `expected mismatch for ${expected.id}: fixture=${entry.expected} matrix=${expected.expected}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `category mismatch for ${expected.id}`,
      });
    }
  }

  const expectedFailCount = getStrategistAtomizationA01ExpectedFailCount();
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document known FAIL gaps matching A01 matrix",
    });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} matrix expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistAtomizationBaseline(
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationValidationResult {
  const issues: StrategistAtomizationValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B03-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_ATOMIZATION_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistAtomizationCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
    const min = STRATEGIST_ATOMIZATION_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP03B02ToB03Handoff();
  const blockCoverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.blockContractProbeCount !== blockCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.blockContractProbeCount=${fixture.sourceBlockGate.blockContractProbeCount} ` +
        `contract=${blockCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B02 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B03-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B02 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B03-A01`,
    });
  }

  const matrixAlignment = validateStrategistAtomizationAgainstA01Matrix(fixture);
  issues.push(...matrixAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistAtomizationMatrix(
  results: StrategistAtomizationProbeResult[],
): StrategistAtomizationProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistAtomizationProbeSummary["byCategory"];
  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
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

export function listStrategistAtomizationProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline = loadStrategistAtomizationBaseline(),
): StrategistAtomizationFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistAtomizationKnownGaps(
  results: StrategistAtomizationProbeResult[],
): StrategistAtomizationProbeResult[] {
  return summarizeStrategistAtomizationMatrix(results).knownGaps;
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
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): StrategistAtomizationProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function productionAtomizationSource(): string {
  return readSrc("forge-p03-strategist-atomization.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionAtomizationSource());
}

const SAMPLE_ATOMIZE_OUTPUT = `OUTPUT:
1. Create src/types.ts with ForgeAtom interface
2. Wire orchestrator atomize seam in orchestrator.ts
3. Add atomization baseline tests in forge-p03-strategist-atomization.test.ts
4. Document B03 handoff in ACTIVE_FRONT.md
5. Seal atomization block gate
6. Regression gate
7. Extra atom trimmed
CONFIDENCE: 0.85`;

function probeAtomVersioning(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "satom.atom_tagged": {
      const ok = fixture.atom === "P03-B03-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "satom.harness_version_exported": {
      const ok = FORGE_STRATEGIST_ATOMIZATION_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_ATOMIZATION_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown atom_versioning probe");
  }
}

function probeAtomStructure(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();

  switch (id) {
    case "satom.prompt_atomize_output": {
      const ok =
        prompts.includes("### ATOMIZE Mode") &&
        prompts.includes("## Output Format — ATOMIZE") &&
        prompts.includes("OUTPUT:");
      return probe(id, category, expected, ok, `atomizeOutputSection=${ok}`);
    }
    case "satom.prompt_atom_format": {
      const ok =
        prompts.includes("1. [exact atomic task") &&
        prompts.includes("Atomize Quality Checklist");
      return probe(id, category, expected, ok, `atomFormat=${ok}`);
    }
    case "satom.parse_atomize_atoms": {
      const ok =
        parser.includes("export function parseAtomizeResponse") &&
        parseAtomizeResponse(SAMPLE_ATOMIZE_OUTPUT).ok === true;
      const parsed = parseAtomizeResponse(SAMPLE_ATOMIZE_OUTPUT);
      const atomCount = parsed.ok ? parsed.data.atoms.length : 0;
      return probe(id, category, expected, ok && atomCount >= 3, `parsedAtoms=${atomCount}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_structure probe");
  }
}

function probeAtomSizing(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "satom.parser_six_atom_cap": {
      const ok = parser.includes("atoms.length > 6") && parser.includes("atoms.length = 6");
      return probe(id, category, expected, ok, `parserCap=${ok}`);
    }
    case "satom.orchestrator_hard_cap": {
      const ok =
        orchestrator.includes("Hard cap: max 6 atoms per block") &&
        orchestrator.includes("atoms.length > 6") &&
        orchestrator.includes("atoms.length = 6");
      return probe(id, category, expected, ok, `orchestratorCap=${ok}`);
    }
    case "satom.prompt_max_six_atoms": {
      const ok =
        prompts.includes("ABSOLUTE MAXIMUM: 6 atoms") &&
        prompts.includes("1-2 atoms MAX") &&
        prompts.includes("3-6 atoms");
      return probe(id, category, expected, ok, `promptSizing=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_sizing probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.b02_block_handoff_entry": {
      const handoff = getForgeP03B02ToB03Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B03" &&
        handoff.targetBlock.entryAtom === "P03-B03-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "satom.b02_sealed_block_probes": {
      const handoff = getForgeP03B02ToB03Handoff();
      const coverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());
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
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.source_block_gate_ref": {
      const handoff = getForgeP03B02ToB03Handoff();
      const coverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.blockContractProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B02_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.blockContractProbeCount}`,
      );
    }
    case "satom.probe_runner_exported": {
      const ok = productionAtomizationSource().includes(
        "export function runStrategistAtomizationProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "satom.known_gaps_documented": {
      const expectedFail = getStrategistAtomizationA01ExpectedFailCount();
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && expectedFail > 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, matrixExpectedFail=${expectedFail}`,
      );
    }
    case "satom.empty_atomize_boundary": {
      const ok =
        hasProductionExport("assessStrategistAtomizeInputBoundary") &&
        productionAtomizationSource().includes('disposition: "empty"');
      return probe(
        id,
        category,
        expected,
        ok,
        `assessStrategistAtomizeInputBoundary=${hasProductionExport("assessStrategistAtomizeInputBoundary")}`,
      );
    }
    case "satom.whitespace_atomize_boundary": {
      const ok =
        hasProductionExport("assessStrategistAtomizeInputBoundary") &&
        productionAtomizationSource().includes('disposition: "whitespace_only"');
      return probe(
        id,
        category,
        expected,
        ok,
        `whitespaceBoundary=${ok}`,
      );
    }
    case "satom.atom_cap_boundary": {
      const parser = parserSource();
      const ok = parser.includes("atoms.length > 6") && parser.includes("atoms.length = 6");
      const overCap = `OUTPUT:\n${Array.from({ length: 8 }, (_, i) => `${i + 1}. atom task ${i + 1}`).join("\n")}\nCONFIDENCE: 0.5`;
      const parsed = parseAtomizeResponse(overCap);
      const capped = parsed.ok === true && parsed.data.atoms.length === 6;
      return probe(id, category, expected, ok && capped, `parserCap=${ok}, capped=${capped}`);
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistAtomizationBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "satom.malformed_atomize_guard": {
      const ok =
        hasProductionExport("assessStrategistAtomizeInputBoundary") &&
        productionAtomizationSource().includes('disposition: "contains_null_byte"');
      return probe(
        id,
        category,
        expected,
        ok,
        `nullByteGuard=${ok}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "satom.atomize_salvage_fallback": {
      const ok =
        orchestrator.includes("atomize format invalid; salvaged") &&
        orchestrator.includes("fallbackParseBlocks") &&
        orchestrator.includes('phase: "atomize"');
      return probe(id, category, expected, ok, `salvageFallback=${ok}`);
    }
    case "satom.structured_atom_recovery": {
      const ok =
        hasProductionExport("recoverStrategistAtomize") &&
        productionAtomizationSource().includes("contractCompliant");
      return probe(
        id,
        category,
        expected,
        ok,
        `recoverStrategistAtomize=${hasProductionExport("recoverStrategistAtomize")}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "satom.orchestrator_zero_atoms_skip": {
      const ok =
        orchestrator.includes("if (atoms.length === 0)") &&
        orchestrator.includes("No atoms extracted from block");
      return probe(id, category, expected, ok, `zeroAtomsSkip=${ok}`);
    }
    case "satom.worker_impossible_atom": {
      const ok =
        prompts.includes("BLOCK Signal") &&
        prompts.includes("impossible atom") &&
        prompts.includes("Worker");
      return probe(id, category, expected, ok, `workerBlockSignal=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (category) {
    case "atom_versioning":
      return probeAtomVersioning(id, category, expected, fixture);
    case "atom_structure":
      return probeAtomStructure(id, category, expected);
    case "atom_sizing":
      return probeAtomSizing(id, category, expected);
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
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function runStrategistAtomizationProbes(
  fixture: StrategistAtomizationBaseline = loadStrategistAtomizationBaseline(),
): StrategistAtomizationProbeResult[] {
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
}
