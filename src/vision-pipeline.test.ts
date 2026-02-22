import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Browser compareScreenshots", () => {
  // Import dynamically to avoid Playwright dependency in test env
  it("detects identical screenshots", async () => {
    const { BrowserEngine } = await import("./browser-engine.js");
    const engine = new BrowserEngine("/tmp/test-project");

    const screenshot = {
      path: "/tmp/test.png",
      base64: Buffer.from("identical content here for testing").toString("base64"),
      width: 1920,
      height: 1080,
      sizeBytes: 34,
    };

    const diff = engine.compareScreenshots(screenshot, screenshot);
    assert.equal(diff.diffScore, 0, "Identical screenshots should have 0 diff");
    assert.equal(diff.sameSize, true);
  });

  it("detects different screenshots", async () => {
    const { BrowserEngine } = await import("./browser-engine.js");
    const engine = new BrowserEngine("/tmp/test-project");

    const before = {
      path: "/tmp/before.png",
      base64: Buffer.from("AAAAAAAAAA".repeat(100)).toString("base64"),
      width: 1920,
      height: 1080,
      sizeBytes: 1000,
    };
    const after = {
      path: "/tmp/after.png",
      base64: Buffer.from("BBBBBBBBBB".repeat(100)).toString("base64"),
      width: 1920,
      height: 1080,
      sizeBytes: 1000,
    };

    const diff = engine.compareScreenshots(before, after);
    assert.ok(diff.diffScore > 0, "Different screenshots should have non-zero diff");
    assert.equal(diff.sameSize, true);
  });

  it("detects size differences", async () => {
    const { BrowserEngine } = await import("./browser-engine.js");
    const engine = new BrowserEngine("/tmp/test-project");

    const before = {
      path: "/tmp/before.png",
      base64: Buffer.from("short").toString("base64"),
      width: 800,
      height: 600,
      sizeBytes: 5,
    };
    const after = {
      path: "/tmp/after.png",
      base64: Buffer.from("much longer content here").toString("base64"),
      width: 1920,
      height: 1080,
      sizeBytes: 24,
    };

    const diff = engine.compareScreenshots(before, after);
    assert.equal(diff.sameSize, false);
    assert.ok(diff.diffScore > 0);
  });
});

describe("InteractiveConfirm.isEnabled", () => {
  it("returns false when not interactive", async () => {
    const { InteractiveConfirm } = await import("./interactive-confirm.js");
    const ic = new InteractiveConfirm({ enabled: false });
    assert.equal(ic.isEnabled(), false);
  });

  it("returns true when enabled", async () => {
    const { InteractiveConfirm } = await import("./interactive-confirm.js");
    const ic = new InteractiveConfirm({ enabled: true });
    assert.equal(ic.isEnabled(), true);
  });
});

describe("LLMMessage with images", () => {
  it("supports image attachments", async () => {
    const { MockProvider } = await import("./provider.js");
    const mock = new MockProvider();

    // Verify MockProvider handles messages with images without crashing
    const result = await mock.generate([
      { role: "system", content: "You are a visual QA specialist." },
      {
        role: "user",
        content: "Analyze this screenshot",
        images: [{ mimeType: "image/png", base64: "iVBORw0KGgo=" }],
      },
    ], { model: "mock-model", maxTokens: 4000, temperature: 0.7 });

    assert.ok(result.text.length > 0);
    assert.ok(result.tokenUsage.total > 0);
  });
});
