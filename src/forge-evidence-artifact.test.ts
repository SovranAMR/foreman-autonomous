import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadEvidenceArtifactBaseline,
  runEvidenceArtifactProbes,
} from "./forge-evidence-artifact.probe.js";
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
