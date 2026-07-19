import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherBenchmarkPriorArtBaseline,
  runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord,
} from "./forge-p04-researcher-benchmark-prior-art.js";
import {
  FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1,
  buildResearcherBenchmarkPriorArtProbeEvidence,
  buildResearcherBenchmarkPriorArtProbeTelemetry,
  buildResearcherBenchmarkPriorArtProvenance,
  buildResearcherBenchmarkPriorArtRunRecord,
  createResearcherBenchmarkPriorArtFuzzRng,
  getActiveResearcherBenchmarkPriorArtContract,
  listResearcherBenchmarkPriorArtContractProbeIds,
  runResearcherBenchmarkPriorArtFuzzValidation,
  runResearcherBenchmarkPriorArtPropertyFuzzSlice,
  runResearcherBenchmarkPriorArtPropertyValidation,
  runResearcherBenchmarkPriorArtRunRecordFuzzValidation,
  validateResearcherBenchmarkPriorArtEvidenceRunRecord,
  validateResearcherBenchmarkPriorArtRunRecord,
} from "./forge-p04-researcher-benchmark-prior-art.js";

describe("Forge Researcher Benchmark Prior-Art — P04-B04-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runResearcherBenchmarkPriorArtPropertyValidation(
      FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createResearcherBenchmarkPriorArtFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createResearcherBenchmarkPriorArtFuzzRng(1337);
    const rngB = createResearcherBenchmarkPriorArtFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createResearcherBenchmarkPriorArtFuzzRng(1338)()),
    );
  });
});

describe("Forge Researcher Benchmark Prior-Art — P04-B04-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadResearcherBenchmarkPriorArtBaseline();
    const contract = getActiveResearcherBenchmarkPriorArtContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runResearcherBenchmarkPriorArtFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Researcher Benchmark Prior-Art — P04-B04-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const record = runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord();

    assert.equal(
      validateResearcherBenchmarkPriorArtEvidenceRunRecord(record, contract).valid,
      true,
      validateResearcherBenchmarkPriorArtEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runResearcherBenchmarkPriorArtRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const fixture = loadResearcherBenchmarkPriorArtBaseline();
    const probeIds = listResearcherBenchmarkPriorArtContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherBenchmarkPriorArtProbeEvidence(
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
      return buildResearcherBenchmarkPriorArtProbeTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildResearcherBenchmarkPriorArtProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildResearcherBenchmarkPriorArtRunRecord(provenance, evidence, telemetry);

    assert.equal(validateResearcherBenchmarkPriorArtRunRecord(record, contract).valid, true);

    const fuzz = runResearcherBenchmarkPriorArtRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Researcher Benchmark Prior-Art Property/Fuzz Slice — P04-B04-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runResearcherBenchmarkPriorArtPropertyFuzzSlice();

    assert.equal(slice.atom, "P04-B04-A07");
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
