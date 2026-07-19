import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherSpikeFalsificationBaseline,
  runResearcherSpikeFalsificationFailureRecoverySliceWithRecord,
} from "./forge-p04-researcher-spike-falsification.js";
import {
  FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1,
  buildResearcherSpikeFalsificationProbeEvidence,
  buildResearcherSpikeFalsificationProbeTelemetry,
  buildResearcherSpikeFalsificationProvenance,
  buildResearcherSpikeFalsificationRunRecord,
  createResearcherSpikeFalsificationFuzzRng,
  getActiveResearcherSpikeFalsificationContract,
  listResearcherSpikeFalsificationContractProbeIds,
  runResearcherSpikeFalsificationFuzzValidation,
  runResearcherSpikeFalsificationPropertyFuzzSlice,
  runResearcherSpikeFalsificationPropertyValidation,
  runResearcherSpikeFalsificationRunRecordFuzzValidation,
  validateResearcherSpikeFalsificationEvidenceRunRecord,
  validateResearcherSpikeFalsificationRunRecord,
} from "./forge-p04-researcher-spike-falsification.js";

describe("Forge Researcher Spike Falsification — P04-B08-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runResearcherSpikeFalsificationPropertyValidation(
      FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createResearcherSpikeFalsificationFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createResearcherSpikeFalsificationFuzzRng(1337);
    const rngB = createResearcherSpikeFalsificationFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createResearcherSpikeFalsificationFuzzRng(1338)()),
    );
  });
});

describe("Forge Researcher Spike Falsification — P04-B08-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const contract = getActiveResearcherSpikeFalsificationContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runResearcherSpikeFalsificationFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Researcher Spike Falsification — P04-B08-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const record = runResearcherSpikeFalsificationFailureRecoverySliceWithRecord();

    assert.equal(
      validateResearcherSpikeFalsificationEvidenceRunRecord(record, contract).valid,
      true,
      validateResearcherSpikeFalsificationEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runResearcherSpikeFalsificationRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const probeIds = listResearcherSpikeFalsificationContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherSpikeFalsificationProbeEvidence(
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
      return buildResearcherSpikeFalsificationProbeTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildResearcherSpikeFalsificationProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildResearcherSpikeFalsificationRunRecord(provenance, evidence, telemetry);

    assert.equal(validateResearcherSpikeFalsificationRunRecord(record, contract).valid, true);

    const fuzz = runResearcherSpikeFalsificationRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Researcher Spike Falsification Property/Fuzz Slice — P04-B08-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runResearcherSpikeFalsificationPropertyFuzzSlice();

    assert.equal(slice.atom, "P04-B08-A07");
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
