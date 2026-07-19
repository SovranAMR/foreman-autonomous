import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherInRepoEvidenceBaseline,
  runResearcherInRepoEvidenceFailureRecoverySliceWithRecord,
} from "./forge-p04-researcher-in-repo-evidence.js";
import {
  FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1,
  buildResearcherInRepoEvidenceProbeEvidence,
  buildResearcherInRepoEvidenceProbeTelemetry,
  buildResearcherInRepoEvidenceProvenance,
  buildResearcherInRepoEvidenceRunRecord,
  createResearcherInRepoEvidenceFuzzRng,
  getActiveResearcherInRepoEvidenceContract,
  listResearcherInRepoEvidenceContractProbeIds,
  runResearcherInRepoEvidenceFuzzValidation,
  runResearcherInRepoEvidencePropertyChecks,
  runResearcherInRepoEvidencePropertyFuzzSlice,
  runResearcherInRepoEvidenceRunRecordFuzzValidation,
  validateResearcherInRepoEvidenceEvidenceRunRecord,
  validateResearcherInRepoEvidenceRunRecord,
} from "./forge-p04-researcher-in-repo-evidence.js";

describe("Forge Researcher In-Repo Evidence — P04-B02-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runResearcherInRepoEvidencePropertyChecks(
      FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createResearcherInRepoEvidenceFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createResearcherInRepoEvidenceFuzzRng(1337);
    const rngB = createResearcherInRepoEvidenceFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createResearcherInRepoEvidenceFuzzRng(1338)()),
    );
  });
});

describe("Forge Researcher In-Repo Evidence — P04-B02-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const contract = getActiveResearcherInRepoEvidenceContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runResearcherInRepoEvidenceFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Researcher In-Repo Evidence — P04-B02-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const record = runResearcherInRepoEvidenceFailureRecoverySliceWithRecord();

    assert.equal(
      validateResearcherInRepoEvidenceEvidenceRunRecord(record, contract).valid,
      true,
      validateResearcherInRepoEvidenceEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runResearcherInRepoEvidenceRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const probeIds = listResearcherInRepoEvidenceContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherInRepoEvidenceProbeEvidence(
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
      return buildResearcherInRepoEvidenceProbeTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildResearcherInRepoEvidenceProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildResearcherInRepoEvidenceRunRecord(provenance, evidence, telemetry);

    assert.equal(validateResearcherInRepoEvidenceRunRecord(record, contract).valid, true);

    const fuzz = runResearcherInRepoEvidenceRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Researcher In-Repo Evidence Property/Fuzz Slice — P04-B02-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runResearcherInRepoEvidencePropertyFuzzSlice();

    assert.equal(slice.atom, "P04-B02-A07");
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
