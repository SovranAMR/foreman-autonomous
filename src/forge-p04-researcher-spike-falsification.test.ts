import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherSpikeFalsificationBaseline,
  runResearcherSpikeFalsificationProbes,
  getActiveResearcherSpikeFalsificationContract,
  getResearcherSpikeFalsificationCategoryContract,
  listResearcherSpikeFalsificationContractProbeIds,
  listResearcherSpikeFalsificationContractProbesByCategory,
  listResearcherSpikeFalsificationProbesByDisposition,
  summarizeResearcherSpikeFalsificationContractCoverage,
  validateResearcherSpikeFalsificationContract,
  validateResearcherSpikeFalsificationContractCoverage,
  validateResearcherSpikeFalsificationAgainstContract,
  RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES,
  FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1,
  runResearcherSpikeFalsificationProductionSlice,
  runResearcherSpikeFalsificationBoundarySlice,
  validateResearcherSpikeFalsificationProbeMatrix,
  validateResearcherSpikeFalsificationBoundaryProbeMatrix,
  validateSpikeFalsificationExperiment,
} from "./forge-p04-researcher-spike-falsification.js";
import { parseResearchSpikeExperiment } from "./parser.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  spike_signal: true,
  falsification_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Researcher Spike Falsification Contract — P04-B08-A02", () => {
  it("defines typed acceptance for all eight spike falsification categories", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B08-A06");

    for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
      const categoryContract = getResearcherSpikeFalsificationCategoryContract(category);
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

  it("maps 23 probes with zero remaining gaps after A03 production slice", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const summary = summarizeResearcherSpikeFalsificationContractCoverage(contract);
    const coverage = validateResearcherSpikeFalsificationContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherSpikeFalsificationContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 19);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.spike_signal.probeCount, 3);
    assert.equal(summary.byCategory.falsification_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap and nogo probes after A03 production slice", () => {
    const gaps = listResearcherSpikeFalsificationProbesByDisposition("gap");
    const nogos = listResearcherSpikeFalsificationProbesByDisposition("nogo");

    assert.deepEqual(gaps.map(g => g.id).sort(), []);
    assert.deepEqual(nogos.map(g => g.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const validation = validateResearcherSpikeFalsificationAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherSpikeFalsificationContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each spike falsification probe id is globally unique", () => {
    const ids = listResearcherSpikeFalsificationContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherSpikeFalsificationProbes();
    const contract = getActiveResearcherSpikeFalsificationContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const flatIds = listResearcherSpikeFalsificationContractProbeIds(contract);
    const categoryIds = RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.flatMap(category =>
      listResearcherSpikeFalsificationContractProbesByCategory(category, contract).map(
        p => p.id,
      ),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.probes.length, 23);
  });
});

describe("Forge Researcher Spike Falsification Production Slice — P04-B08-A03", () => {
  it("parseResearchSpikeExperiment extracts spike→outcome edges", () => {
    const parsed = parseResearchSpikeExperiment(
      "FINDINGS: async reduces blocking\nSPIKE_EXPERIMENTS:\n1. bounded worker pool → p99 below 500ms\nFALSIFICATION: reject if sync wins",
    );

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.ok(parsed.data.edges.some(e => e.hypothesis.includes("worker pool")));
      assert.ok(parsed.data.edges.some(e => e.outcome.includes("500ms")));
    }
  });

  it("validateSpikeFalsificationExperiment accepts spike and falsification signals", () => {
    const validation = validateSpikeFalsificationExperiment(
      "FINDINGS: benchmark supports async\nSPIKE_EXPERIMENTS:\n1. async pool → lower p99 latency\nFALSIFICATION: reject if sync baseline wins",
    );

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.spikePresent, true);
    assert.ok(validation.experimentCount >= 1);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const slice = runResearcherSpikeFalsificationProductionSlice();

    assert.equal(slice.atom, "P04-B08-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    const matrixValidation = validateResearcherSpikeFalsificationProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const parserProbe = slice.results.find(r => r.id === "rsf.parser_spike_experiment");
    assert.ok(parserProbe);
    assert.equal(parserProbe!.expected, "PASS");
    assert.equal(parserProbe!.actual, "PASS");

    const validatorProbe = slice.results.find(
      r => r.id === "rsf.exported_spike_falsification_validator",
    );
    assert.ok(validatorProbe);
    assert.equal(validatorProbe!.expected, "PASS");
    assert.equal(validatorProbe!.actual, "PASS");
  });
});

describe("Forge Researcher Spike Falsification Boundary Slice — P04-B08-A04", () => {
  it("defines six boundary probes for spike falsification input edge cases", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const boundary = listResearcherSpikeFalsificationContractProbesByCategory(
      "boundary",
      contract,
    );
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rsf.empty_experiment_input_boundary",
      "rsf.known_gaps_documented",
      "rsf.long_experiment_input_truncation_boundary",
      "rsf.probe_runner_exported",
      "rsf.source_block_gate_ref",
      "rsf.whitespace_experiment_input_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on experiment edge probes", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const slice = runResearcherSpikeFalsificationBoundarySlice();

    assert.equal(slice.atom, "P04-B08-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherSpikeFalsificationContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherSpikeFalsificationBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("validateSpikeFalsificationExperiment rejects invalid boundary inputs", () => {
    const emptyValidation = validateSpikeFalsificationExperiment("");
    assert.equal(emptyValidation.valid, false);
    assert.ok(emptyValidation.issues.some(i => i.includes("empty")));

    const whitespaceValidation = validateSpikeFalsificationExperiment("   \t\n  ");
    assert.equal(whitespaceValidation.valid, false);
    assert.equal(whitespaceValidation.experimentCount, 0);

    const nullByteValidation = validateSpikeFalsificationExperiment("experiment\0parse");
    assert.equal(nullByteValidation.valid, false);
    assert.equal(nullByteValidation.spikePresent, false);
  });
});
