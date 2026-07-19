import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistAtomizationBaseline,
  getActiveStrategistAtomizationContract,
  getStrategistAtomizationCategoryContract,
  listStrategistAtomizationContractProbeIds,
  listStrategistAtomizationContractProbesByCategory,
  listStrategistAtomizationProbesByDisposition,
  summarizeStrategistAtomizationCoverage,
  validateStrategistAtomizationCoverage,
  validateStrategistAtomizationAgainstContract,
  recoverStrategistAtomize,
  assessStrategistAtomizeInputBoundary,
  runStrategistAtomizationProductionSlice,
  validateStrategistAtomizationProbeMatrix,
  STRATEGIST_ATOMIZATION_CATEGORIES,
  FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1,
} from "./forge-p03-strategist-atomization.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Atomization Contract — P03-B03-A02", () => {
  it("defines typed acceptance for all eight atomization categories", () => {
    const contract = getActiveStrategistAtomizationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B03-A06");

    for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
      const categoryContract = getStrategistAtomizationCategoryContract(category);
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

  it("maps 23 probes with zero documented FAIL gaps after A03 recovery slice", () => {
    const contract = getActiveStrategistAtomizationContract();
    const summary = summarizeStrategistAtomizationCoverage(contract);
    const coverage = validateStrategistAtomizationCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.atom_versioning.probeCount, 3);
    assert.equal(summary.byCategory.atom_structure.probeCount, 3);
    assert.equal(summary.byCategory.atom_sizing.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero gap probes after structured atom recovery slice", () => {
    const gaps = listStrategistAtomizationProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const validation = validateStrategistAtomizationAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistAtomizationContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.probes.length, 23);
  });

  it("each atomization probe id is globally unique", () => {
    const ids = listStrategistAtomizationContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistAtomizationContract();
    const flatIds = listStrategistAtomizationContractProbeIds(contract);
    const categoryIds = STRATEGIST_ATOMIZATION_CATEGORIES.flatMap(category =>
      listStrategistAtomizationContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Strategist Atomization Production Slice — P03-B03-A03", () => {
  it("recoverStrategistAtomize restructures malformed atomize parse into contract-compliant plan", () => {
    const malformed = `REASONING: Need atom production plan
Here are the steps:
1. Setup atomization types
2. Wire atomize production seam
3. Add atomization baseline tests
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistAtomize(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.contractCompliant, true);
    assert.ok(recovery.atomCount >= 3);
    assert.match(recovery.composedAtomize, /OUTPUT:/);
    assert.ok(recovery.atoms.some(atom => atom.includes("atomization types")));
    assert.ok(recovery.atoms.some(atom => atom.includes("atomize production seam")));
    assert.ok(recovery.atoms.some(atom => atom.includes("atomization baseline")));
  });

  it("recoverStrategistAtomize rejects null-byte atomize output safely", () => {
    const recovery = recoverStrategistAtomize("atomize\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.contractCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_atomize"]);
  });

  it("assessStrategistAtomizeInputBoundary handles atomize edge cases", () => {
    const empty = assessStrategistAtomizeInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistAtomizeInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistAtomizeInputBoundary("bad\0atomize");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistAtomizeInputBoundary("OUTPUT:\n1. valid atom task\nCONFIDENCE: 0.8");
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationProductionSlice();

    assert.equal(slice.atom, "P03-B03-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistAtomizationProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "satom.structured_atom_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});
