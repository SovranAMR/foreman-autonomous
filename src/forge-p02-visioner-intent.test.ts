import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerIntentBaseline,
  runVisionerIntentProbes,
  runVisionerIntentProductionSlice,
  runVisionerIntentBoundarySlice,
  runVisionerIntentFailureRecoverySlice,
  runVisionerIntentFailureRecoverySliceWithRecord,
  runVisionerIntentProbesWithRecord,
} from "./forge-p02-visioner-intent.probe.js";
import {
  getActiveVisionerIntentContract,
  getVisionerIntentCategoryContract,
  listVisionerIntentContractProbeIds,
  listVisionerIntentContractProbesByCategory,
  listVisionerIntentFailureRecoveryProbeIds,
  listVisionerIntentProbesByDisposition,
  summarizeVisionerIntentContractCoverage,
  validateVisionerIntentContractCoverage,
  validateVisionerIntentAgainstContract,
  validateVisionerIntentProbeMatrix,
  validateVisionerIntentBoundaryProbeMatrix,
  validateVisionerIntentFailureRecoveryProbeMatrix,
  validateVisionerIntentFailureRecoveryRunRecord,
  validateVisionerIntentRunRecord,
  buildVisionerIntentProbeEvidence,
  buildVisionerIntentProbeTelemetry,
  buildVisionerIntentProvenance,
  buildVisionerIntentRunRecord,
  VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES,
  parseVisionerTaskIntent,
  classifyVisionerTaskDepth,
  buildVisionPromptForDepth,
  assessVisionerTaskInputBoundary,
  checkVisionerIntentAmbiguity,
  VISIONER_TASK_MAX_LENGTH,
  VISIONER_INTENT_CATEGORIES,
  FORGE_VISIONER_INTENT_VERSION,
} from "./forge-p02-visioner-intent.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Intent Contract — P02-B01-A02", () => {
  it("defines typed acceptance for all eight visioner intent categories", () => {
    const contract = getActiveVisionerIntentContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B01-A05");

    for (const category of VISIONER_INTENT_CATEGORIES) {
      const categoryContract = getVisionerIntentCategoryContract(category);
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

  it("maps 23 probes with one documented gap after A04 boundary slice", () => {
    const contract = getActiveVisionerIntentContract();
    const summary = summarizeVisionerIntentContractCoverage(contract);
    const coverage = validateVisionerIntentContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.intent_versioning.probeCount, 3);
    assert.equal(summary.byCategory.task_signal.probeCount, 3);
    assert.equal(summary.byCategory.intent_depth.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe after A04 boundary slice", () => {
    const gaps = listVisionerIntentProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["vint.structured_intent_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerIntentBaseline();
    const contract = getActiveVisionerIntentContract();
    const validation = validateVisionerIntentAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerIntentContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner intent probe id is globally unique", () => {
    const ids = listVisionerIntentContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerIntentProbes();
    const contract = getActiveVisionerIntentContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerIntentContract();
    const flatIds = listVisionerIntentContractProbeIds(contract);
    const categoryIds = VISIONER_INTENT_CATEGORIES.flatMap(category =>
      listVisionerIntentContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Visioner Intent Production Slice — P02-B01-A03", () => {
  it("parseVisionerTaskIntent exports structured intent with depth classification", () => {
    const simple = parseVisionerTaskIntent("Fix typo in README.md");
    assert.equal(simple.depth, "simple");
    assert.ok(simple.signals.includes("fix"));
    assert.ok(simple.goals.length >= 1);
    assert.ok(simple.normalizedTask.length > 0);

    const complex = parseVisionerTaskIntent(
      "Design full system architecture for multi-component UI platform with end-to-end flows",
    );
    assert.equal(classifyVisionerTaskDepth(complex.normalizedTask, complex), "complex");
    assert.ok(complex.signals.includes("design"));
  });

  it("buildVisionPromptForDepth routes simple, medium and complex directives", () => {
    const simplePrompt = buildVisionPromptForDepth("simple", "Fix config.json", "", "");
    const complexPrompt = buildVisionPromptForDepth("complex", "Build dashboard UI", "", "");
    assert.match(simplePrompt, /SIMPLE task/i);
    assert.match(complexPrompt, /COMPLEX task/i);
    assert.match(simplePrompt, /Project: Fix config\.json/);
  });

  it("executes contract-wired probes with zero unexpected mismatches after parse/classify/route slice", () => {
    const contract = getActiveVisionerIntentContract();
    const slice = runVisionerIntentProductionSlice();

    assert.equal(slice.atom, "P02-B01-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 22);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateVisionerIntentProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 1);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      ["vint.structured_intent_recovery"],
    );

    const flipped = ["vint.structured_intent_parse", "vint.programmatic_depth_classifier", "vint.depth_routed_prompt"];
    for (const id of flipped) {
      const result = slice.results.find(r => r.id === id);
      assert.ok(result, `${id} missing`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });
});

describe("Forge Visioner Intent Boundary Slice — P02-B01-A04", () => {
  it("assessVisionerTaskInputBoundary handles empty, whitespace-only and oversized inputs", () => {
    const empty = assessVisionerTaskInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerTaskInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerTaskInputBoundary("fix\x00bug");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longTask = "word ".repeat(VISIONER_TASK_MAX_LENGTH + 50);
    const truncated = assessVisionerTaskInputBoundary(longTask);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedTask.length, VISIONER_TASK_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("checkVisionerIntentAmbiguity blocks high-ambiguity tasks", () => {
    const ambiguous = checkVisionerIntentAmbiguity("maybe or whatever");
    assert.equal(ambiguous.shouldBlock, true);
    assert.ok(ambiguous.ambiguityScore >= ambiguous.threshold);

    const clear = checkVisionerIntentAmbiguity("Fix typo in README.md configuration file");
    assert.equal(clear.shouldBlock, false);
  });

  it("defines boundary category with input edge-case probes", () => {
    const boundary = listVisionerIntentContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vint.empty_task_boundary",
      "vint.known_gaps_documented",
      "vint.long_task_truncation_boundary",
      "vint.probe_runner_exported",
      "vint.source_phase_gate_ref",
      "vint.whitespace_task_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerIntentContract();
    const slice = runVisionerIntentBoundarySlice();

    assert.equal(slice.atom, "P02-B01-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerIntentContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerIntentBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("flips intent_ambiguity_nogo probe while preserving structured_intent_recovery gap", () => {
    const slice = runVisionerIntentBoundarySlice();
    const ambiguity = slice.results.find(r => r.id === "vint.intent_ambiguity_nogo");
    const recoveryGap = slice.results.find(r => r.id === "vint.structured_intent_recovery");

    assert.ok(ambiguity);
    assert.equal(ambiguity!.expected, "PASS");
    assert.equal(ambiguity!.actual, "PASS");
    assert.equal(ambiguity!.aligned, true);

    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");
    assert.equal(recoveryGap!.aligned, true);
  });
});

describe("Forge Visioner Intent Failure/Recovery Slice — P02-B01-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerIntentContract();
    const failure = listVisionerIntentContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerIntentContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerIntentContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerIntentContract();
    const slice = runVisionerIntentFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B01-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const category of VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerIntentContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerIntentFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves structured_intent_recovery gap while exercising failure/recovery/NO-GO paths", () => {
    const slice = runVisionerIntentFailureRecoverySlice();
    const probeIds = listVisionerIntentFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const emptyVisionGuard = slice.failureRecoveryResults.find(
      r => r.id === "vint.empty_vision_guard",
    );
    assert.ok(emptyVisionGuard);
    assert.equal(emptyVisionGuard!.expected, "PASS");
    assert.equal(emptyVisionGuard!.actual, "PASS");

    const recoveryGap = slice.failureRecoveryResults.find(
      r => r.id === "vint.structured_intent_recovery",
    );
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const ambiguityNogo = slice.failureRecoveryResults.find(
      r => r.id === "vint.intent_ambiguity_nogo",
    );
    assert.ok(ambiguityNogo);
    assert.equal(ambiguityNogo!.expected, "PASS");
    assert.equal(ambiguityNogo!.actual, "PASS");
  });
});

describe("Forge Visioner Intent Evidence — P02-B01-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadVisionerIntentBaseline();
    const contract = getActiveVisionerIntentContract();
    const probeIds = listVisionerIntentFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerIntentProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerIntentProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildVisionerIntentProvenance(
      "run-vint-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P02-B01-A06",
        sliceCategories: VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildVisionerIntentRunRecord(provenance, evidence, telemetry);
    const validation = validateVisionerIntentFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.gap >= 1);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 1);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourcePhaseGateAtom, fixture.sourcePhaseGate.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveVisionerIntentContract();
    const record = runVisionerIntentFailureRecoverySliceWithRecord();
    const validation = validateVisionerIntentFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P02-B01-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_VISIONER_INTENT_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-b06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.ok(item.recordedAt.length > 10);
    }

    const recoveryGap = record.evidence.find(e => e.probeId === "vint.structured_intent_recovery");
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.aligned, true);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");
    assert.equal(recoveryGap!.disposition, "gap");
  });

  it("records evidence, telemetry and provenance for full visioner intent run", () => {
    const contract = getActiveVisionerIntentContract();
    const record = runVisionerIntentProbesWithRecord();
    const validation = validateVisionerIntentRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-b06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });
});
