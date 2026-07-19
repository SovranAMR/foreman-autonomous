import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistBlockContractBaseline,
  runStrategistBlockContractProbes,
  validateStrategistBlockContractBaseline,
  summarizeStrategistBlockContractMatrix,
  listStrategistBlockContractProbesByExpected,
  listStrategistBlockContractKnownGaps,
  STRATEGIST_BLOCK_CONTRACT_CATEGORIES,
} from "./forge-p03-strategist-block-contract.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Block Contract — P03-B02-A01", () => {
  it("loads versioned block contract baseline aligned with P03-B01 block gate handoff", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const validation = validateStrategistBlockContractBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B02-A01");
    assert.equal(fixture.contractAtom, "P03-B02-A05");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B01-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures block contract probes with documented FAIL gaps from P03-B01 sealed handoff", () => {
    const results = runStrategistBlockContractProbes();
    const summary = summarizeStrategistBlockContractMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistBlockContractProbesByExpected(
      "FAIL",
      loadStrategistBlockContractBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "sblk.structured_block_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents remaining block contract gaps as measurable baseline debt", () => {
    const gaps = listStrategistBlockContractKnownGaps(runStrategistBlockContractProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["sblk.structured_block_recovery"]);
    assert.ok(
      gaps.every(g => STRATEGIST_BLOCK_CONTRACT_CATEGORIES.includes(g.category)),
      "documented gaps are block contract probes",
    );
  });
});
