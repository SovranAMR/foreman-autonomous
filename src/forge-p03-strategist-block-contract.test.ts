import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistBlockContractBaseline,
  getActiveStrategistBlockContract,
  getStrategistBlockContractCategoryContract,
  listStrategistBlockContractContractProbeIds,
  listStrategistBlockContractProbesByDisposition,
  summarizeStrategistBlockContractCoverage,
  validateStrategistBlockContractCoverage,
  validateStrategistBlockContractAgainstContract,
  recoverStrategistBlockProduction,
  runStrategistBlockContractProductionSlice,
  validateStrategistBlockContractProbeMatrix,
  STRATEGIST_BLOCK_CONTRACT_CATEGORIES,
  FORGE_STRATEGIST_BLOCK_CONTRACT_V1,
} from "./forge-p03-strategist-block-contract.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Block Contract — P03-B02-A02", () => {
  it("defines typed acceptance for all eight block production contract categories", () => {
    const contract = getActiveStrategistBlockContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B02-A05");

    for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
      const categoryContract = getStrategistBlockContractCategoryContract(category);
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
    const contract = getActiveStrategistBlockContract();
    const summary = summarizeStrategistBlockContractCoverage(contract);
    const coverage = validateStrategistBlockContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.block_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_structure.probeCount, 3);
    assert.equal(summary.byCategory.block_metadata.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero gap probes after structured block recovery slice", () => {
    const gaps = listStrategistBlockContractProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();
    const validation = validateStrategistBlockContractAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistBlockContractContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_BLOCK_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_BLOCK_CONTRACT_V1.probes.length, 23);
  });
});

describe("Forge Strategist Block Contract Production Slice — P03-B02-A03", () => {
  it("recoverStrategistBlockProduction restructures malformed block parse into contract-compliant plan", () => {
    const malformed = `REASONING: Need block production plan
Here are the steps:
Block 1: Setup block contract types
Block 2: Wire block production seam
Block 3: Add block contract baseline tests
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistBlockProduction(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.contractCompliant, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /REASONING:/);
    assert.match(recovery.composedDecompose, /OUTPUT:/);
    assert.ok(recovery.blocks.some(block => block.includes("block contract types")));
    assert.ok(recovery.blocks.some(block => block.includes("block production seam")));
    assert.ok(recovery.blocks.some(block => block.includes("block contract baseline")));
  });

  it("recoverStrategistBlockProduction rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistBlockProduction("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.contractCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistBlockContract();
    const slice = runStrategistBlockContractProductionSlice();

    assert.equal(slice.atom, "P03-B02-A03");
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

    const matrixValidation = validateStrategistBlockContractProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "sblk.structured_block_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});
