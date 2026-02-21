/**
 * FOREMAN — Verification Engine
 *
 * Intelligent analysis of build output, test results, and dev server health.
 *
 * OpenClaw's approach: raw browser automation (Playwright) — takes screenshots,
 * clicks buttons, reads DOM. Good for end-user browser tasks, overkill for
 * a coding orchestrator.
 *
 * Foreman's approach: UNDERSTAND what commands produce.
 *
 * 1. BUILD VERIFICATION: Parse build output, extract errors with file:line,
 *    classify error types (syntax, type, import, runtime), suggest fixes.
 *    OpenClaw doesn't parse build output at all.
 *
 * 2. TEST RESULT INTELLIGENCE: Parse test output from any runner (Jest, Vitest,
 *    node:test, Mocha, pytest). Extract pass/fail/skip counts, failing test
 *    names, error messages. Detect regressions by comparing to previous runs.
 *    OpenClaw has no test output awareness.
 *
 * 3. DEV SERVER HEALTH: Check if localhost URLs respond, detect ports,
 *    verify HTTP status, measure response time. No browser needed.
 *    OpenClaw uses Playwright for this.
 *
 * 4. OUTPUT PATTERN ANALYSIS: Extract structured information from any
 *    command output — warnings, deprecations, performance metrics.
 *    OpenClaw processes none of this.
 *
 * 5. REGRESSION DETECTION: Compare current test/build results against
 *    previous runs to catch regressions before they're committed.
 *    OpenClaw has no regression awareness.
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// ─── TYPES ───────────────────────────────────────────────────

export interface BuildError {
  file: string;
  line: number;
  column: number;
  message: string;
  kind: BuildErrorKind;
  code?: string;
  /** Suggested fix (heuristic, not LLM) */
  suggestion?: string;
}

export type BuildErrorKind =
  | "syntax"
  | "type"
  | "import"
  | "reference"
  | "lint"
  | "deprecation"
  | "runtime"
  | "unknown";

export interface BuildResult {
  success: boolean;
  errors: BuildError[];
  warnings: BuildError[];
  /** Distinct error files */
  errorFiles: string[];
  /** Summary line */
  summary: string;
  /** Raw output (truncated) */
  rawOutput: string;
}

export interface TestCase {
  name: string;
  suite?: string;
  status: "pass" | "fail" | "skip" | "todo";
  durationMs?: number;
  error?: string;
  file?: string;
}

export interface TestResult {
  runner: TestRunner;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration?: number;
  tests: TestCase[];
  /** Files with failures */
  failingFiles: string[];
  /** Summary line */
  summary: string;
}

export type TestRunner = "node-test" | "vitest" | "jest" | "mocha" | "pytest" | "unknown";

export interface ServerHealthResult {
  url: string;
  reachable: boolean;
  statusCode?: number;
  responseTimeMs: number;
  contentType?: string;
  contentLength?: number;
  error?: string;
}

export interface OutputPattern {
  kind: "warning" | "deprecation" | "performance" | "info" | "security";
  message: string;
  count: number;
  source?: string;
}

export interface RegressionReport {
  hasRegression: boolean;
  newFailures: string[];
  fixedTests: string[];
  /** Tests that were passing and are now failing */
  regressions: string[];
  summary: string;
}

// ─── BUILD VERIFICATION ──────────────────────────────────────

/**
 * TypeScript error pattern: src/file.ts(10,5): error TS2322: ...
 * Also handles: src/file.ts:10:5 - error TS2322: ...
 */
const TS_ERROR_PATTERN = /^(.+?)[:(](\d+)[,:](\d+)\)?[: -]+(?:error|warning)\s+(TS\d+):\s*(.+)$/;

/**
 * ESLint / Oxlint pattern: /path/file.ts:10:5: error message [rule-name]
 */
const LINT_ERROR_PATTERN = /^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+?)(?:\s+\[(.+?)\])?$/;

