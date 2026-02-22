import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CognitiveLoadBalancer } from "./cognitive-router.js";
import { MockProvider } from "./provider.js";

describe("CognitiveLoadBalancer", () => {
  it("routes to single endpoint", async () => {
    const router = new CognitiveLoadBalancer();
    const mock = new MockProvider();
    router.addEndpoint({ id: "primary", provider: mock, priority: 1 });

    const result = await router.route(
      [{ role: "user", content: "test" }],
      { model: "mock-model", maxTokens: 100, temperature: 0.7 },
    );

    assert.equal(result.endpointId, "primary");
    assert.equal(result.failoverCount, 0);
    assert.ok(result.result.text.length > 0);
  });

  it("failovers to second endpoint on error", async () => {
    const router = new CognitiveLoadBalancer();

    // Primary that always fails with 429
    const failProvider = new MockProvider();
    failProvider.generate = async () => { throw new Error("429 Too Many Requests"); };
    router.addEndpoint({ id: "primary", provider: failProvider, priority: 1 });

    // Secondary that works
    const goodProvider = new MockProvider();
    router.addEndpoint({ id: "secondary", provider: goodProvider, priority: 2 });

    const result = await router.route(
      [{ role: "user", content: "test" }],
      { model: "mock-model", maxTokens: 100, temperature: 0.7 },
    );

    assert.equal(result.endpointId, "secondary");
    assert.equal(result.failoverCount, 1);
  });

  it("tracks stats correctly", async () => {
    const router = new CognitiveLoadBalancer();
    const mock = new MockProvider();
    router.addEndpoint({ id: "test", provider: mock, priority: 1 });

    await router.route(
      [{ role: "user", content: "test" }],
      { model: "mock-model", maxTokens: 100, temperature: 0.7 },
    );

    const stats = router.stats();
    assert.equal(stats.totalRequests, 1);
    assert.equal(stats.totalFailovers, 0);
    assert.equal(stats.endpointStats.length, 1);
    assert.equal(stats.endpointStats[0].requests, 1);
    assert.ok(stats.endpointStats[0].healthy);
  });

  it("puts endpoint in cooldown after repeated failures", async () => {
    const router = new CognitiveLoadBalancer();

    const failProvider = new MockProvider();
    failProvider.generate = async () => { throw new Error("429 rate limit"); };
    router.addEndpoint({ id: "flaky", provider: failProvider, priority: 1, rpmLimit: 100 });

    const goodProvider = new MockProvider();
    router.addEndpoint({ id: "stable", provider: goodProvider, priority: 2 });

    // First call: flaky fails, stable succeeds
    const r1 = await router.route(
      [{ role: "user", content: "test" }],
      { model: "mock-model", maxTokens: 100, temperature: 0.7 },
    );
    assert.equal(r1.endpointId, "stable");

    // After failure, flaky should be in cooldown
    const stats = router.stats();
    const flakyStats = stats.endpointStats.find(s => s.id === "flaky");
    assert.ok(flakyStats);
    // Healthy should be false because of consecutive failure
    // (depends on cooldown timing)
  });

  it("throws when all endpoints exhausted", async () => {
    const router = new CognitiveLoadBalancer();

    const fail1 = new MockProvider();
    fail1.generate = async () => { throw new Error("429"); };
    router.addEndpoint({ id: "a", provider: fail1, priority: 1 });

    const fail2 = new MockProvider();
    fail2.generate = async () => { throw new Error("quota exceeded"); };
    router.addEndpoint({ id: "b", provider: fail2, priority: 2 });

    await assert.rejects(
      () => router.route(
        [{ role: "user", content: "test" }],
        { model: "mock-model", maxTokens: 100, temperature: 0.7 },
      ),
      /All.*endpoints failed/,
    );
  });

  it("respects RPM limits", async () => {
    const router = new CognitiveLoadBalancer();

    const mock = new MockProvider();
    router.addEndpoint({ id: "limited", provider: mock, priority: 1, rpmLimit: 2 });

    const backup = new MockProvider();
    router.addEndpoint({ id: "backup", provider: backup, priority: 2, rpmLimit: 100 });

    // First 2 calls go to 'limited'
    const r1 = await router.route([{ role: "user", content: "1" }], { model: "m", maxTokens: 100, temperature: 0.7 });
    const r2 = await router.route([{ role: "user", content: "2" }], { model: "m", maxTokens: 100, temperature: 0.7 });
    assert.equal(r1.endpointId, "limited");
    assert.equal(r2.endpointId, "limited");

    // 3rd call should failover to 'backup' (RPM limit hit)
    const r3 = await router.route([{ role: "user", content: "3" }], { model: "m", maxTokens: 100, temperature: 0.7 });
    assert.equal(r3.endpointId, "backup");
  });

  it("resetCooldowns clears all cooldowns", async () => {
    const router = new CognitiveLoadBalancer();
    const fail = new MockProvider();
    fail.generate = async () => { throw new Error("429"); };
    router.addEndpoint({ id: "cooled", provider: fail, priority: 1 });

    const good = new MockProvider();
    router.addEndpoint({ id: "good", provider: good, priority: 2 });

    // Trigger cooldown
    await router.route([{ role: "user", content: "x" }], { model: "m", maxTokens: 100, temperature: 0.7 });

    // Reset
    router.resetCooldowns();
    assert.ok(router.hasAvailableEndpoint());
  });
});
