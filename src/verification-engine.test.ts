/**
 * FOREMAN — Verification Engine Tests
 *
 * Tests for build output parsing, test result intelligence,
 * dev server health, output pattern analysis, and regression detection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBuildOutput,
  parseTestOutput,
  checkServerHealth,
  analyzeOutput,
  detectRegressions,
  type TestResult,
  type BuildError,
} from "./verification-engine.js";

// ─── BUILD VERIFICATION ──────────────────────────────────────

describe("build verification", () => {
  it("parses TypeScript errors", () => {
    const output = `src/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/app.ts(15,10): error TS2345: Argument of type 'boolean' is not assignable.`;

    const result = parseBuildOutput(output);
    assert.equal(result.success, false);
    assert.equal(result.errors.length, 2);
    assert.equal(result.errors[0].file, "src/app.ts");
    assert.equal(result.errors[0].line, 10);
    assert.equal(result.errors[0].column, 5);
    assert.equal(result.errors[0].code, "TS2322");
    assert.equal(result.errors[0].kind, "type");
  });

  it("parses colon-separated TypeScript errors", () => {
    const output = `src/index.ts:5:3 - error TS2304: Cannot find name 'foo'.`;

    const result = parseBuildOutput(output);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].file, "src/index.ts");
    assert.equal(result.errors[0].line, 5);
    assert.equal(result.errors[0].kind, "type");
    assert.equal(result.errors[0].code, "TS2304");
  });

  it("generates fix suggestions for common TS errors", () => {
    const output = `src/types.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'.`;
    const result = parseBuildOutput(output);
    assert.ok(result.errors[0].suggestion, "Should have a suggestion");
    assert.ok(result.errors[0].suggestion!.includes("Type mismatch"));
  });

  it("parses lint errors", () => {
    const output = `src/utils.ts:10:5: error no-unused-vars: 'x' is assigned but never used [eslint]`;

    const result = parseBuildOutput(output);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].kind, "lint");
    assert.equal(result.errors[0].file, "src/utils.ts");
  });

  it("handles clean build", () => {
    const output = `✓ TypeScript compiled successfully
Done in 2.5s`;

    const result = parseBuildOutput(output);
    assert.equal(result.success, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.summary.includes("passed"));
  });

  it("separates errors from warnings", () => {
    const output = `src/a.ts(1,1): error TS2322: Type mismatch.
src/b.ts(2,2): warning TS6133: Unused import.`;

    const result = parseBuildOutput(output);
    assert.equal(result.errors.length, 1);
    assert.equal(result.warnings.length, 1);
  });

  it("extracts unique error files", () => {
    const output = `src/a.ts(1,1): error TS2322: Error 1.
src/a.ts(5,1): error TS2322: Error 2.
src/b.ts(1,1): error TS2322: Error 3.`;

    const result = parseBuildOutput(output);
    assert.equal(result.errorFiles.length, 2);
    assert.ok(result.errorFiles.includes("src/a.ts"));
    assert.ok(result.errorFiles.includes("src/b.ts"));
  });

  it("handles generic error format", () => {
    const output = `src/main.ts:42:10: error: Cannot read properties of undefined`;

    const result = parseBuildOutput(output);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].line, 42);
    assert.equal(result.errors[0].kind, "reference");
  });

  it("detects import errors and suggests fix", () => {
    const output = `src/index.ts:1:1: error: Cannot find module 'lodash'`;

    const result = parseBuildOutput(output);
    assert.equal(result.errors[0].kind, "import");
    assert.ok(result.errors[0].suggestion?.includes("installed"));
  });

  it("truncates raw output to 4000 chars", () => {
    const longOutput = "x".repeat(10000);
    const result = parseBuildOutput(longOutput);
    assert.equal(result.rawOutput.length, 4000);
  });
});

// ─── TEST RESULT INTELLIGENCE ────────────────────────────────

describe("test result intelligence", () => {
  it("parses node:test output", () => {
    const output = `✔ should create user (1.5ms)
✔ should validate email (0.3ms)
✖ should hash password (2.1ms)
ℹ tests 3
ℹ pass 2
ℹ fail 1`;

    const result = parseTestOutput(output);
    assert.equal(result.runner, "node-test");
    assert.equal(result.total, 3);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.tests.length, 3);
  });

  it("parses custom Results format", () => {
    const output = `✅ Memory: create
✅ Memory: search
Results: 2 passed, 0 failed`;

    const result = parseTestOutput(output);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 2);
  });

  it("extracts individual test names and durations", () => {
    const output = `✔ build verification parses errors (0.5ms)
✔ test intelligence works (1.2ms)`;

    const result = parseTestOutput(output);
    assert.equal(result.tests.length, 2);
    assert.equal(result.tests[0].name, "build verification parses errors");
    assert.equal(result.tests[0].durationMs, 0.5);
    assert.equal(result.tests[0].status, "pass");
  });

  it("handles all-passing output", () => {
    const output = `✔ test 1
✔ test 2
ℹ tests 2
ℹ pass 2
ℹ fail 0`;

    const result = parseTestOutput(output);
    assert.equal(result.failed, 0);
    assert.ok(result.summary.includes("All 2 tests passing"));
  });

  it("generates summary for failures", () => {
    const output = `✔ test 1
✖ test 2
ℹ tests 2
ℹ pass 1
ℹ fail 1`;

    const result = parseTestOutput(output);
    assert.ok(result.summary.includes("1/2 tests failing"));
  });
});

// ─── DEV SERVER HEALTH ───────────────────────────────────────

describe("dev server health", () => {
  it("reports unreachable for non-existent server", async () => {
    // Port 19999 should not have anything running
    const result = await checkServerHealth("http://127.0.0.1:19999", 1000);
    assert.equal(result.reachable, false);
    assert.ok(result.error, "Should have an error message");
    assert.ok(result.responseTimeMs >= 0);
  });

  it("measures response time", async () => {
    const result = await checkServerHealth("http://127.0.0.1:19998", 500);
    assert.ok(typeof result.responseTimeMs === "number");
    assert.ok(result.responseTimeMs >= 0);
  });

  it("includes URL in result", async () => {
    const url = "http://127.0.0.1:19997";
    const result = await checkServerHealth(url, 500);
    assert.equal(result.url, url);
  });
});

// ─── OUTPUT PATTERN ANALYSIS ─────────────────────────────────

describe("output pattern analysis", () => {
  it("extracts deprecation warnings", () => {
    const output = `DeprecationWarning: Buffer() is deprecated. Use Buffer.alloc() instead.
DeprecationWarning: Buffer() is deprecated. Use Buffer.alloc() instead.
DeprecationWarning: util.isNullOrUndefined is deprecated.`;

    const patterns = analyzeOutput(output);
    assert.ok(patterns.length >= 1);
    const bufferDep = patterns.find(p => p.message.includes("Buffer"));
    assert.ok(bufferDep);
    assert.equal(bufferDep!.kind, "deprecation");
    assert.equal(bufferDep!.count, 2);
  });

  it("extracts security warnings", () => {
    const output = `found 3 vulnerabilities (1 moderate, 2 high)`;

    const patterns = analyzeOutput(output);
    const security = patterns.find(p => p.kind === "security");
    assert.ok(security, "Should find security pattern");
  });

  it("extracts performance metrics", () => {
    const output = `Build took 4.5 seconds
Compile took 120ms`;

    const patterns = analyzeOutput(output);
    const perf = patterns.filter(p => p.kind === "performance");
    assert.ok(perf.length >= 1);
  });

  it("handles clean output", () => {
    const output = `Everything is fine.
No issues found.`;

    const patterns = analyzeOutput(output);
    assert.equal(patterns.length, 0);
  });

  it("groups similar patterns and counts occurrences", () => {
    const output = `warning: unused variable 'x'
warning: unused variable 'y'
warning: unused variable 'z'`;

    const patterns = analyzeOutput(output);
    assert.ok(patterns.length >= 1);
    // All warnings should be grouped
    const totalCount = patterns.reduce((sum, p) => sum + p.count, 0);
    assert.ok(totalCount >= 3);
  });
});

// ─── REGRESSION DETECTION ────────────────────────────────────

describe("regression detection", () => {
  function makeTestResult(tests: Array<{ name: string; status: "pass" | "fail" }>): TestResult {
    return {
      runner: "node-test",
      total: tests.length,
      passed: tests.filter(t => t.status === "pass").length,
      failed: tests.filter(t => t.status === "fail").length,
      skipped: 0,
      tests: tests.map(t => ({ ...t })),
      failingFiles: [],
      summary: "",
    };
  }

  it("detects regressions (was passing, now failing)", () => {
    const previous = makeTestResult([
      { name: "test A", status: "pass" },
      { name: "test B", status: "pass" },
      { name: "test C", status: "pass" },
    ]);

    const current = makeTestResult([
      { name: "test A", status: "pass" },
      { name: "test B", status: "fail" },
      { name: "test C", status: "pass" },
    ]);

    const report = detectRegressions(previous, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, ["test B"]);
    assert.equal(report.newFailures.length, 0);
    assert.equal(report.fixedTests.length, 0);
  });

  it("detects fixes (was failing, now passing)", () => {
    const previous = makeTestResult([
      { name: "test A", status: "fail" },
      { name: "test B", status: "pass" },
    ]);

    const current = makeTestResult([
      { name: "test A", status: "pass" },
      { name: "test B", status: "pass" },
    ]);

    const report = detectRegressions(previous, current);
    assert.equal(report.hasRegression, false);
    assert.deepEqual(report.fixedTests, ["test A"]);
    assert.ok(report.summary.includes("fix"));
  });

  it("detects new failures (not in previous run)", () => {
    const previous = makeTestResult([
      { name: "test A", status: "pass" },
    ]);

    const current = makeTestResult([
      { name: "test A", status: "pass" },
      { name: "test B", status: "fail" },
    ]);

    const report = detectRegressions(previous, current);
    assert.equal(report.hasRegression, false);
    assert.deepEqual(report.newFailures, ["test B"]);
  });

  it("handles no changes", () => {
    const previous = makeTestResult([
      { name: "test A", status: "pass" },
      { name: "test B", status: "fail" },
    ]);

    const current = makeTestResult([
      { name: "test A", status: "pass" },
      { name: "test B", status: "fail" },
    ]);

    const report = detectRegressions(previous, current);
    assert.equal(report.hasRegression, false);
    assert.equal(report.regressions.length, 0);
    assert.equal(report.newFailures.length, 0);
    assert.equal(report.fixedTests.length, 0);
    assert.ok(report.summary.includes("No changes"));
  });

  it("handles complex mixed scenario", () => {
    const previous = makeTestResult([
      { name: "auth login", status: "pass" },
      { name: "auth logout", status: "fail" },
      { name: "db connect", status: "pass" },
    ]);

    const current = makeTestResult([
      { name: "auth login", status: "fail" },    // regression
      { name: "auth logout", status: "pass" },    // fix
      { name: "db connect", status: "pass" },     // stable
      { name: "db migrate", status: "fail" },     // new failure
    ]);

    const report = detectRegressions(previous, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, ["auth login"]);
    assert.deepEqual(report.fixedTests, ["auth logout"]);
    assert.deepEqual(report.newFailures, ["db migrate"]);
    assert.ok(report.summary.includes("regression"));
    assert.ok(report.summary.includes("fix"));
    assert.ok(report.summary.includes("new failure"));
  });
});