/**
 * Generic compiler pattern: file.ts:10:5: error: message
 */
const GENERIC_ERROR_PATTERN = /^(.+?):(\d+):(\d+):\s*(?:error|Error):\s*(.+)$/;

/**
 * Node.js runtime error: at Object.<anonymous> (file.ts:10:5)
 */
const RUNTIME_ERROR_PATTERN = /^\s+at\s+.+?\((.+?):(\d+):(\d+)\)$/;

/**
 * Cannot find module pattern
 */
const IMPORT_ERROR_PATTERN = /Cannot find module ['"](.+?)['"]/;

/**
 * Classify an error message into a kind.
 */
function classifyError(message: string, code?: string): BuildErrorKind {
  if (code?.startsWith("TS")) return "type";
  if (IMPORT_ERROR_PATTERN.test(message)) return "import";
  if (/SyntaxError|Unexpected token|Unterminated/i.test(message)) return "syntax";
  if (/is not defined|is not a function|Cannot read propert/i.test(message)) return "reference";
  if (/deprecated|deprecation/i.test(message)) return "deprecation";
  if (/eslint|oxlint|no-unused/i.test(message)) return "lint";
  if (/TypeError|RangeError|ReferenceError/i.test(message)) return "runtime";
  return "unknown";
}

/**
 * Generate a heuristic fix suggestion for common errors.
 * No LLM needed — pattern matching only.
 */
function suggestFix(error: BuildError): string | undefined {
  const msg = error.message.toLowerCase();

  if (error.kind === "import") {
    const match = error.message.match(IMPORT_ERROR_PATTERN);
    if (match) return `Check if '${match[1]}' is installed (npm install) or the path is correct`;
  }

  if (error.kind === "type" && error.code === "TS2322") {
    return "Type mismatch — check the assigned value matches the expected type";
  }
  if (error.kind === "type" && error.code === "TS2345") {
    return "Argument type mismatch — check the function parameter types";
  }
  if (error.kind === "type" && error.code === "TS2304") {
    return "Name not found — add an import or declare the identifier";
  }
  if (error.kind === "type" && error.code === "TS7006") {
    return "Parameter needs a type annotation";
  }
  if (error.kind === "type" && error.code === "TS2339") {
    return "Property does not exist on type — check spelling or extend the type";
  }

  if (msg.includes("unexpected token")) {
    return "Syntax error — check for missing brackets, semicolons, or typos near this line";
  }
  if (msg.includes("is not defined")) {
    return "Variable/function not in scope — add an import or check spelling";
  }

  return undefined;
}

/**
 * Parse build output and extract structured errors.
 *
 * Supports: TypeScript (tsc), esbuild, Vite, ESLint/Oxlint, generic compilers.
 * OpenClaw doesn't parse build output — it's just raw text to the agent.
 * Foreman extracts: file, line, column, error kind, code, and suggests fixes.
 */
export function parseBuildOutput(output: string): BuildResult {
  const lines = output.split("\n");
  const errors: BuildError[] = [];
  const warnings: BuildError[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try TypeScript pattern first
    let match = trimmed.match(TS_ERROR_PATTERN);
    if (match) {
      const entry: BuildError = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[4],
        message: match[5],
        kind: classifyError(match[5], match[4]),
      };
      entry.suggestion = suggestFix(entry);

      if (trimmed.includes("warning")) {
        warnings.push(entry);
      } else {
        errors.push(entry);
      }
      continue;
    }

    // Try lint pattern
    match = trimmed.match(LINT_ERROR_PATTERN);
    if (match) {
      const isWarning = match[4] === "warning";
      const entry: BuildError = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[5],
        code: match[6],
        kind: "lint",
      };
      entry.suggestion = suggestFix(entry);
      (isWarning ? warnings : errors).push(entry);
      continue;
    }

    // Try generic error pattern
    match = trimmed.match(GENERIC_ERROR_PATTERN);
    if (match) {
      const entry: BuildError = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[4],
        kind: classifyError(match[4]),
      };
      entry.suggestion = suggestFix(entry);
      errors.push(entry);
      continue;
    }
  }

  const errorFiles = [...new Set(errors.map(e => e.file))];
  const success = errors.length === 0;

  return {
    success,
    errors,
    warnings,
    errorFiles,
    summary: success
      ? `Build passed${warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ""}`
      : `Build failed: ${errors.length} error(s) in ${errorFiles.length} file(s)`,
    rawOutput: output.slice(0, 4000),
  };
}

