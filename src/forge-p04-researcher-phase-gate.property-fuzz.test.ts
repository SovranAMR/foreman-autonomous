import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherPhaseGateBaseline,
  FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1,
  buildResearcherPhaseGateProbeEvidence,
  buildResearcherPhaseGateProbeTelemetry,
  buildResearcherPhaseGateProvenance,
  buildResearcherPhaseGateRunRecord,
  createResearcherPhaseGateFuzzRng,
  getActiveResearcherPhaseGateContract,
  listResearcherPhaseGateContractProbeIds,
  runResearcherPhaseGateFuzzValidation,
  runResearcherPhaseGatePropertyFuzzSlice,
  runResearcherPhaseGatePropertyValidation,
  runResearcherPhaseGateRunRecordFuzzValidation,
  validateResearcherPhaseGateEvidenceRunRecord,
  validateResearcherPhaseGateRunRecord,
} from "./forge-p04-researcher-phase-gate.js";
import { runResearcherPhaseGateFailureRecoverySliceWithRecord } from "./forge-p04-researcher-phase-gate.probe.js";

describe("Forge Researcher Phase Gate — P04-B10-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runResearcherPhaseGatePropertyValidation(
      FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createResearcherPhaseGateFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createResearcherPhaseGateFuzzRng(1337);
    const rngB = createResearcherPhaseGateFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createResearcherPhaseGateFuzzRng(1338)()),
    );
  });
});

describe("Forge Researcher Phase Gate — P04-B10-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runResearcherPhaseGateFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(
          item.valid,
          false,
          `${item.mutation.kind}@${item.mutation.probeId} should fail`,
        );
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });
});

describe("Forge Researcher Phase Gate — P04-B10-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const record = runResearcherPhaseGateFailureRecoverySliceWithRecord();

    assert.equal(
      validateResearcherPhaseGateEvidenceRunRecord(record, contract).valid,
      true,
      validateResearcherPhaseGateEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runResearcherPhaseGateRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const fixture = loadResearcherPhaseGateBaseline();
    const probeIds = listResearcherPhaseGateContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherPhaseGateProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "synthetic",
        probe.disposition,
        startedAt,
      );
    });

    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherPhaseGateProbeTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildResearcherPhaseGateProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildResearcherPhaseGateRunRecord(provenance, evidence, telemetry);

    assert.equal(validateResearcherPhaseGateRunRecord(record, contract).valid, true);

    const fuzz = runResearcherPhaseGateRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Researcher Phase Gate Property/Fuzz Slice — P04-B10-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runResearcherPhaseGatePropertyFuzzSlice();

    assert.equal(slice.atom, "P04-B10-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.propertyResult.total, 8);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.validBaseline, true);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsRejected, 5);
  });
});
