import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadForgeBaselineFixture } from "./forge-baseline-harness.js";
import {
  FORGE_BASELINE_CONTRACT_V1,
  FORGE_BASELINE_PATHS,
  getActiveForgeBaselineContract,
  getPathContract,
  listContractProbeIds,
  summarizeContractCoverage,
  validateFixtureAgainstContract,
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
      }
    }
  });

  it("maps 20 probes with 18 expected PASS and 2 documented FAIL gaps", () => {
    const summary = summarizeContractCoverage(FORGE_BASELINE_CONTRACT_V1);
    assert.equal(summary.totalProbes, 20);
    assert.equal(summary.expectedPass, 18);
    assert.equal(summary.expectedFail, 2);

    const failIds = new Set(
      FORGE_BASELINE_PATHS.flatMap(path =>
        FORGE_BASELINE_CONTRACT_V1.paths[path].probes
          .filter(p => p.expected === "FAIL")
          .map(p => p.id),
      ),
    );
    assert.deepEqual([...failIds].sort(), [
      "reviewer.empty_llm_response_passes",
      "rollback.point_without_git",
    ]);
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
