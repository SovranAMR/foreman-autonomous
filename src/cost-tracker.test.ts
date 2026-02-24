import { CostTracker, MODEL_COSTS } from "./cost-tracker.js";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert";

async function runTests() {
  const projectRoot = "/tmp/foreman-test-cost";
  const storagePath = join(projectRoot, ".foreman", "cost-history.json");

  console.log("Running CostTracker tests...");

  // Setup
  if (existsSync(projectRoot)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }

  // 1. Correct calculation
  {
    const tracker = new CostTracker(projectRoot);
    const entry = tracker.record("gpt-4o", "test", 100_000, 10_000);
    const expectedCost = (100_000 / 1_000_000) * 2.50 + (10_000 / 1_000_000) * 10.0;
    assert.ok(Math.abs(entry.cost - expectedCost) < 0.00001, "Cost calculation failed");
    assert.ok(Math.abs(tracker.getTotalCost() - expectedCost) < 0.00001, "Total cost failed");
    console.log("✅ Cost calculation passed");
  }

  // 2. Fuzzy match
  {
    const tracker = new CostTracker(projectRoot);
    const entry = tracker.record("gemini-2.0-flash-latest", "test", 1_000_000, 0);
    const pricing = MODEL_COSTS["gemini-2.0-flash"];
    assert.ok(Math.abs(entry.cost - pricing.input) < 0.00001, "Fuzzy match failed");
    console.log("✅ Fuzzy match passed");
  }

  // 3. Persist
  {
    assert.ok(existsSync(storagePath), "Storage file missing");
    const data = JSON.parse(readFileSync(storagePath, "utf-8"));
    assert.strictEqual(data.entries.length, 2, "Persistence failed");
    console.log("✅ Persistence passed");
  }

  // 4. Alerts
  {
    let alertMsg = "";
    const tracker = new CostTracker(projectRoot, { perSession: 1.0, alertThreshold: 0.5 });
    tracker.onAlert(msg => { alertMsg = msg; });
    tracker.record("claude-opus-4", "test", 100_000, 0);
    assert.ok(alertMsg.includes("approaching budget"), "Alert failed");
    console.log("✅ Budget alerts passed");
  }

  console.log("\n────────────────────────────────────────");
  console.log("Results: All tests passed");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
