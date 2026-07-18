import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { quickReviewCheck, buildReviewPrompt, parseReviewResponse, classifyReviewerLlmResponse } from "./reviewer-gate.js";
import type { WorkerProtocol } from "./types.js";

describe("Reviewer Gate", () => {
  const goodProtocol: WorkerProtocol = {
    step1_read: "Read HeroSection.tsx: 350 lines, SVG path at line 180, GSAP timeline at line 75",
    step2_context: "SVG inside motion.div z-index:-10, GSAP timeline has 3 tweens, path 'smileArc'",
    step3_impact: "Adding strokeDasharray won't affect fill (none). No other animations target this path.",
    step4_decide: "Line 182: add strokeDasharray='500' strokeDashoffset='500'. Line 80: GSAP tween at 0.3",
    step5_predict: "Smile arc draws left-to-right over 1.8s, starting 0.3s after bloom",
    step6_execute: "Added strokeDasharray and strokeDashoffset to SVG path, GSAP tween added to timeline",
    step7_verify: "Build passed ✔, 12 tests pass, visual check shows arc drawing correctly",
    step8_report: "SVG draw-on animation working. No unexpected side effects found.",
  };

  const visionDoc = `## Vision
**EMOTION TARGET**: Quiet luxury
**FOCAL POINT**: Single smile arc
**COLOR PHILOSOPHY**: Gold + dark, max 3 colors
**MOTION BUDGET**: 2 animations max
**FORBIDDEN LIST**:
- Particle rain
- Blur spam
- Hover effects on mobile
- More than 3 colors`;

  it("passes good protocol", () => {
    const result = quickReviewCheck(goodProtocol, visionDoc);
    assert.equal(result, null, "Should pass quick review (null = no issues)");
  });

  it("rejects trivial step7_verify", () => {
    const badProtocol = { ...goodProtocol, step7_verify: "Looks good" };
    const result = quickReviewCheck(badProtocol, visionDoc);
    assert.ok(result);
    assert.equal(result!.verdict, "REJECT");
    assert.ok(result!.violations.some(v => v.includes("STEP7_VERIFY")));
  });

  it("rejects hallucinated step1_read", () => {
    const badProtocol = { ...goodProtocol, step1_read: "I read the file and it looked fine" };
    const result = quickReviewCheck(badProtocol, visionDoc);
    assert.ok(result);
    assert.equal(result!.verdict, "REJECT");
    assert.ok(result!.violations.some(v => v.includes("hallucinated")));
  });

  it("detects FORBIDDEN violations", () => {
    const badProtocol = {
      ...goodProtocol,
      step6_execute: "Added particle rain effect with 500 floating dots and blur background",
    };
    const result = quickReviewCheck(badProtocol, visionDoc);
    assert.ok(result);
    assert.equal(result!.verdict, "REJECT");
    assert.ok(result!.violations.some(v => v.includes("FORBIDDEN")));
  });

  it("builds review prompt with all sections", () => {
    const prompt = buildReviewPrompt({
      protocol: goodProtocol,
      atom: "Add SVG draw-on animation",
      visionDocument: visionDoc,
      codeDiff: "+strokeDasharray='500'",
      block: "Background Visual",
    });
    assert.ok(prompt.includes("VISION DOCUMENT"));
    assert.ok(prompt.includes("STEP1_READ"));
    assert.ok(prompt.includes("CODE DIFF"));
    assert.ok(prompt.includes("Background Visual"));
  });

  it("parses PASS response", () => {
    const response = `VERDICT: PASS
REASONING: The code aligns with the vision document. SVG draw-on serves the focal point.
VIOLATIONS: None
SUGGESTIONS: Consider adding will-change for GPU acceleration
CONFIDENCE: 0.92`;
    const result = parseReviewResponse(response);
    assert.equal(result.verdict, "PASS");
    assert.equal(result.violations.length, 0);
    assert.ok(result.confidence > 0.9);
    assert.equal(result.rejectionFeedback, undefined);
  });

  it("parses REJECT response", () => {
    const response = `VERDICT: REJECT
REASONING: Worker added particle effect which is on the FORBIDDEN list.
VIOLATIONS: Particle rain is forbidden, Motion budget exceeded (3 animations, max 2)
SUGGESTIONS: Remove particle system. Use a static gradient instead.
CONFIDENCE: 0.95`;
    const result = parseReviewResponse(response);
    assert.equal(result.verdict, "REJECT");
    assert.ok(result.violations.length >= 2);
    assert.ok(result.rejectionFeedback);
    assert.ok(result.rejectionFeedback!.includes("particle"));
  });

  it("parses NEEDS_REVISION response", () => {
    const response = `VERDICT: NEEDS_REVISION
REASONING: Animation direction is correct but timing conflicts with bloom.
VIOLATIONS: None
SUGGESTIONS: Adjust start time from 0.1s to 0.3s to avoid overlap
CONFIDENCE: 0.7`;
    const result = parseReviewResponse(response);
    assert.equal(result.verdict, "NEEDS_REVISION");
    assert.ok(result.suggestions.length > 0);
  });

  it("classifies empty reviewer LLM responses as insufficient", () => {
    assert.equal(classifyReviewerLlmResponse("").sufficient, false);
    assert.equal(classifyReviewerLlmResponse("   ").sufficient, false);
    assert.equal(classifyReviewerLlmResponse("short").sufficient, false);
  });

  it("classifies substantive reviewer LLM responses as sufficient", () => {
    const text = "VERDICT: PASS\nREASONING: All checks passed.";
    const result = classifyReviewerLlmResponse(text);
    assert.equal(result.sufficient, true);
    assert.equal(result.trimmed, text);
  });
});
