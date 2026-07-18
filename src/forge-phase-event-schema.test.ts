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
  runPhaseEventSchemaProductionSlice,
  runPhaseEventSchemaBoundarySlice,
  runPhaseEventSchemaFailureRecoverySlice,
  validatePhaseEventSchemaProbeMatrix,
  validatePhaseEventSchemaBoundaryProbeMatrix,
  validatePhaseEventSchemaFailureRecoveryProbeMatrix,
  listPhaseEventSchemaProbesByCategory,
  listPhaseEventSchemaFailureRecoveryProbeIds,
  PHASE_EVENT_SCHEMA_CATEGORIES,
  PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES,
  runPhaseEventSchemaProbesWithRecord,
  runPhaseEventSchemaFailureRecoverySliceWithRecord,
  validatePhaseEventSchemaRunRecord,
  validatePhaseEventSchemaFailureRecoveryRunRecord,
  buildPhaseEventSchemaProbeEvidence,
  buildPhaseEventSchemaProbeTelemetry,
  buildPhaseEventSchemaProvenance,
  buildPhaseEventSchemaRunRecord,
  runForgePhaseEventSchemaRegressionGate,
  detectPhaseEventSchemaProbeRegression,
} from "./forge-phase-event-schema-harness.js";
import {
  runPhaseEventSchemaFuzzValidation,
  runPhaseEventSchemaPropertyChecks,
  runPhaseEventSchemaRunRecordFuzzValidation,
} from "./forge-phase-event-schema.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
    assert.equal(summary.total, 35);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listPhaseEventSchemaProbesByExpected("FAIL");
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "schema.orch_phase_field_typed"));
    assert.ok(documentedFail.some(p => p.id === "schema.stream_phase_field_typed"));
    assert.ok(documentedFail.some(p => p.id === "schema.unregistered_phase_literals"));
    assert.ok(documentedFail.some(p => p.id === "schema.recovery_assess_unpaired"));
    assert.ok(documentedFail.some(p => p.id === "schema.registry_covers_core"));
    assert.ok(documentedFail.some(p => p.id === "schema.hallucination_unused_variant"));

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
      "schema.hallucination_unused_variant",
      "schema.orch_phase_field_typed",
      "schema.recovery_assess_unpaired",
      "schema.registry_covers_core",
      "schema.stream_phase_field_typed",
      "schema.unregistered_phase_literals",
    ]);
    assert.ok(
      gaps.every(
        g =>
          g.category === "phase_typing" ||
          g.category === "phase_registry" ||
          g.category === "event_pairing" ||
          g.category === "boundary",
      ),
      "documented gaps are phase typing, registry, pairing, or boundary probes",
    );
  });

  it("declares typed contract probes across seven schema categories", () => {
    const coverage = summarizePhaseEventSchemaContractCoverage();
    assert.equal(coverage.totalProbes, 35);
    assert.equal(coverage.expectedPass, 29);
    assert.equal(coverage.expectedFail, 6);
    assert.equal(coverage.byDisposition.gap, 6);
    assert.equal(coverage.byDisposition.failure, 3);
    assert.equal(coverage.byDisposition.recovery, 3);
    assert.equal(coverage.byDisposition.nogo, 3);
    assert.equal(coverage.byCategory.event_type_union.probeCount, 4);
    assert.equal(coverage.byCategory.phase_typing.probeCount, 3);
    assert.equal(coverage.byCategory.phase_registry.probeCount, 4);
    assert.equal(coverage.byCategory.event_pairing.probeCount, 4);
    assert.equal(coverage.byCategory.stream_seam.probeCount, 3);
    assert.equal(coverage.byCategory.baseline_link.probeCount, 2);
    assert.equal(coverage.byCategory.boundary.probeCount, 6);
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

  it("maps 26 probes with six documented gap dispositions from A01 baseline", () => {
    const contract = getActivePhaseEventSchemaContract();
    const summary = summarizePhaseEventSchemaContractCoverage(contract);

    assert.equal(summary.totalProbes, 35);
    assert.equal(summary.expectedPass, 29);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 20);
    assert.equal(summary.byDisposition.gap, 6);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 3);
    assert.equal(summary.byDisposition.nogo, 3);
    assert.equal(summary.byCategory.event_type_union.probeCount, 4);
    assert.equal(summary.byCategory.phase_typing.probeCount, 3);
    assert.equal(summary.byCategory.phase_registry.probeCount, 4);
    assert.equal(summary.byCategory.event_pairing.probeCount, 4);
    assert.equal(summary.byCategory.stream_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
  });

  it("lists six documented gap probes for phase typing, registry, pairing, and boundary", () => {
    const gaps = listPhaseEventSchemaProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "schema.hallucination_unused_variant",
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

describe("Forge Phase/Event Schema Production Slice — P01-B04-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActivePhaseEventSchemaContract();
    const slice = runPhaseEventSchemaProductionSlice();

    assert.equal(slice.atom, "P01-B04-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 35);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 29);
    assert.equal(slice.matrixValidation.gapAligned, 6);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validatePhaseEventSchemaProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 6);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "schema.hallucination_unused_variant",
        "schema.orch_phase_field_typed",
        "schema.recovery_assess_unpaired",
        "schema.registry_covers_core",
        "schema.stream_phase_field_typed",
        "schema.unregistered_phase_literals",
      ],
    );
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runPhaseEventSchemaProbes();
    const contract = getActivePhaseEventSchemaContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Phase/Event Schema Boundary Slice — P01-B04-A04", () => {
  it("defines boundary category with payload and unused-variant edge probes", () => {
    const boundary = listPhaseEventSchemaProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "schema.block_detected_event",
      "schema.block_detected_payload",
      "schema.error_event",
      "schema.format_retry_event",
      "schema.hallucination_event",
      "schema.hallucination_unused_variant",
    ]);
    assert.equal(boundary.filter(p => p.expected === "PASS").length, 5);
    assert.equal(boundary.filter(p => p.disposition === "gap").length, 1);
    assert.ok(boundary.some(p => p.id === "schema.block_detected_payload"));
    assert.ok(boundary.some(p => p.id === "schema.hallucination_unused_variant"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActivePhaseEventSchemaContract();
    const slice = runPhaseEventSchemaBoundarySlice();

    assert.equal(slice.atom, "P01-B04-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const boundaryProbe of listPhaseEventSchemaProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validatePhaseEventSchemaBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented boundary gap for unused hallucination variant", () => {
    const results = runPhaseEventSchemaProbes();
    const boundary = results.filter(r => r.category === "boundary");

    assert.equal(boundary.length, 6);
    assert.equal(boundary.every(r => r.aligned), true);

    const unusedVariant = boundary.find(r => r.id === "schema.hallucination_unused_variant");
    assert.ok(unusedVariant);
    assert.equal(unusedVariant!.expected, "FAIL");
    assert.equal(unusedVariant!.actual, "FAIL");

    const payloadProbe = boundary.find(r => r.id === "schema.block_detected_payload");
    assert.ok(payloadProbe);
    assert.equal(payloadProbe!.expected, "PASS");
    assert.equal(payloadProbe!.actual, "PASS");
  });
});

describe("Forge Phase/Event Schema Failure/Recovery/NO-GO — P01-B04-A05", () => {
  it("lists failure, recovery and NO-GO probes by disposition and category", () => {
    const failure = listPhaseEventSchemaProbesByDisposition("failure");
    const recovery = listPhaseEventSchemaProbesByDisposition("recovery");
    const nogo = listPhaseEventSchemaProbesByDisposition("nogo");
    const failurePath = listPhaseEventSchemaProbesByCategory("failure_path");
    const recoveryPath = listPhaseEventSchemaProbesByCategory("recovery_path");
    const nogoPath = listPhaseEventSchemaProbesByCategory("nogo_path");

    assert.ok(failure.some(p => p.id === "schema.failure_block_detected_on_worker"));
    assert.ok(failure.some(p => p.id === "schema.failure_error_on_atom_exhaust"));
    assert.ok(recovery.some(p => p.id === "schema.recovery_re_decompose_events"));
    assert.ok(recovery.some(p => p.id === "schema.recovery_phase_runner"));
    assert.ok(nogo.some(p => p.id === "schema.nogo_reviewer_reject_branch"));
    assert.ok(nogo.some(p => p.id === "schema.nogo_rollback_on_reject"));
    assert.equal(failurePath.length, 3);
    assert.equal(recoveryPath.length, 3);
    assert.equal(nogoPath.length, 3);
    assert.deepEqual(
      [...PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActivePhaseEventSchemaContract();
    const slice = runPhaseEventSchemaFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B04-A05");
    assert.equal(slice.failureRecoveryProbeCount, 9);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 9);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 9);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listPhaseEventSchemaProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validatePhaseEventSchemaFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented gaps while exercising failure/recovery/NO-GO paths", () => {
    const results = runPhaseEventSchemaProbes();
    const summary = summarizePhaseEventSchemaMatrix(results);

    assert.equal(summary.total, 35);
    assert.equal(summary.knownGaps.length, 6);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));

    const probeIds = listPhaseEventSchemaFailureRecoveryProbeIds();
    assert.equal(probeIds.length, 9);
    assert.ok(probeIds.every(id => results.find(r => r.id === id)?.aligned));
  });
});

