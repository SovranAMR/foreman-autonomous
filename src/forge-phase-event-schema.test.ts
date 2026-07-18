import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPhaseEventSchemaFixture,
  runPhaseEventSchemaProbes,
  summarizePhaseEventSchemaMatrix,
  validatePhaseEventSchemaFixture,
  validatePhaseEventSchemaFixtureAgainstContract,
  getActivePhaseEventSchemaContract,
  getPhaseEventSchemaCategoryContract,
  listPhaseEventSchemaContractProbeIds,
  listPhaseEventSchemaKnownGaps,
  listPhaseEventSchemaProbesByDisposition,
  listPhaseEventSchemaProbesByExpected,
  summarizePhaseEventSchemaContractCoverage,
  PHASE_EVENT_SCHEMA_CATEGORIES,
} from "./forge-phase-event-schema-harness.js";

describe("Forge Phase/Event Schema — P01-B04-A01", () => {
  it("loads versioned phase/event schema fixture aligned with B03 handoff", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const validation = validatePhaseEventSchemaFixture(fixture);
    const contractValidation = validatePhaseEventSchemaFixtureAgainstContract(fixture, contract);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B04-A01");
    assert.equal(fixture.contractAtom, contract.atom);
    assert.equal(fixture.sourceFormalStateMachine.probeCount, 28);
    assert.equal(fixture.sourceFormalStateMachine.fsmCategories, 7);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(
      contractValidation.valid,
      true,
      contractValidation.issues.map(i => i.detail).join("\n"),
    );
    assert.equal(fixture.probes.length, contract.probes.length);
  });

  it("measures orchestrator phase/event probes with documented FAIL gaps", () => {
    const results = runPhaseEventSchemaProbes();
    const summary = summarizePhaseEventSchemaMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listPhaseEventSchemaProbesByExpected("FAIL");
    assert.equal(documentedFail.length, 5);
    assert.ok(documentedFail.some(p => p.id === "schema.orch_phase_field_typed"));
    assert.ok(documentedFail.some(p => p.id === "schema.stream_phase_field_typed"));
    assert.ok(documentedFail.some(p => p.id === "schema.unregistered_phase_literals"));
    assert.ok(documentedFail.some(p => p.id === "schema.recovery_assess_unpaired"));
    assert.ok(documentedFail.some(p => p.id === "schema.registry_covers_core"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of PHASE_EVENT_SCHEMA_CATEGORIES) {
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

  it("documents typed phase/event schema gaps as measurable baseline debt", () => {
    const gaps = listPhaseEventSchemaKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "schema.orch_phase_field_typed",
      "schema.recovery_assess_unpaired",
      "schema.registry_covers_core",
      "schema.stream_phase_field_typed",
      "schema.unregistered_phase_literals",
    ]);
    assert.ok(
      gaps.every(g => g.category === "phase_typing" || g.category === "phase_registry" || g.category === "event_pairing"),
      "documented gaps are phase typing, registry, or pairing probes",
    );
  });

  it("declares typed contract probes across seven schema categories", () => {
    const coverage = summarizePhaseEventSchemaContractCoverage();
    assert.equal(coverage.totalProbes, 24);
    assert.equal(coverage.expectedPass, 19);
    assert.equal(coverage.expectedFail, 5);
    assert.equal(coverage.byDisposition.gap, 5);
    assert.equal(coverage.byCategory.event_type_union.probeCount, 4);
    assert.equal(coverage.byCategory.phase_typing.probeCount, 3);
    assert.equal(coverage.byCategory.phase_registry.probeCount, 4);
    assert.equal(coverage.byCategory.event_pairing.probeCount, 4);
    assert.equal(coverage.byCategory.stream_seam.probeCount, 3);
    assert.equal(coverage.byCategory.baseline_link.probeCount, 2);
    assert.equal(coverage.byCategory.boundary.probeCount, 4);
  });
});

describe("Forge Phase/Event Schema Contract — P01-B04-A02", () => {
  it("defines typed acceptance for all seven phase/event schema categories", () => {
    const contract = getActivePhaseEventSchemaContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B04-A05");

    for (const category of PHASE_EVENT_SCHEMA_CATEGORIES) {
      const categoryContract = getPhaseEventSchemaCategoryContract(category);
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

  it("maps 24 probes with five documented gap dispositions from A01 baseline", () => {
    const contract = getActivePhaseEventSchemaContract();
    const summary = summarizePhaseEventSchemaContractCoverage(contract);

    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 19);
    assert.equal(summary.expectedFail, 5);
    assert.equal(summary.byDisposition.observed, 19);
    assert.equal(summary.byDisposition.gap, 5);
    assert.equal(summary.byCategory.event_type_union.probeCount, 4);
    assert.equal(summary.byCategory.phase_typing.probeCount, 3);
    assert.equal(summary.byCategory.phase_registry.probeCount, 4);
    assert.equal(summary.byCategory.event_pairing.probeCount, 4);
    assert.equal(summary.byCategory.stream_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 4);
  });

  it("lists five documented gap probes for phase typing, registry, and pairing", () => {
    const gaps = listPhaseEventSchemaProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "schema.orch_phase_field_typed",
      "schema.recovery_assess_unpaired",
      "schema.registry_covers_core",
      "schema.stream_phase_field_typed",
      "schema.unregistered_phase_literals",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const validation = validatePhaseEventSchemaFixtureAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listPhaseEventSchemaContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each phase/event schema probe id is globally unique", () => {
    const ids = listPhaseEventSchemaContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });
});

function formatMismatchReport(mismatches: ReturnType<typeof runPhaseEventSchemaProbes>): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
