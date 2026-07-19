import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherWebPrimarySourceBaseline,
  runResearcherWebPrimarySourceFailureRecoverySliceWithRecord,
} from "./forge-p04-researcher-web-primary-source.js";
import {
  FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1,
  buildResearcherWebPrimarySourceProbeEvidence,
  buildResearcherWebPrimarySourceProbeTelemetry,
  buildResearcherWebPrimarySourceProvenance,
  buildResearcherWebPrimarySourceRunRecord,
  createResearcherWebPrimarySourceFuzzRng,
  getActiveResearcherWebPrimarySourceContract,
  listResearcherWebPrimarySourceContractProbeIds,
  runResearcherWebPrimarySourceFuzzValidation,
  runResearcherWebPrimarySourcePropertyChecks,
  runResearcherWebPrimarySourcePropertyFuzzSlice,
  runResearcherWebPrimarySourceRunRecordFuzzValidation,
  validateResearcherWebPrimarySourceEvidenceRunRecord,
  validateResearcherWebPrimarySourceRunRecord,
} from "./forge-p04-researcher-web-primary-source.js";

describe("Forge Researcher Web Primary-Source — P04-B03-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runResearcherWebPrimarySourcePropertyChecks(
      FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createResearcherWebPrimarySourceFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createResearcherWebPrimarySourceFuzzRng(1337);
    const rngB = createResearcherWebPrimarySourceFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createResearcherWebPrimarySourceFuzzRng(1338)()),
    );
  });
});

describe("Forge Researcher Web Primary-Source — P04-B03-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const contract = getActiveResearcherWebPrimarySourceContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runResearcherWebPrimarySourceFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Researcher Web Primary-Source — P04-B03-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const record = runResearcherWebPrimarySourceFailureRecoverySliceWithRecord();

    assert.equal(
      validateResearcherWebPrimarySourceEvidenceRunRecord(record, contract).valid,
      true,
      validateResearcherWebPrimarySourceEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runResearcherWebPrimarySourceRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const probeIds = listResearcherWebPrimarySourceContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherWebPrimarySourceProbeEvidence(
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
      return buildResearcherWebPrimarySourceProbeTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildResearcherWebPrimarySourceProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildResearcherWebPrimarySourceRunRecord(provenance, evidence, telemetry);

    assert.equal(validateResearcherWebPrimarySourceRunRecord(record, contract).valid, true);

    const fuzz = runResearcherWebPrimarySourceRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Researcher Web Primary-Source Property/Fuzz Slice — P04-B03-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runResearcherWebPrimarySourcePropertyFuzzSlice();

    assert.equal(slice.atom, "P04-B03-A07");
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
