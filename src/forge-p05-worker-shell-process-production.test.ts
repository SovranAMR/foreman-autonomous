import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerShellProcessBaseline,
  runWorkerShellProcessProductionSlice,
  validateWorkerShellProcessProbeMatrix,
  validateShellCommand,
  buildShellProcessTelemetry,
  getActiveWorkerShellProcessContract,
  listWorkerShellProcessContractProbesByCategory,
  FORGE_WORKER_SHELL_PROCESS_VERSION,
} from "./forge-p05-worker-shell-process.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Shell Process Production Slice — P05-B04-A03", () => {
  it("validateShellCommand rejects empty bash command before dispatch", () => {
    const invalid = validateShellCommand({ name: "bash", args: { command: "" } });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
  });

  it("validateShellCommand accepts normalized bash command args", () => {
    const valid = validateShellCommand({
      name: "bash",
      args: { command: "npm test", timeout_ms: 45_000 },
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.command, "npm test");
    assert.equal(valid.timeoutMs, 45_000);
  });

  it("buildShellProcessTelemetry records shell provenance for valid calls", () => {
    const telemetry = buildShellProcessTelemetry(
      { name: "bash", args: { command: "npm test", timeout_ms: 30_000 } },
      { sequenceIndex: 2 },
    );

    assert.equal(telemetry.toolName, "bash");
    assert.equal(telemetry.command, "npm test");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.validated, true);
    assert.equal(telemetry.harnessVersion, FORGE_WORKER_SHELL_PROCESS_VERSION);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveWorkerShellProcessContract();
    const slice = runWorkerShellProcessProductionSlice();

    assert.equal(slice.atom, "P05-B04-A03");
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

    const matrixValidation = validateWorkerShellProcessProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const fixture = loadWorkerShellProcessBaseline();
    assert.equal(fixture.probes.filter(p => p.expected === "FAIL").length, 0);
  });

  it("closes all five A02 gap probes via production wiring", () => {
    const slice = runWorkerShellProcessProductionSlice();
    const gapProbeIds = [
      "wsp.typed_shell_call_union",
      "wsp.thought_scoped_process_tracking",
      "wsp.worker_prompt_shell_contract",
      "wsp.orchestrator_pre_shell_validation",
      "wsp.exported_shell_validator",
    ];

    for (const probeId of gapProbeIds) {
      const result = slice.results.find(r => r.id === probeId);
      assert.ok(result, `missing gap probe result: ${probeId}`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }

    const nogoProbes = listWorkerShellProcessContractProbesByCategory("nogo_path");
    assert.equal(nogoProbes.length, 3);
    assert.ok(nogoProbes.every(probe => probe.expected === "PASS"));
  });
});
