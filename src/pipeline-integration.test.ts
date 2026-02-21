/**
 * Mock pipeline integration test — MockProvider'ın smart response'ları
 * tüm pipeline'ı BLOCK'suz yürütüyor mu?
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Engine } from "./engine.js";
import { Orchestrator, type OrchestratorEvent } from "./orchestrator.js";
import { MockProvider } from "./provider.js";

async function main() {
  const testDir = mkdtempSync(join(tmpdir(), "foreman-pipeline-"));

  const engine = new Engine({
    projectRoot: testDir,
    projectName: "mock-pipeline-test",
    rateLimitOverride: {
      minDelayMs: 0,
      maxCallsPerMinute: 999,
      cooldownMs: 0,
      budget: { perThought: 50_000, perChain: 500_000, perSession: 2_000_000 },
    } as any,
  });

  const mock = new MockProvider();
  engine.providers.register(mock);

  const orchestrator = new Orchestrator(engine);

  const events: OrchestratorEvent[] = [];
  orchestrator.on(event => {
    events.push(event);
    if (event.type === "phase_start") {
      console.log(`  🔮 ${event.phase}: ${event.detail.slice(0, 60)}`);
    }
    if (event.type === "thought_complete") {
      const t = event.thought;
      console.log(`  ✅ ${t.id} [${t.layer}] → ${t.status} (${(t.confidence * 100).toFixed(0)}%)`);
    }
    if (event.type === "block_detected") {
      console.log(`  ❌ BLOCK: ${event.reason}`);
    }
    if (event.type === "pipeline_complete") {
      console.log(`  🏁 Pipeline complete: ${event.totalThoughts} thoughts, ${event.totalTokens} tokens`);
    }
  });

  console.log("\n═══ Mock Pipeline Integration Test ═══\n");

  const result = await orchestrator.run("Build a simple calculator");

  console.log(`\n═══ Result ═══`);
  console.log(`Success: ${result.success}`);
  console.log(`Thoughts: ${result.totalThoughts}`);
  console.log(`Tokens: ${result.totalTokens}`);
  console.log(`Blocked at: ${result.blockedAt ?? "none"}`);

  // Assertions
  assert.ok(result.success, "Pipeline should complete successfully with smart mock");
  assert.ok(result.totalThoughts >= 5, `Expected at least 5 thoughts, got ${result.totalThoughts}`);

  const phaseStarts = events.filter(e => e.type === "phase_start");
  assert.ok(phaseStarts.length >= 4, "Should have at least 4 phase starts (vision, decompose, research, execute)");

  const blocks = events.filter(e => e.type === "block_detected");
  console.log(`Blocks: ${blocks.length}`);

  const thoughtsCompleted = events.filter(e => e.type === "thought_complete");
  const successfulThoughts = thoughtsCompleted.filter(e =>
    (e as any).thought.status === "done"
  );
  assert.ok(successfulThoughts.length >= 3, `Expected at least 3 successful thoughts, got ${successfulThoughts.length}`);

  console.log(`\n✅ Mock pipeline integration test PASSED\n`);
  console.log(`   ${thoughtsCompleted.length} thoughts completed`);
  console.log(`   ${successfulThoughts.length} successful`);
  console.log(`   ${blocks.length} blocks`);

  // Cleanup
  rmSync(testDir, { recursive: true, force: true });
}

main().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
