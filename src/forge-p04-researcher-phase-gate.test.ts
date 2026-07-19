import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherPhaseGateBaseline,
  runResearcherPhaseGateProbes,
  runResearcherPhaseGateProductionSlice,
  runResearcherPhaseGateBoundarySlice,
  runResearcherPhaseGateFailureRecoverySlice,
  runResearcherPhaseGateEvidenceSlice,
  runResearcherPhaseGateFailureRecoverySliceWithRecord,
} from "./forge-p04-researcher-phase-gate.probe.js";
import {
  getActiveResearcherPhaseGateContract,
  getForgeP04ToP05PhaseHandoff,
  listResearcherPhaseGateContractProbesByCategory,
  validateP04PhaseHandoffContract,
  validateResearcherPhaseGateProbeMatrix,
  validateResearcherPhaseGateBoundaryProbeMatrix,
  validateResearcherPhaseGateFailureRecoveryProbeMatrix,
  listResearcherPhaseGateFailureRecoveryProbeIds,
  RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
  recoverResearcherPhaseGateEvidence,
  assessResearcherPhaseGateInputBoundary,
  buildP04ResearcherPhaseGateEvidence,
  validateResearcherPhaseGateBaseline,
  validateForgeP04ResearcherPhaseGateEvidence,
  buildResearcherPhaseGateProbeEvidence,
  buildResearcherPhaseGateProbeTelemetry,
  buildResearcherPhaseGateProvenance,
  buildResearcherPhaseGateRunRecord,
  validateResearcherPhaseGateEvidenceRunRecord,
  FORGE_RESEARCHER_PHASE_GATE_VERSION,
  P04_RESEARCHER_PHASE_BLOCK_COUNT,
  P04_RESEARCHER_PHASE_BLOCK_INVENTORY,
  P05_WORKER_PHASE_ID,
} from "./forge-p04-researcher-phase-gate.js";