describe("Forge Phase/Event Schema Evidence — P01-B04-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const probeIds = listPhaseEventSchemaFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-18T00:00:00.000Z";
    const completedAt = "2026-07-18T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildPhaseEventSchemaProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildPhaseEventSchemaProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildPhaseEventSchemaProvenance(
      "run-schema-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B04-A06",
        sliceCategories: PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildPhaseEventSchemaRunRecord(provenance, evidence, telemetry);
    const validation = validatePhaseEventSchemaFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 9);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 3);
    assert.ok(record.summary.byDisposition.nogo >= 3);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(
      record.provenance.sourceFormalStateMachineAtom,
      fixture.sourceFormalStateMachine.atom,
    );
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActivePhaseEventSchemaContract();
    const record = runPhaseEventSchemaFailureRecoverySliceWithRecord();
    const validation = validatePhaseEventSchemaFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 9);
    assert.equal(record.telemetry.length, 9);
    assert.equal(record.provenance.totalProbes, 9);
    assert.equal(record.provenance.sliceAtom, "P01-B04-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.equal(item.aligned, true);
      assert.ok(item.recordedAt.length > 10);
    }
  });

  it("records evidence, telemetry and provenance for full phase/event schema run", () => {
    const record = runPhaseEventSchemaProbesWithRecord();
    const validation = validatePhaseEventSchemaRunRecord(record);

    assert.equal(record.evidence.length, 35);
    assert.equal(record.telemetry.length, 35);
    assert.equal(record.provenance.totalProbes, 35);
    assert.ok(record.provenance.runId.length > 8);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.byDisposition.gap, 6);

    for (const item of record.evidence) {
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion provenance`);
      assert.ok(
        item.disposition === "observed" ||
          item.disposition === "gap" ||
          item.disposition === "failure" ||
          item.disposition === "recovery" ||
          item.disposition === "nogo",
      );
    }
  });
});

describe("Forge Phase/Event Schema Property/Fuzz — P01-B04-A07", () => {
  it("passes structural property checks on canonical contract", () => {
    const contract = getActivePhaseEventSchemaContract();
    const result = runPhaseEventSchemaPropertyChecks(contract);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
  });

  it("rejects fuzz-mutated fixtures and corrupted run records", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const record = runPhaseEventSchemaProbesWithRecord();

    const fuzz = runPhaseEventSchemaFuzzValidation(fixture, contract, 42, 24);
    assert.equal(fuzz.allMutationsRejected, true);

    const runFuzz = runPhaseEventSchemaRunRecordFuzzValidation(record, contract);
    assert.equal(runFuzz.validBaseline, true);
    assert.equal(runFuzz.mutationsAccepted, 0);
    assert.equal(runFuzz.mutationsRejected, 3);
  });
});

describe("Forge Phase/Event Schema Regression — P01-B04-A08", () => {
  it("runForgePhaseEventSchemaRegressionGate passes on canonical phase/event schema matrix", () => {
    const result = runForgePhaseEventSchemaRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 35);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("35/35 probes aligned"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("detectPhaseEventSchemaProbeRegression flags newly misaligned probes", () => {
    const prior = runPhaseEventSchemaProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectPhaseEventSchemaProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgePhaseEventSchemaRegressionGate compares against prior record without false regression", () => {
    const prior = runPhaseEventSchemaProbesWithRecord();
    const result = runForgePhaseEventSchemaRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgePhaseEventSchemaRegression emits phase_event_schema_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-phase-event-schema-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "phase-event-schema" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgePhaseEventSchemaRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "phase_event_schema_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("35/35 probes aligned"));
    }
  });
});

function formatMismatchReport(mismatches: ReturnType<typeof runPhaseEventSchemaProbes>): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
