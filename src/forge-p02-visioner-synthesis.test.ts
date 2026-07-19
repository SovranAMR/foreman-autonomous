import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerSynthesisBaseline,
  runVisionerSynthesisProbes,
  runVisionerSynthesisProductionSlice,
  runVisionerSynthesisBoundarySlice,
  runVisionerSynthesisFailureRecoverySlice,
  runVisionerSynthesisProbesWithRecord,
  runVisionerSynthesisFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-synthesis.probe.js";
import {
  assessVisionerSynthesisInputBoundary,
  extractVisionerSynthesis,
  buildVisionSynthesisSummary,
  buildVisionerSynthesisProbeEvidence,
  buildVisionerSynthesisProbeTelemetry,
  buildVisionerSynthesisProvenance,
  buildVisionerSynthesisRunRecord,
  validateVisionerSynthesisRunRecord,
  validateVisionerSynthesisFailureRecoveryRunRecord,
  getActiveVisionerSynthesisContract,
  getVisionerSynthesisCategoryContract,
  listVisionerSynthesisContractProbeIds,
  listVisionerSynthesisContractProbesByCategory,
  listVisionerSynthesisFailureRecoveryProbeIds,
  listVisionerSynthesisProbesByDisposition,
  summarizeVisionerSynthesisContractCoverage,
  validateVisionerSynthesisAgainstContract,
  validateVisionerSynthesisContractCoverage,
  validateVisionerSynthesisProbeMatrix,
  validateVisionerSynthesisBoundaryProbeMatrix,
  validateVisionerSynthesisFailureRecoveryProbeMatrix,
  FORGE_VISIONER_SYNTHESIS_VERSION,
  VISIONER_SYNTHESIS_CATEGORIES,
  VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES,
  VISIONER_SYNTHESIS_VISION_MAX_LENGTH,
} from "./forge-p02-visioner-synthesis.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Synthesis Contract — P02-B03-A02", () => {
  it("defines typed acceptance for all eight visioner synthesis categories", () => {
    const contract = getActiveVisionerSynthesisContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B03-A05");

    for (const category of VISIONER_SYNTHESIS_CATEGORIES) {
      const categoryContract = getVisionerSynthesisCategoryContract(category);
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

  it("maps 23 probes with one documented gap aligned to baseline fixture", () => {
    const contract = getActiveVisionerSynthesisContract();
    const summary = summarizeVisionerSynthesisContractCoverage(contract);
    const coverage = validateVisionerSynthesisContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.synthesis_versioning.probeCount, 3);
    assert.equal(summary.byCategory.synthesis_signal.probeCount, 3);
    assert.equal(summary.byCategory.aesthetic_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe for structured synthesis recovery", () => {
    const gaps = listVisionerSynthesisProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["vsyn.structured_synthesis_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerSynthesisBaseline();
    const contract = getActiveVisionerSynthesisContract();
    const validation = validateVisionerSynthesisAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerSynthesisContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner synthesis probe id is globally unique", () => {
    const ids = listVisionerSynthesisContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerSynthesisProbes();
    const contract = getActiveVisionerSynthesisContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerSynthesisContract();
    const flatIds = listVisionerSynthesisContractProbeIds(contract);
    const categoryIds = VISIONER_SYNTHESIS_CATEGORIES.flatMap(category =>
      listVisionerSynthesisContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Visioner Synthesis Production Slice — P02-B03-A03", () => {
  const SAMPLE_VISION = `**EMOTION TARGET**: Quiet confidence
**FOCAL POINT**: Hero CTA button
**COLOR PHILOSOPHY**: Gold accent on dark canvas, max 3 colors
**TYPOGRAPHY HIERARCHY**: Display 48px / body 16px
**GOAL**: Ship dashboard UI`;

  it("extractVisionerSynthesis exports structured aesthetic tokens", () => {
    const extracted = extractVisionerSynthesis(SAMPLE_VISION);
    assert.equal(extracted.hasEmotionTarget, true);
    assert.equal(extracted.hasFocalPoint, true);
    assert.equal(extracted.hasColorPhilosophy, true);
    assert.equal(extracted.hasTypographyHierarchy, true);
    assert.ok(extracted.emotionTarget.some(t => /Quiet confidence/i.test(t)));
    assert.ok(extracted.focalPoint.some(t => /Hero CTA/i.test(t)));
    assert.ok(extracted.colorPhilosophy.some(t => /Gold accent/i.test(t)));
    assert.ok(extracted.typographyHierarchy.some(t => /Display 48px/i.test(t)));
  });

  it("buildVisionSynthesisSummary preserves aesthetic sections for worker injection", () => {
    const summary = buildVisionSynthesisSummary(SAMPLE_VISION);
    assert.match(summary, /EMOTION TARGET/i);
    assert.match(summary, /FOCAL POINT/i);
    assert.match(summary, /COLOR PHILOSOPHY/i);
    assert.match(summary, /Quiet confidence/i);
  });

  it("executes contract-wired probes with zero unexpected mismatches after synthesis extraction slice", () => {
    const contract = getActiveVisionerSynthesisContract();
    const slice = runVisionerSynthesisProductionSlice();

    assert.equal(slice.atom, "P02-B03-A03");
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

    const matrixValidation = validateVisionerSynthesisProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 1);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      ["vsyn.structured_synthesis_recovery"],
    );

    for (const id of ["vsyn.vision_summary_aesthetic_extract", "vsyn.prompt_emotion_target"]) {
      const result = slice.results.find(r => r.id === id);
      assert.ok(result, `${id} missing`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });
});

describe("Forge Visioner Synthesis Boundary Slice — P02-B03-A04", () => {
  it("assessVisionerSynthesisInputBoundary handles empty, whitespace-only and oversized inputs", () => {
    const empty = assessVisionerSynthesisInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerSynthesisInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerSynthesisInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_SYNTHESIS_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerSynthesisInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_SYNTHESIS_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("extractVisionerSynthesis returns empty tokens for unacceptable boundary inputs", () => {
    const extracted = extractVisionerSynthesis("   ");
    assert.equal(extracted.hasEmotionTarget, false);
    assert.equal(extracted.hasFocalPoint, false);
    assert.deepEqual(extracted.emotionTarget, []);
    assert.deepEqual(extracted.focalPoint, []);
  });

  it("defines boundary category with vision output edge-case probes", () => {
    const boundary = listVisionerSynthesisContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vsyn.empty_vision_synthesis_presence",
      "vsyn.known_gaps_documented",
      "vsyn.long_vision_truncation_boundary",
      "vsyn.probe_runner_exported",
      "vsyn.source_block_gate_ref",
      "vsyn.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerSynthesisContract();
    const slice = runVisionerSynthesisBoundarySlice();

    assert.equal(slice.atom, "P02-B03-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerSynthesisContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerSynthesisBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves structured_synthesis_recovery gap while boundary probes pass", () => {
    const slice = runVisionerSynthesisBoundarySlice();
    const recoveryGap = slice.results.find(r => r.id === "vsyn.structured_synthesis_recovery");

    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");
    assert.equal(recoveryGap!.aligned, true);
  });
});

describe("Forge Visioner Synthesis Failure/Recovery Slice — P02-B03-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerSynthesisContract();
    const failure = listVisionerSynthesisContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerSynthesisContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerSynthesisContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerSynthesisContract();
    const slice = runVisionerSynthesisFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B03-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const category of VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerSynthesisContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerSynthesisFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves structured_synthesis_recovery gap while exercising failure/recovery/NO-GO paths", () => {
    const slice = runVisionerSynthesisFailureRecoverySlice();
    const probeIds = listVisionerSynthesisFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vsyn.malformed_vision_presence_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const recoveryGap = slice.failureRecoveryResults.find(
      r => r.id === "vsyn.structured_synthesis_recovery",
    );
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const reviewerNogo = slice.failureRecoveryResults.find(r => r.id === "vsyn.reviewer_focal_dilution");
    assert.ok(reviewerNogo);
    assert.equal(reviewerNogo!.expected, "PASS");
    assert.equal(reviewerNogo!.actual, "PASS");
  });
});

describe("Forge Visioner Synthesis Evidence — P02-B03-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadVisionerSynthesisBaseline();
    const contract = getActiveVisionerSynthesisContract();
    const probeIds = listVisionerSynthesisFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerSynthesisProbeEvidence(
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
      return buildVisionerSynthesisProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildVisionerSynthesisProvenance(
      "run-vsyn-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P02-B03-A06",
        sliceCategories: VISIONER_SYNTHESIS_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildVisionerSynthesisRunRecord(provenance, evidence, telemetry);
    const validation = validateVisionerSynthesisFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.gap >= 1);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 1);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveVisionerSynthesisContract();
    const record = runVisionerSynthesisFailureRecoverySliceWithRecord();
    const validation = validateVisionerSynthesisFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P02-B03-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_VISIONER_SYNTHESIS_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
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

    const recoveryGap = record.evidence.find(e => e.probeId === "vsyn.structured_synthesis_recovery");
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.aligned, true);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");
    assert.equal(recoveryGap!.disposition, "gap");
  });

  it("records evidence, telemetry and provenance for full visioner synthesis run", () => {
    const contract = getActiveVisionerSynthesisContract();
    const record = runVisionerSynthesisProbesWithRecord();
    const validation = validateVisionerSynthesisRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
