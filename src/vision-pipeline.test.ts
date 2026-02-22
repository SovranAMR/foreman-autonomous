import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Browser compareScreenshots", () => {
  it("detects identical screenshots", async () => {
    const { BrowserEngine } = await import("./browser-engine.js");
    const engine = new BrowserEngine("/tmp/test-project");

    // Create minimal valid PNG for testing (1x1 pixel red)
    const { PNG } = await import("pngjs");
    const png = new PNG({ width: 1, height: 1 });
    png.data[0] = 255; png.data[1] = 0; png.data[2] = 0; png.data[3] = 255;
    const pngBuf = PNG.sync.write(png);
    const b64 = pngBuf.toString("base64");

    const screenshot = {
      path: "/tmp/test.png",
      base64: b64,
      width: 1,
      height: 1,
      sizeBytes: pngBuf.length,
    };

    const diff = await engine.compareScreenshots(screenshot, screenshot);
    assert.equal(diff.diffScore, 0, "Identical screenshots should have 0 diff");
    assert.equal(diff.diffPixels, 0);
    assert.equal(diff.sameSize, true);
    assert.ok(diff.diffImageBase64, "Should produce diff mask image");
  });

  it("detects different screenshots", async () => {
    const { BrowserEngine } = await import("./browser-engine.js");
    const engine = new BrowserEngine("/tmp/test-project");

    const { PNG } = await import("pngjs");

    // Red pixel
    const png1 = new PNG({ width: 1, height: 1 });
    png1.data[0] = 255; png1.data[1] = 0; png1.data[2] = 0; png1.data[3] = 255;
    const buf1 = PNG.sync.write(png1);

    // Blue pixel
    const png2 = new PNG({ width: 1, height: 1 });
    png2.data[0] = 0; png2.data[1] = 0; png2.data[2] = 255; png2.data[3] = 255;
    const buf2 = PNG.sync.write(png2);

    const before = { path: "/tmp/b.png", base64: buf1.toString("base64"), width: 1, height: 1, sizeBytes: buf1.length };
    const after = { path: "/tmp/a.png", base64: buf2.toString("base64"), width: 1, height: 1, sizeBytes: buf2.length };

    const diff = await engine.compareScreenshots(before, after);
    assert.ok(diff.diffScore > 0, "Different screenshots should have non-zero diff");
    assert.ok(diff.diffPixels > 0);
    assert.equal(diff.sameSize, true);
  });

  it("handles size differences gracefully", async () => {
    const { BrowserEngine } = await import("./browser-engine.js");
    const engine = new BrowserEngine("/tmp/test-project");

    const { PNG } = await import("pngjs");

    const png1 = new PNG({ width: 2, height: 2 });
    for (let i = 0; i < 16; i++) png1.data[i] = 128;
    const buf1 = PNG.sync.write(png1);

    const png2 = new PNG({ width: 3, height: 3 });
    for (let i = 0; i < 36; i++) png2.data[i] = 200;
    const buf2 = PNG.sync.write(png2);

    const before = { path: "/tmp/b.png", base64: buf1.toString("base64"), width: 2, height: 2, sizeBytes: buf1.length };
    const after = { path: "/tmp/a.png", base64: buf2.toString("base64"), width: 3, height: 3, sizeBytes: buf2.length };

    const diff = await engine.compareScreenshots(before, after);
    assert.equal(diff.sameSize, false);
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
