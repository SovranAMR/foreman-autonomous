import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerGitWorktreeBaseline,
  runWorkerGitWorktreeProbes,
  getActiveWorkerGitWorktreeContract,
  getWorkerGitWorktreeCategoryContract,
  listWorkerGitWorktreeContractProbeIds,
  listWorkerGitWorktreeContractProbesByCategory,
  listWorkerGitWorktreeProbesByDisposition,
  summarizeWorkerGitWorktreeContractCoverage,
  validateWorkerGitWorktreeContract,
  validateWorkerGitWorktreeContractCoverage,
  validateWorkerGitWorktreeAgainstContract,
  WORKER_GIT_WORKTREE_CATEGORIES,
  FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1,
  FORGE_WORKER_GIT_WORKTREE_VERSION,
} from "./forge-p05-worker-git-worktree.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof WORKER_GIT_WORKTREE_CATEGORIES)[number],
  boolean
> = {
  git_versioning: true,
  git_signal: false,
  worktree_signal: false,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Worker Git Worktree Contract — P05-B05-A02", () => {
  it("defines typed acceptance for all eight worker git worktree categories", () => {
    const contract = getActiveWorkerGitWorktreeContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P05-B05-A02");

    for (const category of WORKER_GIT_WORKTREE_CATEGORIES) {
      const categoryContract = getWorkerGitWorktreeCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(
        categoryContract.acceptance.requireFullAlignment,
        REQUIRE_FULL_ALIGNMENT[category],
      );

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

  it("maps 27 probes with one documented FAIL gap after A05 failure/recovery slice", () => {
    const contract = getActiveWorkerGitWorktreeContract();
    const summary = summarizeWorkerGitWorktreeContractCoverage(contract);
    const coverage = validateWorkerGitWorktreeContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateWorkerGitWorktreeContract().valid, true);
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 26);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 22);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.git_versioning.probeCount, 3);
    assert.equal(summary.byCategory.git_signal.probeCount, 4);
    assert.equal(summary.byCategory.worktree_signal.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists one remaining gap probe after A05 NO-GO slice", () => {
    const gaps = listWorkerGitWorktreeProbesByDisposition("gap");
    assert.equal(gaps.length, 1);
    assert.deepEqual(
      gaps.map(p => p.id).sort(),
      ["wgt.worktree_transaction_engine"],
    );
    assert.ok(gaps.every(probe => probe.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadWorkerGitWorktreeBaseline();
    const contract = getActiveWorkerGitWorktreeContract();
    const validation = validateWorkerGitWorktreeAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listWorkerGitWorktreeContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each worker git worktree probe id is globally unique", () => {
    const ids = listWorkerGitWorktreeContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runWorkerGitWorktreeProbes();
    const contract = getActiveWorkerGitWorktreeContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveWorkerGitWorktreeContract();
    const flatIds = listWorkerGitWorktreeContractProbeIds(contract);
    const categoryIds = WORKER_GIT_WORKTREE_CATEGORIES.flatMap(category =>
      listWorkerGitWorktreeContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference aligned with baseline probe matrix", () => {
    const fixture = loadWorkerGitWorktreeBaseline();
    const contract = getActiveWorkerGitWorktreeContract();
    assert.equal(FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1.atom, "P05-B05-A02");
    assert.equal(FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1.probes.length, 27);
    assert.equal(FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1.probes.length, fixture.probes.length);
    assert.equal(FORGE_WORKER_GIT_WORKTREE_VERSION, "1.0.0-a05");
    assert.equal(contract.version, FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1.version);
  });
});
