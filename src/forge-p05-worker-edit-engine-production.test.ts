import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerEditEngineBaseline,
  runWorkerEditEngineProductionSlice,
  validateWorkerEditEngineProbeMatrix,
  validateSurgicalEdit,
  buildEditEngineTelemetry,
  getActiveWorkerEditEngineContract,
  listWorkerEditEngineContractProbesByCategory,
  FORGE_WORKER_EDIT_ENGINE_VERSION,
} from "./forge-p05-worker-edit-engine.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Edit Engine Production Slice — P05-B03-A03", () => {
  it("validateSurgicalEdit rejects empty old_string before dispatch", () => {
    const invalid = validateSurgicalEdit({
      name: "edit_file",
      args: { path: "src/tools.ts", old_string: "", new_string: "x" },
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
  });

  it("validateSurgicalEdit accepts normalized edit_file args", () => {
    const valid = validateSurgicalEdit({
      name: "edit_file",
      args: {
        explanation: "probe",
        path: "./src/tools.ts",
        old_string: "const x = 1;",
        new_string: "const x = 2;",
        occurrence: 2,
      },
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.path, "src/tools.ts");
    assert.equal(valid.occurrence, 2);
  });

  it("buildEditEngineTelemetry records edit provenance for valid calls", () => {
    const telemetry = buildEditEngineTelemetry(
      {
        name: "edit_file",
        args: {
          explanation: "probe",
          path: "src/tools.ts",
          old_string: "const x = 1;",
          new_string: "const x = 2;",
        },
      },
      { sequenceIndex: 3 },
    );

    assert.equal(telemetry.toolName, "edit_file");
    assert.equal(telemetry.path, "src/tools.ts");
    assert.equal(telemetry.sequenceIndex, 3);
    assert.equal(telemetry.validated, true);
    assert.equal(telemetry.harnessVersion, FORGE_WORKER_EDIT_ENGINE_VERSION);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveWorkerEditEngineContract();
    const slice = runWorkerEditEngineProductionSlice();

    assert.equal(slice.atom, "P05-B03-A03");
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

    const matrixValidation = validateWorkerEditEngineProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const fixture = loadWorkerEditEngineBaseline();
    assert.equal(fixture.probes.filter(p => p.expected === "FAIL").length, 0);
  });

  it("closes all six A02 gap categories via production wiring", () => {
    const slice = runWorkerEditEngineProductionSlice();
    const gapProbeIds = [
      "wee.typed_edit_call_union",
      "wee.worker_prompt_edit_contract",
      "wee.multi_occurrence_dispatch",
      "wee.orchestrator_pre_edit_validation",
      "wee.edit_telemetry_record",
      "wee.exported_edit_validator",
    ];

    for (const probeId of gapProbeIds) {
      const result = slice.results.find(r => r.id === probeId);
      assert.ok(result, `missing gap probe result: ${probeId}`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }

    const nogoProbes = listWorkerEditEngineContractProbesByCategory("nogo_path");
    assert.equal(nogoProbes.length, 3);
    assert.ok(nogoProbes.every(probe => probe.expected === "PASS"));
  });
});
