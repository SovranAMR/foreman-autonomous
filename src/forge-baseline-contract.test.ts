import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadForgeBaselineFixture } from "./forge-baseline-harness.js";
import {
  FORGE_BASELINE_CONTRACT_V1,
  FORGE_BASELINE_PATHS,
  getActiveForgeBaselineContract,
  getPathContract,
  listContractProbeIds,
  listProbesByDisposition,
  summarizeContractCoverage,
  validateFixtureAgainstContract,
  buildProbeEvidence,
  buildProbeTelemetry,
  buildBaselineProvenance,
  buildBaselineRunRecord,
  validateBaselineRunRecord,
} from "./forge-baseline-contract.js";

describe("Forge Baseline Contract — P01-B01-A02", () => {
  it("defines typed acceptance for all six path categories", () => {
    const contract = getActiveForgeBaselineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B01-A02");

    for (const path of FORGE_BASELINE_PATHS) {
      const pathContract = getPathContract(contract, path);
      assert.ok(pathContract.acceptance.invariant.length > 20, `${path} invariant too short`);
      assert.ok(pathContract.probes.length >= pathContract.acceptance.minProbeCount);
      assert.equal(pathContract.acceptance.requireFullAlignment, true);

      for (const probe of pathContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "happy" ||
            probe.disposition === "failure" ||
            probe.disposition === "recovery" ||
            probe.disposition === "nogo",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 27 probes with failure/recovery/NO-GO disposition coverage (P01-B01-A05)", () => {
    const summary = summarizeContractCoverage(FORGE_BASELINE_CONTRACT_V1);
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 27);
    assert.equal(summary.expectedFail, 0);
    assert.ok(summary.byDisposition.failure >= 5, "failure disposition probes required");
    assert.ok(summary.byDisposition.recovery >= 3, "recovery disposition probes required");
    assert.ok(summary.byDisposition.nogo >= 6, "NO-GO disposition probes required");
    assert.ok(summary.byDisposition.happy >= 8, "happy path probes retained");

    const failIds = new Set(
      FORGE_BASELINE_PATHS.flatMap(path =>
        FORGE_BASELINE_CONTRACT_V1.paths[path].probes
          .filter(p => p.expected === "FAIL")
          .map(p => p.id),
      ),
    );
    assert.deepEqual([...failIds], []);
  });

  it("lists failure, recovery and NO-GO probes by disposition", () => {
    const failure = listProbesByDisposition("failure");
    const recovery = listProbesByDisposition("recovery");
    const nogo = listProbesByDisposition("nogo");

    assert.ok(failure.some(p => p.id === "state.blocked_from_executing"));
    assert.ok(failure.some(p => p.id === "rollback.unknown_point_fails"));
    assert.ok(recovery.some(p => p.id === "state.recover_from_blocked"));
    assert.ok(recovery.some(p => p.id === "resume.corrupt_checkpoint_returns_null"));
    assert.ok(nogo.some(p => p.id === "reviewer.nogo_reject_verdict"));
    assert.ok(nogo.some(p => p.id === "reviewer.nogo_needs_revision"));
  });

  it("enforces fixture ↔ contract probe mapping", () => {
    const fixture = loadForgeBaselineFixture();
    const validation = validateFixtureAgainstContract(fixture);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.path}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listContractProbeIds(FORGE_BASELINE_CONTRACT_V1));
    const fixtureIds = FORGE_BASELINE_PATHS.flatMap(path =>
      fixture.paths[path].map(p => p.id),
    );
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
  });

  it("each path probe id is globally unique", () => {
    const ids = listContractProbeIds(FORGE_BASELINE_CONTRACT_V1);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("Forge Baseline Evidence — P01-B01-A06", () => {
  it("builds typed probe evidence with disposition and criterion", () => {
    const evidence = buildProbeEvidence(
      "state.valid_pipeline_chain",
      "state",
      "PASS",
      "PASS",
      true,
      "idle→complete succeeds",
      "final=complete",
      "happy",
      "2026-07-18T21:00:00.000Z",
    );
    assert.equal(evidence.probeId, "state.valid_pipeline_chain");
    assert.equal(evidence.disposition, "happy");
    assert.equal(evidence.aligned, true);
    assert.equal(evidence.recordedAt, "2026-07-18T21:00:00.000Z");
  });

  it("builds telemetry with non-negative duration and sequence index", () => {
    const telemetry = buildProbeTelemetry("tool.unknown_tool_errors", "tool", 3, 12.5);
    assert.equal(telemetry.sequenceIndex, 3);
    assert.equal(telemetry.durationMs, 12.5);
    assert.equal(telemetry.path, "tool");
  });

  it("validates complete run record against contract probe count", () => {
    const fixture = loadForgeBaselineFixture();
    const contract = getActiveForgeBaselineContract();
    const probeIds = listContractProbeIds(contract);
    const startedAt = "2026-07-18T21:00:00.000Z";
    const completedAt = "2026-07-18T21:00:01.000Z";

    const evidence = probeIds.map((id, index) => {
      const path = FORGE_BASELINE_PATHS.find(p =>
        contract.paths[p].probes.some(probe => probe.id === id),
      )!;
      const probe = contract.paths[path].probes.find(p => p.id === id)!;
      return buildProbeEvidence(
        id,
        path,
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
      const path = FORGE_BASELINE_PATHS.find(p =>
        contract.paths[p].probes.some(probe => probe.id === id),
      )!;
      return buildProbeTelemetry(id, path, index, index * 0.1);
    });

    const provenance = buildBaselineProvenance(
      "test-run-id",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      "abc1234",
    );

    const record = buildBaselineRunRecord(provenance, evidence, telemetry);
    const validation = validateBaselineRunRecord(record, contract);

    assert.equal(record.summary.total, 27);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 5);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
  });
});