// ─── TEST RESULT INTELLIGENCE ────────────────────────────────

/**
 * Detect which test runner produced the output.
 */
function detectRunner(output: string): TestRunner {
  if (/ℹ tests \d+/m.test(output) || /^TAP version/m.test(output)) return "node-test";
  if (/✓|✗|Tests? Files?.*passed/i.test(output) && /vitest/i.test(output)) return "vitest";
  if (/Test Suites?:.*passed/i.test(output) || /jest/i.test(output)) return "jest";
  if (/\d+ passing.*\d+ failing/i.test(output) || /mocha/i.test(output)) return "mocha";
  if (/=+ (PASSED|FAILED|ERROR) =/i.test(output) || /pytest/i.test(output)) return "pytest";
  // Heuristic: Results: N passed pattern (our custom format)
  if (/Results:\s*\d+\s*passed/m.test(output)) return "node-test";
  return "unknown";
}

/** node:test format: ✔/✅ or ✖/❌ prefixed test names, ℹ summary */
function parseNodeTest(output: string): TestCase[] {
  const tests: TestCase[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // ✔ Test name (duration)  or  ✅ Test name
    const passMatch = trimmed.match(/^[✔✅]\s+(.+?)(?:\s+\(([0-9.]+)ms\))?$/);
    if (passMatch) {
      tests.push({
        name: passMatch[1],
        status: "pass",
        durationMs: passMatch[2] ? parseFloat(passMatch[2]) : undefined,
      });
      continue;
    }

    // ✖ Test name (duration)  or  ❌ Test name
    const failMatch = trimmed.match(/^[✖❌]\s+(.+?)(?:\s+\(([0-9.]+)ms\))?$/);
    if (failMatch) {
      tests.push({
        name: failMatch[1],
        status: "fail",
        durationMs: failMatch[2] ? parseFloat(failMatch[2]) : undefined,
      });
      continue;
    }

    // - Test name (skip/todo)
    const skipMatch = trimmed.match(/^[-⊘]\s+(.+?)(?:\s+#\s*(SKIP|TODO))?$/i);
    if (skipMatch && skipMatch[2]) {
      tests.push({
        name: skipMatch[1],
        status: skipMatch[2].toLowerCase() === "todo" ? "todo" : "skip",
      });
    }
  }

  return tests;
}

/** Extract summary counts from various formats */
function extractCounts(output: string): { passed: number; failed: number; skipped: number; total: number } {
  // node:test: ℹ tests N / ℹ pass N / ℹ fail N
  const nodeTests = output.match(/ℹ tests (\d+)/);
  const nodePass = output.match(/ℹ pass (\d+)/);
  const nodeFail = output.match(/ℹ fail (\d+)/);
  if (nodeTests) {
    return {
      total: parseInt(nodeTests[1], 10),
      passed: nodePass ? parseInt(nodePass[1], 10) : 0,
      failed: nodeFail ? parseInt(nodeFail[1], 10) : 0,
      skipped: 0,
    };
  }

  // Custom format: Results: N passed, M failed
  const customMatch = output.match(/Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
  if (customMatch) {
    const passed = parseInt(customMatch[1], 10);
    const failed = parseInt(customMatch[2], 10);
    return { total: passed + failed, passed, failed, skipped: 0 };
  }

  // Jest: Tests: N passed, M failed, K total
  const jestMatch = output.match(/Tests:\s*(?:(\d+)\s*failed,\s*)?(\d+)\s*passed,\s*(\d+)\s*total/);
  if (jestMatch) {
    return {
      total: parseInt(jestMatch[3], 10),
      passed: parseInt(jestMatch[2], 10),
      failed: jestMatch[1] ? parseInt(jestMatch[1], 10) : 0,
      skipped: 0,
    };
  }

  // Vitest: Tests N passed | M failed
  const vitestMatch = output.match(/Tests?\s+(\d+)\s*passed\s*(?:\|\s*(\d+)\s*failed)?/i);
  if (vitestMatch) {
    const passed = parseInt(vitestMatch[1], 10);
    const failed = vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0;
    return { total: passed + failed, passed, failed, skipped: 0 };
  }

  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

/**
 * Parse test runner output into structured results.
 *
 * Multi-runner support: node:test, Vitest, Jest, Mocha, pytest.
 * Extracts individual test cases with status, duration, errors.
 *
 * OpenClaw has zero test output parsing.
 * Foreman understands what the tests say.
 */
export function parseTestOutput(output: string): TestResult {
  const runner = detectRunner(output);
  const counts = extractCounts(output);
  const tests = parseNodeTest(output); // works for most ✔/✖ based formats

  // Extract failing test files from output
  const failingFiles: string[] = [];
  const fileFailPattern = /FAIL\s+(.+?\.(ts|js|tsx|jsx|py))/g;
  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = fileFailPattern.exec(output)) !== null) {
    failingFiles.push(fileMatch[1]);
  }

  // If we parsed individual tests, use those counts
  const total = counts.total || tests.length;
  const passed = counts.passed || tests.filter(t => t.status === "pass").length;
  const failed = counts.failed || tests.filter(t => t.status === "fail").length;
  const skipped = counts.skipped || tests.filter(t => t.status === "skip").length;

  return {
    runner,
    total,
    passed,
    failed,
    skipped,
    tests,
    failingFiles,
    summary: failed > 0
      ? `${failed}/${total} tests failing (${runner})`
      : `All ${total} tests passing (${runner})`,
  };
}

// ─── DEV SERVER HEALTH ───────────────────────────────────────

/**
 * Check if a URL is reachable and responding.
 *
 * No browser, no Playwright, no Puppeteer.
 * Just a raw HTTP request with timeout.
 *
 * OpenClaw fires up Playwright to check a dev server.
 * Foreman: 20 lines of Node.js.
 */
export function checkServerHealth(
  url: string,
  timeoutMs: number = 5000,
): Promise<ServerHealthResult> {
  return new Promise<ServerHealthResult>((resolve) => {
    const start = performance.now();
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(url, {
      method: "GET",
      timeout: timeoutMs,
      // Don't validate self-signed certs for local dev servers
      rejectUnauthorized: false,
    }, (res) => {
      const elapsed = performance.now() - start;
      resolve({
        url,
        reachable: true,
        statusCode: res.statusCode,
        responseTimeMs: Math.round(elapsed),
        contentType: res.headers["content-type"],
        contentLength: res.headers["content-length"]
          ? parseInt(res.headers["content-length"], 10)
          : undefined,
      });
      res.resume(); // consume response to free socket
    });

    req.on("error", (err) => {
      resolve({
        url,
        reachable: false,
        responseTimeMs: Math.round(performance.now() - start),
        error: err.message,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        url,
        reachable: false,
        responseTimeMs: timeoutMs,
        error: `Timeout after ${timeoutMs}ms`,
      });
    });

    req.end();
  });
}

/**
 * Detect which ports have dev servers running by scanning common ports.
 *
 * OpenClaw: no port detection.
 * Foreman: scans common dev ports and reports which ones are up.
 */
export async function detectDevServers(
  ports: number[] = [3000, 3001, 4000, 4173, 5000, 5173, 8000, 8080, 8888],
  host: string = "127.0.0.1",
): Promise<ServerHealthResult[]> {
  const results = await Promise.all(
    ports.map(port =>
      checkServerHealth(`http://${host}:${port}`, 2000)
    ),
  );

  return results.filter(r => r.reachable);
}

// ─── OUTPUT PATTERN ANALYSIS ─────────────────────────────────

/** Warning patterns from various tools */
const WARNING_PATTERNS: Array<{ pattern: RegExp; kind: OutputPattern["kind"] }> = [
  { pattern: /\bDeprecationWarning\b:?\s*(.+)/i, kind: "deprecation" },
  { pattern: /\bdeprecated\b.*?(?:use|replaced by)\s+['"]?(\S+)/i, kind: "deprecation" },
  { pattern: /\bExperimentalWarning\b:?\s*(.+)/i, kind: "warning" },
  { pattern: /\bwarning\b[: ]+(.{10,80})/i, kind: "warning" },
  { pattern: /\bvulnerabilit(?:y|ies)\b/i, kind: "security" },
  { pattern: /\baudit\b.*?(\d+)\s*(?:vulnerabilit|issue)/i, kind: "security" },
  { pattern: /\bperformance\b.*?(\d+(?:\.\d+)?)\s*(ms|s|seconds)/i, kind: "performance" },
  { pattern: /took\s+(\d+(?:\.\d+)?)\s*(ms|s|seconds|minutes)/i, kind: "performance" },
];

/**
 * Extract patterns from command output.
 *
 * Finds: warnings, deprecations, security issues, performance metrics.
 * Groups similar patterns and counts occurrences.
 *
 * OpenClaw: raw text. Agent reads everything.
 * Foreman: structured extraction. Agent reads summary.
 */
export function analyzeOutput(output: string): OutputPattern[] {
  const lines = output.split("\n");
  const patternMap = new Map<string, OutputPattern>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const { pattern, kind } of WARNING_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const message = match[1]?.trim() || trimmed.slice(0, 100);
        const key = `${kind}:${message.slice(0, 50)}`;

        const existing = patternMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          patternMap.set(key, {
            kind,
            message,
            count: 1,
          });
        }
        break; // one pattern per line
      }
    }
  }

  return [...patternMap.values()].sort((a, b) => b.count - a.count);
}