describe("Forge Researcher Phase Gate Production Slice — P04-B10-A03", () => {
  it("getForgeP04ToP05PhaseHandoff exports sealed P04→P05 phase handoff contract", () => {
    const handoff = getForgeP04ToP05PhaseHandoff();

    assert.equal(handoff.version, "1.0.0");
    assert.equal(handoff.atom, "P04-PHASE-GATE");
    assert.equal(handoff.targetPhase.phaseId, P05_WORKER_PHASE_ID);
    assert.equal(handoff.targetPhase.entryAtom, "P05-B01-A01");
    assert.equal(handoff.sealedArtifacts.blockGateMethod, "verifyForgeResearcherResearchToWorkerHandoffBlockGate");
    assert.equal(handoff.sealedArtifacts.phaseGateMethod, "verifyForgeP04ResearcherPhaseGate");
    assert.equal(handoff.sourcePhase.completedBlocks.length, P04_RESEARCHER_PHASE_BLOCK_COUNT);
  });

  it("validateP04PhaseHandoffContract accepts complete phase gate evidence", () => {
    const handoff = getForgeP04ToP05PhaseHandoff();
    const evidence = buildP04ResearcherPhaseGateEvidence(
      P04_RESEARCHER_PHASE_BLOCK_INVENTORY.map(block => ({
        blockId: block.blockId,
        title: block.title,
        runner: block.runner,
        passed: true,
        atomSealCount: 10,
        detail: "mock seal",
      })),
      true,
      true,
    );

    const validation = validateP04PhaseHandoffContract(handoff, evidence);
    assert.equal(validation.valid, true, validation.issues.join("\n"));
  });

  it("recoverResearcherPhaseGateEvidence restructures malformed block seal manifest", () => {
    const malformed = `block gates incomplete
P04-B01: PASS atoms=10
P04-B02: pass atoms=10
handoff regression: pass
handoff: valid`;
    const recovery = recoverResearcherPhaseGateEvidence(malformed, {
      handoffRegressionPassed: true,
      handoffValid: true,
    });

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(recovery.blockSeals.length, P04_RESEARCHER_PHASE_BLOCK_COUNT);
    assert.equal(recovery.handoffRegressionPassed, true);
    assert.equal(recovery.handoffValid, true);
    assert.ok(recovery.blockSeals.every(seal => seal.passed));
  });

  it("recoverResearcherPhaseGateEvidence rejects null-byte manifest safely", () => {
    const recovery = recoverResearcherPhaseGateEvidence("manifest\0corrupt");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_manifest"]);
  });

  it("assessResearcherPhaseGateInputBoundary handles empty and whitespace-only manifest", () => {
    const empty = assessResearcherPhaseGateInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessResearcherPhaseGateInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const slice = runResearcherPhaseGateProductionSlice();

    assert.equal(slice.atom, "P04-B10-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 24);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 24);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const matrixValidation = validateResearcherPhaseGateProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("baseline fixture aligns with post-A03 contract with zero FAIL gaps", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const failProbes = fixture.probes.filter(p => p.expected === "FAIL");
    assert.equal(failProbes.length, 0);
    assert.equal(runResearcherPhaseGateProbes(fixture).every(r => r.aligned), true);
  });
});

describe("Forge Researcher Phase Gate Boundary Slice — P04-B10-A04", () => {
  it("defines six boundary probes with manifest input edge-case criteria", () => {
    const boundary = listResearcherPhaseGateContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rpg.empty_manifest_boundary",
      "rpg.known_gaps_documented",
      "rpg.long_manifest_truncation_boundary",
      "rpg.probe_runner_exported",
      "rpg.source_block_gate_ref",
      "rpg.whitespace_manifest_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on manifest edge probes", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const slice = runResearcherPhaseGateBoundarySlice();

    assert.equal(slice.atom, "P04-B10-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherPhaseGateContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherPhaseGateBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("assessResearcherPhaseGateInputBoundary and recoverResearcherPhaseGateEvidence reject invalid boundary inputs", () => {
    const empty = assessResearcherPhaseGateInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessResearcherPhaseGateInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessResearcherPhaseGateInputBoundary("manifest\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");

    const whitespaceRecovery = recoverResearcherPhaseGateEvidence("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_manifest"]);
  });
});

describe("Forge Researcher Phase Gate Failure/Recovery Slice — P04-B10-A05", () => {
  it("defines seven failure/recovery/NO-GO probes across guard-path categories", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const failure = listResearcherPhaseGateContractProbesByCategory("failure_path", contract);
    const recovery = listResearcherPhaseGateContractProbesByCategory("recovery_path", contract);
    const nogo = listResearcherPhaseGateContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 3);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches on guard-path probes", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const slice = runResearcherPhaseGateFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B10-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherPhaseGateContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherPhaseGateFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with evidence validators and orchestrator wiring", () => {
    const slice = runResearcherPhaseGateFailureRecoverySlice();
    const probeIds = listResearcherPhaseGateFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rpg.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const incompleteEvidence = slice.failureRecoveryResults.find(
      r => r.id === "rpg.incomplete_block_inventory_rejected",
    );
    assert.ok(incompleteEvidence);
    assert.equal(incompleteEvidence!.expected, "PASS");
    assert.equal(incompleteEvidence!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "rpg.structured_phase_gate_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const failedSeals = slice.failureRecoveryResults.find(r => r.id === "rpg.phase_gate_evidence_nogo");
    assert.ok(failedSeals);
    assert.equal(failedSeals!.expected, "PASS");
    assert.equal(failedSeals!.actual, "PASS");

    const invalidFixture = { ...loadResearcherPhaseGateBaseline(), version: "9.9.9" };
    assert.equal(validateResearcherPhaseGateBaseline(invalidFixture).valid, false);

    const incompleteEvidenceObj = buildP04ResearcherPhaseGateEvidence(
      P04_RESEARCHER_PHASE_BLOCK_INVENTORY.slice(0, 9).map(block => ({
        blockId: block.blockId,
        title: block.title,
        runner: block.runner,
        passed: true,
        atomSealCount: 10,
        detail: "mock seal",
      })),
      true,
      true,
    );
    assert.equal(validateForgeP04ResearcherPhaseGateEvidence(incompleteEvidenceObj).valid, false);

    const malformed = `block gates incomplete
P04-B01: PASS atoms=10
handoff regression: pass
handoff: valid`;
    const recovery = recoverResearcherPhaseGateEvidence(malformed, {
      handoffRegressionPassed: true,
      handoffValid: true,
    });
    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(validateForgeP04ResearcherPhaseGateEvidence(recovery.evidence).valid, true);

    const handoff = getForgeP04ToP05PhaseHandoff();
    assert.equal(handoff.targetPhase.entryAtom, "P05-B01-A01");
  });
});

describe("Forge Researcher Phase Gate Evidence — P04-B10-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();
    const probeIds = listResearcherPhaseGateFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherPhaseGateProbeEvidence(
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
      return buildResearcherPhaseGateProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherPhaseGateProvenance(
      "run-rpg-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B10-A06",
        sliceCategories: RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherPhaseGateRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherPhaseGateEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 3);
    assert.ok(record.summary.byCategory.nogo_path >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const slice = runResearcherPhaseGateEvidenceSlice();

    assert.equal(slice.atom, "P04-B10-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of RESEARCHER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherPhaseGateContractProbesByCategory(category, contract)) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.totalProbes, 7);
    assert.equal(record.provenance.sliceAtom, "P04-B10-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_PHASE_GATE_VERSION);
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
      assert.ok(item.recordedAt.length > 10);
    }

    const structuredRecovery = record.evidence.find(
      e => e.probeId === "rpg.structured_phase_gate_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.aligned, true);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");
    assert.equal(structuredRecovery!.disposition, "recovery");
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const record = runResearcherPhaseGateFailureRecoverySliceWithRecord();
    const validation = validateResearcherPhaseGateEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 7);
    assert.equal(record.provenance.sliceAtom, "P04-B10-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
