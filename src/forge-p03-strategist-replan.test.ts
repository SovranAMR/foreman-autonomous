import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistReplanBaseline,
  runStrategistReplanProbes,
  runStrategistReplanProductionSlice,
  validateStrategistReplan,
  validateStrategistReplanProbeMatrix,
  getActiveStrategistReplanContract,
  getStrategistReplanCategoryContract,
  listStrategistReplanContractProbeIds,
  listStrategistReplanContractProbesByCategory,
  listStrategistReplanProbesByDisposition,
  summarizeStrategistReplanCoverage,
  validateStrategistReplanCoverage,
  validateStrategistReplanAgainstContract,
  validateStrategistReplanBaseline,
  STRATEGIST_REPLAN_CATEGORIES,
  FORGE_STRATEGIST_REPLAN_CONTRACT_V1,
} from "./forge-p03-strategist-replan.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Replan Contract — P03-B08-A02", () => {
  it("defines typed acceptance for all nine replan categories", () => {
    const contract = getActiveStrategistReplanContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B08-A06");

    for (const category of STRATEGIST_REPLAN_CATEGORIES) {
      const categoryContract = getStrategistReplanCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);

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

  it("maps 28 probes with zero remaining FAIL gaps after A03 production slice", () => {
    const contract = getActiveStrategistReplanContract();
    const summary = summarizeStrategistReplanCoverage(contract);
    const coverage = validateStrategistReplanCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 28);
    assert.equal(summary.expectedPass, 28);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 20);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 3);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.replan_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_replan_path.probeCount, 4);
    assert.equal(summary.byCategory.atom_replan_path.probeCount, 2);
    assert.equal(summary.byCategory.plan_repair_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists no remaining gap probes after A03 replan production slice", () => {
    const gaps = listStrategistReplanProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);

    const nogoGaps = listStrategistReplanProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistReplanBaseline();
    const contract = getActiveStrategistReplanContract();
    const validation = validateStrategistReplanAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistReplanContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistReplanBaseline();
    const validation = validateStrategistReplanBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_REPLAN_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_REPLAN_CONTRACT_V1.probes.length, 28);
  });

  it("each replan probe id is globally unique", () => {
    const ids = listStrategistReplanContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistReplanContract();
    const flatIds = listStrategistReplanContractProbeIds(contract);
    const categoryIds = STRATEGIST_REPLAN_CATEGORIES.flatMap(category =>
      listStrategistReplanContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistReplanProbes();
    const contract = getActiveStrategistReplanContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Strategist Replan Production Slice — P03-B08-A03", () => {
  it("validateStrategistReplan accepts valid replan plan and rejects invalid block refs", () => {
    const valid = `REASONING: Replan plan
OUTPUT:
Block 1: Setup baseline types
Block 2: Wire replan seam
DEPENDENCIES: 2→1
REPLAN PLAN: re-decompose block 2 on failure
CONFIDENCE: 0.9`;
    const validResult = validateStrategistReplan(valid);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.hasReplanPlan, true);
    assert.equal(validResult.blockCount, 2);
    assert.deepEqual(validResult.invalidBlockRefs, []);

    const invalid = `REASONING: Bad replan refs
OUTPUT:
Block 1: Setup baseline types
DEPENDENCIES: none
REPLAN PLAN: replan block 9 after failure
CONFIDENCE: 0.8`;
    const invalidResult = validateStrategistReplan(invalid);
    assert.equal(invalidResult.valid, false);
    assert.deepEqual(invalidResult.invalidBlockRefs, [9]);
    assert.ok(invalidResult.issues.some(i => i.includes("invalid_replan_block_refs")));
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveStrategistReplanContract();
    const slice = runStrategistReplanProductionSlice();

    assert.equal(slice.atom, "P03-B08-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 28);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 28);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const flippedGaps = slice.results.filter(
      r =>
        (r.id === "sreplan.prompt_replan_plan" ||
          r.id === "sreplan.parser_replan_fields" ||
          r.id === "sreplan.orchestrator_strategist_replan_gate" ||
          r.id === "sreplan.exported_replan_validator" ||
          r.id === "sreplan.nogo_invalid_replan" ||
          r.id === "sreplan.recovery_replan_checkpoint") &&
        r.expected === "PASS" &&
        r.actual === "PASS",
    );
    assert.equal(flippedGaps.length, 6, "A03 closes all six replan contract gaps");

    const matrixValidation = validateStrategistReplanProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});
