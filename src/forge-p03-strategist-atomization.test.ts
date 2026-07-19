import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistAtomizationBaseline,
  getActiveStrategistAtomizationContract,
  getStrategistAtomizationCategoryContract,
  listStrategistAtomizationContractProbeIds,
  listStrategistAtomizationContractProbesByCategory,
  listStrategistAtomizationProbesByDisposition,
  summarizeStrategistAtomizationCoverage,
  validateStrategistAtomizationCoverage,
  validateStrategistAtomizationAgainstContract,
  recoverStrategistAtomize,
  assessStrategistAtomizeInputBoundary,
  runStrategistAtomizationProductionSlice,
  runStrategistAtomizationBoundarySlice,
  runStrategistAtomizationFailureRecoverySlice,
  validateStrategistAtomizationBoundaryProbeMatrix,
  validateStrategistAtomizationFailureRecoveryProbeMatrix,
  listStrategistAtomizationFailureRecoveryProbeIds,
  STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES,
  validateStrategistAtomizationProbeMatrix,
  STRATEGIST_ATOMIZE_MAX_LENGTH,
  STRATEGIST_ATOMIZATION_CATEGORIES,
  FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1,
} from "./forge-p03-strategist-atomization.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Atomization Contract — P03-B03-A02", () => {
  it("defines typed acceptance for all eight atomization categories", () => {
    const contract = getActiveStrategistAtomizationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B03-A06");

    for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
      const categoryContract = getStrategistAtomizationCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

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

  it("maps 24 probes with zero documented FAIL gaps after A04 boundary slice", () => {
    const contract = getActiveStrategistAtomizationContract();
    const summary = summarizeStrategistAtomizationCoverage(contract);
    const coverage = validateStrategistAtomizationCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 24);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 18);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.atom_versioning.probeCount, 3);
    assert.equal(summary.byCategory.atom_structure.probeCount, 3);
    assert.equal(summary.byCategory.atom_sizing.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero gap probes after structured atom recovery slice", () => {
    const gaps = listStrategistAtomizationProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const validation = validateStrategistAtomizationAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistAtomizationContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.probes.length, 24);
  });

  it("each atomization probe id is globally unique", () => {
    const ids = listStrategistAtomizationContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistAtomizationContract();
    const flatIds = listStrategistAtomizationContractProbeIds(contract);
    const categoryIds = STRATEGIST_ATOMIZATION_CATEGORIES.flatMap(category =>
      listStrategistAtomizationContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Strategist Atomization Production Slice — P03-B03-A03", () => {
  it("recoverStrategistAtomize restructures malformed atomize parse into contract-compliant plan", () => {
    const malformed = `REASONING: Need atom production plan
Here are the steps:
1. Setup atomization types
2. Wire atomize production seam
3. Add atomization baseline tests
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistAtomize(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.contractCompliant, true);
    assert.ok(recovery.atomCount >= 3);
    assert.match(recovery.composedAtomize, /OUTPUT:/);
    assert.ok(recovery.atoms.some(atom => atom.includes("atomization types")));
    assert.ok(recovery.atoms.some(atom => atom.includes("atomize production seam")));
    assert.ok(recovery.atoms.some(atom => atom.includes("atomization baseline")));
  });

  it("recoverStrategistAtomize rejects null-byte atomize output safely", () => {
    const recovery = recoverStrategistAtomize("atomize\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.contractCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_atomize"]);
  });

  it("assessStrategistAtomizeInputBoundary handles atomize edge cases", () => {
    const empty = assessStrategistAtomizeInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistAtomizeInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistAtomizeInputBoundary("bad\0atomize");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistAtomizeInputBoundary("OUTPUT:\n1. valid atom task\nCONFIDENCE: 0.8");
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationProductionSlice();

    assert.equal(slice.atom, "P03-B03-A03");
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

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistAtomizationProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "satom.structured_atom_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Strategist Atomization Boundary Slice — P03-B03-A04", () => {
  it("assessStrategistAtomizeInputBoundary handles atomize edge cases including truncation", () => {
    const empty = assessStrategistAtomizeInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistAtomizeInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistAtomizeInputBoundary("bad\0atomize");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistAtomizeInputBoundary("OUTPUT:\n1. valid atom task\nCONFIDENCE: 0.8");
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longAtomize = "x".repeat(STRATEGIST_ATOMIZE_MAX_LENGTH + 500);
    const truncated = assessStrategistAtomizeInputBoundary(longAtomize);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedAtomize.length, STRATEGIST_ATOMIZE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with atomize input edge-case probes", () => {
    const boundary = listStrategistAtomizationContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "satom.atom_cap_boundary",
      "satom.empty_atomize_boundary",
      "satom.known_gaps_documented",
      "satom.long_atomize_truncation_boundary",
      "satom.probe_runner_exported",
      "satom.source_block_gate_ref",
      "satom.whitespace_atomize_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationBoundarySlice();

    assert.equal(slice.atom, "P03-B03-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistAtomizationContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistAtomizationBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Atomization Failure/Recovery Slice — P03-B03-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistAtomizationContract();
    const failure = listStrategistAtomizationContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistAtomizationContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistAtomizationContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B03-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistAtomizationContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistAtomizationFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO atomization paths", () => {
    const slice = runStrategistAtomizationFailureRecoverySlice();
    const probeIds = listStrategistAtomizationFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "satom.malformed_atomize_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const recoveryProbe = slice.failureRecoveryResults.find(
      r => r.id === "satom.structured_atom_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");

    const zeroAtomsNogo = slice.failureRecoveryResults.find(
      r => r.id === "satom.orchestrator_zero_atoms_skip",
    );
    assert.ok(zeroAtomsNogo);
    assert.equal(zeroAtomsNogo!.expected, "PASS");
    assert.equal(zeroAtomsNogo!.actual, "PASS");
  });
});
