import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherResearchToWorkerHandoffBaseline,
  runResearcherResearchToWorkerHandoffProbes,
  getActiveResearcherResearchToWorkerHandoffContract,
  getResearcherResearchToWorkerHandoffCategoryContract,
  listResearcherResearchToWorkerHandoffContractProbeIds,
  listResearcherResearchToWorkerHandoffContractProbesByCategory,
  listResearcherResearchToWorkerHandoffProbesByDisposition,
  summarizeResearcherResearchToWorkerHandoffContractCoverage,
  validateResearcherResearchToWorkerHandoffContract,
  validateResearcherResearchToWorkerHandoffContractCoverage,
  validateResearcherResearchToWorkerHandoffAgainstContract,
  runResearcherResearchToWorkerHandoffProductionSlice,
  runResearcherResearchToWorkerHandoffBoundarySlice,
  validateResearcherResearchToWorkerHandoffProbeMatrix,
  validateResearcherResearchToWorkerHandoffBoundaryProbeMatrix,
  validateResearchToWorkerHandoff,
  recoverResearchToWorkerHandoff,
  RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES,
  FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1,
} from "./forge-p04-researcher-research-to-worker-handoff.js";
import { parseResearchToWorkerHandoff } from "./parser.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  handoff_signal: true,
  worker_context_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Researcher Research-to-Worker Handoff Contract — P04-B09-A02", () => {
  it("defines typed acceptance for all eight research-to-worker handoff categories", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B09-A06");

    for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
      const categoryContract = getResearcherResearchToWorkerHandoffCategoryContract(category);
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

  it("maps 23 probes with full alignment in typed contract after A03 production slice", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const summary = summarizeResearcherResearchToWorkerHandoffContractCoverage(contract);
    const coverage = validateResearcherResearchToWorkerHandoffContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherResearchToWorkerHandoffContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 19);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.handoff_signal.probeCount, 3);
    assert.equal(summary.byCategory.worker_context_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining nogo probes after A03 production slice", () => {
    const gaps = listResearcherResearchToWorkerHandoffProbesByDisposition("gap");
    const nogos = listResearcherResearchToWorkerHandoffProbesByDisposition("nogo");

    assert.deepEqual(gaps.map(g => g.id).sort(), []);
    assert.deepEqual(nogos.map(g => g.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherResearchToWorkerHandoffBaseline();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const validation = validateResearcherResearchToWorkerHandoffAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherResearchToWorkerHandoffContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each research-to-worker handoff probe id is globally unique", () => {
    const ids = listResearcherResearchToWorkerHandoffContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherResearchToWorkerHandoffProbes();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const flatIds = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
    const categoryIds = RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.flatMap(category =>
      listResearcherResearchToWorkerHandoffContractProbesByCategory(category, contract).map(
        p => p.id,
      ),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1.probes.length, 23);
  });
});

describe("Forge Researcher Research-to-Worker Handoff Production Slice — P04-B09-A03", () => {
  it("parseResearchToWorkerHandoff extracts worker context bundle from researcher output", () => {
    const parsed = parseResearchToWorkerHandoff(
      "FINDINGS: async worker pool reduces tail latency\nSOURCES: https://example.com/async\nRELEVANCE: 0.85\nTRADEOFFS:\n1. sync vs async\nRISKS: Increased complexity",
    );

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.ok(parsed.data.findings.toLowerCase().includes("async worker pool"));
      assert.ok(parsed.data.sources.some(source => source.includes("example.com")));
      assert.ok(parsed.data.tradeoffs.some(tradeoff => tradeoff.includes("sync")));
    }
  });

  it("validateResearchToWorkerHandoff accepts actionable handoff bundle signals", () => {
    const validation = validateResearchToWorkerHandoff(
      "FINDINGS: benchmark supports async\nSOURCES: https://example.com/async\nRELEVANCE: 0.85\nTRADEOFFS:\n1. sync vs async\nRISKS: Increased complexity (medium)",
    );

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.findingsPresent, true);
    assert.ok(validation.sourcesPresent);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const slice = runResearcherResearchToWorkerHandoffProductionSlice();

    assert.equal(slice.atom, "P04-B09-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    const matrixValidation = validateResearcherResearchToWorkerHandoffProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const parserProbe = slice.results.find(r => r.id === "rtwh.parser_research_handoff_bundle");
    assert.ok(parserProbe);
    assert.equal(parserProbe!.expected, "PASS");
    assert.equal(parserProbe!.actual, "PASS");

    const validatorProbe = slice.results.find(r => r.id === "rtwh.exported_handoff_validator");
    assert.ok(validatorProbe);
    assert.equal(validatorProbe!.expected, "PASS");
    assert.equal(validatorProbe!.actual, "PASS");
  });
});

describe("Forge Researcher Research-to-Worker Handoff Boundary Slice — P04-B09-A04", () => {
  it("defines six boundary probes with handoff input edge-case criteria", () => {
    const boundary = listResearcherResearchToWorkerHandoffContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rtwh.empty_handoff_input_boundary",
      "rtwh.known_gaps_documented",
      "rtwh.long_handoff_input_truncation_boundary",
      "rtwh.probe_runner_exported",
      "rtwh.source_block_gate_ref",
      "rtwh.whitespace_handoff_input_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on handoff edge probes", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const slice = runResearcherResearchToWorkerHandoffBoundarySlice();

    assert.equal(slice.atom, "P04-B09-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherResearchToWorkerHandoffContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherResearchToWorkerHandoffBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("validateResearchToWorkerHandoff and recoverResearchToWorkerHandoff reject invalid boundary inputs", () => {
    const emptyValidation = validateResearchToWorkerHandoff("");
    assert.equal(emptyValidation.valid, false);
    assert.ok(emptyValidation.issues.length > 0);

    const whitespaceValidation = validateResearchToWorkerHandoff("   \t\n  ");
    assert.equal(whitespaceValidation.valid, false);
    assert.ok(whitespaceValidation.issues.some(i => i.includes("whitespace")));

    const nullValidation = validateResearchToWorkerHandoff("handoff\0parse");
    assert.equal(nullValidation.valid, false);
    assert.ok(nullValidation.issues.some(i => i.includes("null byte")));

    const whitespaceRecovery = recoverResearchToWorkerHandoff("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only"]);
  });
});
