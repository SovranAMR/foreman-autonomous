import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPipelineInvariantEngineFixture,
  runPipelineInvariantEngineProbes,
  validatePipelineInvariantEngineFixture,
  validatePipelineInvariantEngineFixtureAgainstContract,
  summarizePipelineInvariantEngineMatrix,
  summarizePipelineInvariantEngineContractCoverage,
  getActivePipelineInvariantEngineContract,
  getPipelineInvariantEngineCategoryContract,
  listPipelineInvariantEngineContractProbeIds,
  listPipelineInvariantEngineProbesByDisposition,
  listPipelineInvariantEngineKnownGaps,
  listPipelineInvariantEngineProbesByExpected,
  PIPELINE_INVARIANT_ENGINE_CATEGORIES,
} from "./forge-pipeline-invariant-engine-harness.js";

function formatMismatchReport(mismatches: { id: string; expected: string; actual: string; detail: string }[]): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Pipeline Invariant Engine — P01-B05-A01", () => {
  it("loads versioned pipeline invariant engine fixture aligned with B04 handoff", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const validation = validatePipelineInvariantEngineFixture(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B05-A01");
    assert.equal(fixture.contractAtom, "P01-B05-A05");
    assert.equal(fixture.sourcePhaseEventSchema.probeCount, 35);
    assert.equal(fixture.sourcePhaseEventSchema.schemaCategories, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures orchestrator pipeline invariant probes with documented FAIL gaps", () => {
    const results = runPipelineInvariantEngineProbes();
    const summary = summarizePipelineInvariantEngineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listPipelineInvariantEngineProbesByExpected("FAIL", loadPipelineInvariantEngineFixture());
    assert.equal(documentedFail.length, 7);
    assert.ok(documentedFail.some(p => p.id === "inv.runtime_phase_balance_checker"));
    assert.ok(documentedFail.some(p => p.id === "inv.event_order_validator"));
    assert.ok(documentedFail.some(p => p.id === "inv.reflection_cadence_invariant"));
    assert.ok(documentedFail.some(p => p.id === "inv.state_phase_coherence_checker"));
    assert.ok(documentedFail.some(p => p.id === "inv.block_invariant_module"));
    assert.ok(documentedFail.some(p => p.id === "inv.verification_gate_invariant"));
    assert.ok(documentedFail.some(p => p.id === "inv.invariant_engine_orchestrator_wired"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

  it("documents runtime invariant engine gaps as measurable baseline debt", () => {
    const gaps = listPipelineInvariantEngineKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "inv.block_invariant_module",
      "inv.event_order_validator",
      "inv.invariant_engine_orchestrator_wired",
      "inv.reflection_cadence_invariant",
      "inv.runtime_phase_balance_checker",
      "inv.state_phase_coherence_checker",
      "inv.verification_gate_invariant",
    ]);
    assert.ok(
      gaps.every(
        g =>
          g.category === "phase_lifecycle" ||
          g.category === "event_ordering" ||
          g.category === "reflection_cadence" ||
          g.category === "state_coherence" ||
          g.category === "block_halt" ||
          g.category === "verification_gate" ||
          g.category === "boundary",
      ),
      "documented gaps are runtime invariant engine probes",
    );
  });
});

describe("Forge Pipeline Invariant Engine Contract — P01-B05-A02", () => {
  it("defines typed acceptance for all eight pipeline invariant categories", () => {
    const contract = getActivePipelineInvariantEngineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B05-A05");

    for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
      const categoryContract = getPipelineInvariantEngineCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" || probe.disposition === "gap",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 23 probes with seven documented gap dispositions from A01 baseline", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const summary = summarizePipelineInvariantEngineContractCoverage(contract);

    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 16);
    assert.equal(summary.expectedFail, 7);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 7);
    assert.equal(summary.byCategory.phase_lifecycle.probeCount, 3);
    assert.equal(summary.byCategory.event_ordering.probeCount, 3);
    assert.equal(summary.byCategory.reflection_cadence.probeCount, 3);
    assert.equal(summary.byCategory.state_coherence.probeCount, 3);
    assert.equal(summary.byCategory.block_halt.probeCount, 3);
    assert.equal(summary.byCategory.verification_gate.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
  });

  it("lists seven documented gap probes for runtime invariant engine wiring", () => {
    const gaps = listPipelineInvariantEngineProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "inv.block_invariant_module",
      "inv.event_order_validator",
      "inv.invariant_engine_orchestrator_wired",
      "inv.reflection_cadence_invariant",
      "inv.runtime_phase_balance_checker",
      "inv.state_phase_coherence_checker",
      "inv.verification_gate_invariant",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();
    const validation = validatePipelineInvariantEngineFixtureAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listPipelineInvariantEngineContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each pipeline invariant probe id is globally unique", () => {
    const ids = listPipelineInvariantEngineContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runPipelineInvariantEngineProbes();
    const contract = getActivePipelineInvariantEngineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});