// ─── REGRESSION DETECTION ────────────────────────────────────

/**
 * Compare two test runs and detect regressions.
 *
 * A regression = a test that was PASSING before and is now FAILING.
 * A fix = a test that was FAILING before and is now PASSING.
 * A new failure = a test that wasn't in the previous run and is now failing.
 *
 * OpenClaw: no regression detection. Agent has to diff manually.
 * Foreman: automatic regression report.
 */
export function detectRegressions(
  previous: TestResult,
  current: TestResult,
): RegressionReport {
  const prevPassing = new Set(
    previous.tests.filter(t => t.status === "pass").map(t => t.name),
  );
  const prevFailing = new Set(
    previous.tests.filter(t => t.status === "fail").map(t => t.name),
  );

  const regressions: string[] = [];
  const fixedTests: string[] = [];
  const newFailures: string[] = [];

  for (const test of current.tests) {
    if (test.status === "fail") {
      if (prevPassing.has(test.name)) {
        regressions.push(test.name);
      } else if (!prevFailing.has(test.name)) {
        newFailures.push(test.name);
      }
    }
    if (test.status === "pass" && prevFailing.has(test.name)) {
      fixedTests.push(test.name);
    }
  }

  const hasRegression = regressions.length > 0;

  const parts: string[] = [];
  if (regressions.length > 0) parts.push(`⚠️ ${regressions.length} regression(s)`);
  if (newFailures.length > 0) parts.push(`${newFailures.length} new failure(s)`);
  if (fixedTests.length > 0) parts.push(`✅ ${fixedTests.length} fix(es)`);
  if (parts.length === 0) parts.push("No changes");

  return {
    hasRegression,
    regressions,
    newFailures,
    fixedTests,
    summary: parts.join(", "),
  };
}
