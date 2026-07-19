import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerIntentBaseline,
  runVisionerIntentProbes,
  runVisionerIntentProductionSlice,
} from "./forge-p02-visioner-intent.probe.js";
import {
  getActiveVisionerIntentContract,
  getVisionerIntentCategoryContract,
  listVisionerIntentContractProbeIds,
  listVisionerIntentContractProbesByCategory,
  listVisionerIntentProbesByDisposition,
  summarizeVisionerIntentContractCoverage,
  validateVisionerIntentContractCoverage,
  validateVisionerIntentAgainstContract,
  validateVisionerIntentProbeMatrix,
  parseVisionerTaskIntent,
  classifyVisionerTaskDepth,
  buildVisionPromptForDepth,
  VISIONER_INTENT_CATEGORIES,
} from "./forge-p02-visioner-intent.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Intent Contract — P02-B01-A02", () => {
  it("defines typed acceptance for all eight visioner intent categories", () => {
    const contract = getActiveVisionerIntentContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B01-A05");

    for (const category of VISIONER_INTENT_CATEGORIES) {
      const categoryContract = getVisionerIntentCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" ||
            probe.disposition === "gap" ||
            probe.disposition === "failure" ||
            probe.disposition === "recovery" ||
            probe.disposition === "nogo",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 20 probes with two documented gap dispositions after A03 slice", () => {
    const contract = getActiveVisionerIntentContract();
    const summary = summarizeVisionerIntentContractCoverage(contract);
    const coverage = validateVisionerIntentContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 20);
    assert.equal(summary.expectedPass, 18);
    assert.equal(summary.expectedFail, 2);
    assert.equal(summary.byDisposition.observed, 14);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 1);
    assert.equal(summary.byCategory.intent_versioning.probeCount, 3);
    assert.equal(summary.byCategory.task_signal.probeCount, 3);
    assert.equal(summary.byCategory.intent_depth.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists two remaining gap probes after A03 parse/classify/route slice", () => {
    const gaps = listVisionerIntentProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "vint.intent_ambiguity_nogo",
      "vint.structured_intent_recovery",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerIntentBaseline();
    const contract = getActiveVisionerIntentContract();
    const validation = validateVisionerIntentAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerIntentContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner intent probe id is globally unique", () => {
    const ids = listVisionerIntentContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerIntentProbes();
    const contract = getActiveVisionerIntentContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerIntentContract();
    const flatIds = listVisionerIntentContractProbeIds(contract);
    const categoryIds = VISIONER_INTENT_CATEGORIES.flatMap(category =>
      listVisionerIntentContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Visioner Intent Production Slice — P02-B01-A03", () => {
  it("parseVisionerTaskIntent exports structured intent with depth classification", () => {
    const simple = parseVisionerTaskIntent("Fix typo in README.md");
    assert.equal(simple.depth, "simple");
    assert.ok(simple.signals.includes("fix"));
    assert.ok(simple.goals.length >= 1);
    assert.ok(simple.normalizedTask.length > 0);

    const complex = parseVisionerTaskIntent(
      "Design full system architecture for multi-component UI platform with end-to-end flows",
    );
    assert.equal(classifyVisionerTaskDepth(complex.normalizedTask, complex), "complex");
    assert.ok(complex.signals.includes("design"));
  });

  it("buildVisionPromptForDepth routes simple, medium and complex directives", () => {
    const simplePrompt = buildVisionPromptForDepth("simple", "Fix config.json", "", "");
    const complexPrompt = buildVisionPromptForDepth("complex", "Build dashboard UI", "", "");
    assert.match(simplePrompt, /SIMPLE task/i);
    assert.match(complexPrompt, /COMPLEX task/i);
    assert.match(simplePrompt, /Project: Fix config\.json/);
  });

  it("executes contract-wired probes with zero unexpected mismatches after parse/classify/route slice", () => {
    const contract = getActiveVisionerIntentContract();
    const slice = runVisionerIntentProductionSlice();

    assert.equal(slice.atom, "P02-B01-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 20);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 18);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateVisionerIntentProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 2);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      ["vint.intent_ambiguity_nogo", "vint.structured_intent_recovery"],
    );

    const flipped = ["vint.structured_intent_parse", "vint.programmatic_depth_classifier", "vint.depth_routed_prompt"];
    for (const id of flipped) {
      const result = slice.results.find(r => r.id === id);
      assert.ok(result, `${id} missing`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });
});
