import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerToolDispatchBaseline,
  runWorkerToolDispatchProductionSlice,
  validateWorkerToolDispatchProbeMatrix,
  validateWorkerToolCall,
  validateWorkerToolCallAgainstSchema,
  buildWorkerToolDispatchTelemetry,
  getActiveWorkerToolDispatchContract,
  listWorkerToolDispatchContractProbesByCategory,
  FORGE_WORKER_TOOL_DISPATCH_VERSION,
} from "./forge-p05-worker-tool-dispatch.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Tool Dispatch Production Slice — P05-B01-A03", () => {
  it("validateWorkerToolCallAgainstSchema rejects missing required tool parameters", () => {
    const invalid = validateWorkerToolCallAgainstSchema("read_file", {});
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(error => error.includes("missing required parameter")));
  });

  it("validateWorkerToolCall rejects empty tool names before dispatch", () => {
    const invalid = validateWorkerToolCall({ name: "", args: {} });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
  });

  it("buildWorkerToolDispatchTelemetry records dispatch provenance for valid calls", () => {
    const telemetry = buildWorkerToolDispatchTelemetry(
      { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
      { sequenceIndex: 2 },
    );

    assert.equal(telemetry.toolName, "read_file");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.validated, true);
    assert.equal(telemetry.harnessVersion, FORGE_WORKER_TOOL_DISPATCH_VERSION);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const slice = runWorkerToolDispatchProductionSlice();

    assert.equal(slice.atom, "P05-B01-A03");
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

    const matrixValidation = validateWorkerToolDispatchProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const fixture = loadWorkerToolDispatchBaseline();
    assert.equal(fixture.probes.filter(p => p.expected === "FAIL").length, 0);
  });

  it("closes all six A02 gap categories via production wiring", () => {
    const slice = runWorkerToolDispatchProductionSlice();
    const gapProbeIds = [
      "wtd.typed_tool_call_union",
      "wtd.worker_prompt_typed_contract",
      "wtd.orchestrator_pre_dispatch_check",
      "wtd.schema_validation_before_dispatch",
      "wtd.exported_dispatch_validator",
      "wtd.dispatch_telemetry_record",
    ];

    for (const probeId of gapProbeIds) {
      const result = slice.results.find(r => r.id === probeId);
      assert.ok(result, `missing gap probe result: ${probeId}`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }

    const nogoProbes = listWorkerToolDispatchContractProbesByCategory("nogo_path");
    assert.equal(nogoProbes.length, 3);
    assert.ok(nogoProbes.every(probe => probe.expected === "PASS"));
  });
});
