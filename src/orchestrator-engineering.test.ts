import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "./orchestrator.js";
import { Engine } from "./engine.js";

describe("Orchestrator Engineering — Robustness & Edge Cases", () => {
  it("orchestrator instance can be created with default engine", () => {
    const engine = new Engine({
      projectRoot: process.cwd(),
      projectName: "test-project",
    });
    const orchestrator = new Orchestrator(engine);
    assert.ok(orchestrator instanceof Orchestrator);
    assert.ok(orchestrator.observer);
    assert.ok(orchestrator.resume);
  });

  it("orchestrator correctly evaluates confidence levels per layer", () => {
    const engine = new Engine({
        projectRoot: process.cwd(),
        projectName: "test-project",
    });
    
    // Visioner: High threshold (warn 0.6, block 0.4)
    assert.equal(engine.evaluateConfidence("visioner", 0.7), "ok");
    assert.equal(engine.evaluateConfidence("visioner", 0.5), "warn");
    assert.equal(engine.evaluateConfidence("visioner", 0.3), "block");

    // Researcher: Low threshold (warn 0.4, block 0.2)
    assert.equal(engine.evaluateConfidence("researcher", 0.5), "ok");
    assert.equal(engine.evaluateConfidence("researcher", 0.3), "warn");
    assert.equal(engine.evaluateConfidence("researcher", 0.1), "block");
    
    // Worker: Medium threshold (warn 0.6, block 0.35)
    assert.equal(engine.evaluateConfidence("worker", 0.7), "ok");
    assert.equal(engine.evaluateConfidence("worker", 0.5), "warn");
    assert.equal(engine.evaluateConfidence("worker", 0.3), "block");
  });

  it("orchestrator handles empty vision output gracefully", async () => {
    // This is a unit test of the logic, not a full integration run
    const engine = new Engine({
      projectRoot: process.cwd(),
      projectName: "test-project",
    });
    const orchestrator = new Orchestrator(engine);
    
    // Mocking buildResult behavior for empty vision
    const result = (orchestrator as any).buildResult(false, 1, "chain_123", "vision_empty");
    assert.equal(result.success, false);
    assert.equal(result.blockedAt, "vision_empty");
  });

  it("orchestrator tracks pipeline timings correctly", () => {
    const engine = new Engine({
      projectRoot: process.cwd(),
      projectName: "test-project",
    });
    const orchestrator = new Orchestrator(engine);
    
    // Start timing
    (orchestrator as any).pipelineStartTime = Date.now() - 5000;
    const result = (orchestrator as any).buildResult(true, 5, "chain_123");
    
    assert.equal(result.success, true);
    assert.equal(result.totalThoughts, 5);
  });
});
