import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerFilesystemGroundingBaseline,
  runWorkerFilesystemGroundingProductionSlice,
  validateWorkerFilesystemGroundingProbeMatrix,
  validateReadBeforeEdit,
  validateFilesystemGrounding,
  buildFilesystemGroundingTelemetry,
  getActiveWorkerFilesystemGroundingContract,
  listWorkerFilesystemGroundingContractProbesByCategory,
  FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
} from "./forge-p05-worker-filesystem-grounding.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Filesystem Grounding Production Slice — P05-B02-A03", () => {
  it("validateReadBeforeEdit rejects edit/write without prior read_file grounding", () => {
    const ungrounded = validateReadBeforeEdit(
      { name: "edit_file", args: { path: "src/tools.ts" } },
      new Set<string>(),
    );
    assert.equal(ungrounded.valid, false);
    assert.ok(ungrounded.errors.some(error => error.includes("read_file grounding required")));
  });

  it("validateFilesystemGrounding accepts read_file with valid path", () => {
    const grounded = validateFilesystemGrounding(
      { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
      new Set<string>(),
    );
    assert.equal(grounded.valid, true);
    assert.equal(grounded.path, "src/tools.ts");
  });

  it("buildFilesystemGroundingTelemetry records read grounding provenance for valid reads", () => {
    const telemetry = buildFilesystemGroundingTelemetry(
      { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
      { sequenceIndex: 2 },
    );

    assert.equal(telemetry.toolName, "read_file");
    assert.equal(telemetry.path, "src/tools.ts");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.grounded, true);
    assert.equal(telemetry.harnessVersion, FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION);
    assert.ok(telemetry.recordedAt.length > 0);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    const slice = runWorkerFilesystemGroundingProductionSlice();

    assert.equal(slice.atom, "P05-B02-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 27);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 27);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateWorkerFilesystemGroundingProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const fixture = loadWorkerFilesystemGroundingBaseline();
    assert.equal(fixture.probes.filter(p => p.expected === "FAIL").length, 0);
  });

  it("closes all six A02 gap categories via production wiring", () => {
    const slice = runWorkerFilesystemGroundingProductionSlice();
    const gapProbeIds = [
      "wfg.typed_read_call_union",
      "wfg.worker_prompt_grounding_contract",
      "wfg.orchestrator_pre_read_grounding",
      "wfg.read_before_edit_validator",
      "wfg.grounding_telemetry_record",
      "wfg.exported_grounding_validator",
    ];

    for (const probeId of gapProbeIds) {
      const result = slice.results.find(r => r.id === probeId);
      assert.ok(result, `missing gap probe result: ${probeId}`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }

    const nogoProbes = listWorkerFilesystemGroundingContractProbesByCategory("nogo_path");
    assert.equal(nogoProbes.length, 3);
    assert.ok(nogoProbes.every(probe => probe.expected === "PASS"));
  });
});
