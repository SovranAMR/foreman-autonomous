import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPhaseEventSchemaFixture,
  runPhaseEventSchemaProbes,
  summarizePhaseEventSchemaMatrix,
  validatePhaseEventSchemaFixture,
  validatePhaseEventSchemaFixtureAgainstContract,
  getActivePhaseEventSchemaContract,
  listPhaseEventSchemaKnownGaps,
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

function formatMismatchReport(mismatches: ReturnType<typeof runPhaseEventSchemaProbes>): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
