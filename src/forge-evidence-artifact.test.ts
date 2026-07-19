import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadEvidenceArtifactBaseline,
  runEvidenceArtifactProbes,
  runEvidenceArtifactProductionSlice,
  validateEvidenceArtifactProbeMatrix,
} from "./forge-evidence-artifact.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
import {
  getActiveEvidenceArtifactContract,
  getEvidenceArtifactCategoryContract,
  listEvidenceArtifactContractProbeIds,
  listEvidenceArtifactProbesByDisposition,
  summarizeEvidenceArtifactContractCoverage,
  validateEvidenceArtifactContractCoverage,
  validateEvidenceArtifactBaselineAgainstContract,
  EVIDENCE_ARTIFACT_CATEGORIES,
} from "./forge-evidence-artifact.js";

describe("Forge Evidence Artifact Contract — P01-B08-A02", () => {
  it("defines typed acceptance for all eleven evidence artifact categories", () => {
    const contract = getActiveEvidenceArtifactContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B08-A05");

    for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
      const categoryContract = getEvidenceArtifactCategoryContract(category);
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

  it("maps 25 probes with seven documented gap dispositions from A01 baseline", () => {
    const contract = getActiveEvidenceArtifactContract();
    const summary = summarizeEvidenceArtifactContractCoverage(contract);
    const coverage = validateEvidenceArtifactContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 25);
    assert.equal(summary.expectedPass, 18);
    assert.equal(summary.expectedFail, 7);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 3);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.schema_versioning.probeCount, 3);
    assert.equal(summary.byCategory.evidence_shape.probeCount, 3);
    assert.equal(summary.byCategory.telemetry_shape.probeCount, 2);
    assert.equal(summary.byCategory.provenance_lineage.probeCount, 2);
    assert.equal(summary.byCategory.run_record_bundle.probeCount, 2);
    assert.equal(summary.byCategory.schema_registry.probeCount, 2);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists three documented gap probes for evidence artifact schema wiring", () => {
    const gaps = listEvidenceArtifactProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "eva.cross_block_normalizer",
      "eva.unified_category_dimension",
      "eva.unified_schema_type_export",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadEvidenceArtifactBaseline();
    const contract = getActiveEvidenceArtifactContract();
    const validation = validateEvidenceArtifactBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listEvidenceArtifactContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each evidence artifact probe id is globally unique", () => {
    const ids = listEvidenceArtifactContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runEvidenceArtifactProbes();
    const contract = getActiveEvidenceArtifactContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Evidence Artifact Production Slice — P01-B08-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveEvidenceArtifactContract();
    const slice = runEvidenceArtifactProductionSlice();

    assert.equal(slice.atom, "P01-B08-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 25);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 18);
    assert.equal(slice.matrixValidation.gapAligned, 7);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateEvidenceArtifactProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 7);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "eva.cross_block_normalizer",
        "eva.nogo_cross_block_mismatch_gate",
        "eva.nogo_schema_drift_gate",
        "eva.recovery_baseline_reset",
        "eva.recovery_missing_schema_fallback",
        "eva.unified_category_dimension",
        "eva.unified_schema_type_export",
      ],
    );
  });
});
