import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadForgeBaselineFixture } from "./forge-baseline-harness.js";
import {
  FORGE_BASELINE_CONTRACT_V1,
  buildBaselineProvenance,
  buildBaselineRunRecord,
  buildProbeEvidence,
  buildProbeTelemetry,
  createFuzzRng,
  getActiveForgeBaselineContract,
  listContractProbeIds,
  runContractFuzzValidation,
  runContractPropertyChecks,
  runRunRecordFuzzValidation,
  validateBaselineRunRecord,
} from "./forge-baseline-contract.js";

describe("Forge Baseline Contract — P01-B01-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runContractPropertyChecks(FORGE_BASELINE_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.ok(result.total >= 7);
  });

  it("createFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createFuzzRng(1337);
    const rngB = createFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createFuzzRng(1338)()));
  });
});

describe("Forge Baseline Contract — P01-B01-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadForgeBaselineFixture();
    const contract = getActiveForgeBaselineContract();

    for (const seed of [42, 99, 20260718]) {
      const fuzz = runContractFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(item.valid, false, `${item.mutation.kind}@${item.mutation.probeId} should fail`);
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });
});

describe("Forge Baseline Contract — P01-B01-A07 run record fuzz validation", () => {
  it("accepts valid baseline record and rejects corrupted mutations", () => {
    const fixture = loadForgeBaselineFixture();
    const contract = getActiveForgeBaselineContract();
    const probeIds = listContractProbeIds(contract);
    const startedAt = "2026-07-18T22:00:00.000Z";
    const completedAt = "2026-07-18T22:00:01.000Z";

    const evidence = probeIds.map(id => {
      const resolvedPath = (["state", "tool", "verification", "reviewer", "rollback", "resume"] as const).find(p =>
        contract.paths[p].probes.some(probe => probe.id === id),
      )!;
      const probe = contract.paths[resolvedPath].probes.find(p => p.id === id)!;
      return buildProbeEvidence(
        id,
        resolvedPath,
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
      const resolvedPath = (["state", "tool", "verification", "reviewer", "rollback", "resume"] as const).find(p =>
        contract.paths[p].probes.some(probe => probe.id === id),
      )!;
      return buildProbeTelemetry(id, resolvedPath, index, index * 0.05);
    });

    const provenance = buildBaselineProvenance(
      "property-fuzz-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildBaselineRunRecord(provenance, evidence, telemetry);

    assert.equal(validateBaselineRunRecord(record, contract).valid, true);

    const fuzz = runRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
