import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerFilesystemGroundingBaseline,
  runWorkerFilesystemGroundingProbes,
  validateWorkerFilesystemGroundingBaseline,
  summarizeWorkerFilesystemGroundingMatrix,
  listWorkerFilesystemGroundingProbesByExpected,
  listWorkerFilesystemGroundingKnownGaps,
  assessFilesystemReadInputBoundary,
  recoverFilesystemReadPath,
  probeDeniedPathReadError,
  WORKER_FILESYSTEM_GROUNDING_CATEGORIES,
  WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH,
  FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
} from "./forge-p05-worker-filesystem-grounding.js";
import { getForgeP05B01ToB02Handoff } from "./forge-p05-worker-tool-dispatch.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Filesystem Grounding — P05-B02-A01", () => {
  it("loads versioned filesystem grounding baseline aligned with P05-B01 block gate handoff", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const validation = validateWorkerFilesystemGroundingBaseline(fixture);
    const handoff = getForgeP05B01ToB02Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P05-B02-A01");
    assert.equal(fixture.contractAtom, "P05-B02-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P05-B01-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.workerToolDispatchProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
    assert.equal(handoff.targetBlock.entryAtom, "P05-B02-A01");
  });

  it("measures filesystem grounding probes with zero unexpected mismatches after A03 slice", () => {
    const results = runWorkerFilesystemGroundingProbes();
    const summary = summarizeWorkerFilesystemGroundingMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listWorkerFilesystemGroundingProbesByExpected(
      "FAIL",
      loadWorkerFilesystemGroundingBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents zero remaining filesystem grounding gaps after production slice", () => {
    const gaps = listWorkerFilesystemGroundingKnownGaps(runWorkerFilesystemGroundingProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessFilesystemReadInputBoundary rejects empty and null-byte file paths", () => {
    const empty = assessFilesystemReadInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessFilesystemReadInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessFilesystemReadInputBoundary("src/tools.ts\0");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessFilesystemReadInputBoundary truncates oversized file paths", () => {
    const longPath = "src/" + "x".repeat(WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH + 500);
    const truncated = assessFilesystemReadInputBoundary(longPath);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedPath.length, WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("recoverFilesystemReadPath coerces relative paths into project-root read targets", () => {
    const recovery = recoverFilesystemReadPath("./src/tools.ts");

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.path, "src/tools.ts");
  });

  it("probeDeniedPathReadError returns deterministic denied-path error", () => {
    const ok = probeDeniedPathReadError();
    assert.equal(ok, true);
  });

  it("exports harness version for filesystem grounding baseline", () => {
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION, "1.0.0-a10");
  });
});
