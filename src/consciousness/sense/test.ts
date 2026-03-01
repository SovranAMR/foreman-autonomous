/**
 * FOREMAN — Test Sense Module
 *
 * Monitors the project's test suite health.
 * Runs a quick test check without executing the full suite:
 * 1. First tries to find cached test results (e.g., from last CI run)
 * 2. Falls back to running `npm test` with a timeout
 *
 * Produces findings when tests are failing.
 *
 * Design decision: We run tests with a timeout to avoid blocking
 * the consciousness loop. If tests take too long, we report "unknown"
 * rather than stalling the entire tick.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  SenseModule,
  SenseReport,
  SenseFinding,
  ConsciousnessConfig,
} from "../types.js";

export class TestSense implements SenseModule {
  readonly id = "test" as const;
  readonly name = "Test Suite";

  /** Maximum time to wait for tests (ms) */
  private readonly TEST_TIMEOUT_MS = 120_000; // 2 minutes

  constructor(private config: ConsciousnessConfig) {}

  async scan(): Promise<SenseReport> {
    const start = Date.now();
    const findings: SenseFinding[] = [];

    try {
      const root = this.config.projectRoot;

      // Check if project has a test script
      const pkgPath = join(root, "package.json");
      if (!existsSync(pkgPath)) {
        return this.emptyReport(start);
      }

      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (!pkg.scripts?.test) {
        return this.emptyReport(start);
      }

      // ── Check for cached test results ──
      const cachedResult = this.checkCachedResults(root);
      if (cachedResult) {
        if (cachedResult.failing > 0) {
          findings.push({
            key: "test_failures",
            summary: `🧪 ${cachedResult.failing} test başarısız (${cachedResult.passing} geçti)`,
            severity: cachedResult.failing > 5 ? "critical" : "warning",
            value: cachedResult.failing,
            metadata: cachedResult,
          });
        }
        return {
          senseId: this.id,
          timestamp: Date.now(),
          durationMs: Date.now() - start,
          findings,
        };
      }

      // ── Run tests with timeout ──
      try {
        const output = execSync("npm test 2>&1", {
          encoding: "utf-8",
          cwd: root,
          timeout: this.TEST_TIMEOUT_MS,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
        });

        // Parse test output for failures
        const result = this.parseTestOutput(output);
        if (result.failing > 0) {
          findings.push({
            key: "test_failures",
            summary: `🧪 ${result.failing} test başarısız (${result.passing} geçti)`,
            severity: result.failing > 5 ? "critical" : "warning",
            value: result.failing,
            metadata: { ...result, fromCache: false },
          });
        }
      } catch (err: unknown) {
        // Test command failed — likely test failures
        const error = err as { stdout?: string; stderr?: string; status?: number };
        const output = (error.stdout ?? "") + (error.stderr ?? "");

        if (error.status === null) {
          // Timeout — tests took too long
          findings.push({
            key: "test_timeout",
            summary: "🧪 Test suite zaman aşımına uğradı (>2dk)",
            severity: "warning",
          });
        } else {
          const result = this.parseTestOutput(output);
          findings.push({
            key: "test_failures",
            summary: `🧪 ${result.failing || "?"} test başarısız`,
            severity: "warning",
            value: result.failing,
            metadata: { ...result, exitCode: error.status },
          });
        }
      }

      return {
        senseId: this.id,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
        findings,
      };
    } catch (err) {
      return {
        senseId: this.id,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
        findings,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check for cached test results (e.g., vitest json reporter, jest json output).
   */
  private checkCachedResults(root: string): { passing: number; failing: number; total: number } | null {
    // Check common test result file locations
    const candidates = [
      join(root, "test-results.json"),
      join(root, ".foreman", "test-results.json"),
      join(root, "coverage", "test-results.json"),
    ];

    for (const path of candidates) {
      try {
        if (!existsSync(path)) continue;
        const stat = statSync(path);
        // Only use if less than 1 hour old
        if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) continue;

        const data = JSON.parse(readFileSync(path, "utf-8"));
        if (typeof data.numPassedTests === "number") {
          // Jest format
          return {
            passing: data.numPassedTests,
            failing: data.numFailedTests || 0,
            total: data.numTotalTests || 0,
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Parse test runner output to extract pass/fail counts.
   * Handles: Node.js test runner, Jest, Vitest, Mocha output formats.
   */
  private parseTestOutput(output: string): { passing: number; failing: number; total: number; failedNames: string[] } {
    const failedNames: string[] = [];
    let passing = 0;
    let failing = 0;

    // Node.js native test runner: "# pass 5" "# fail 2"
    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    if (passMatch) passing = parseInt(passMatch[1], 10);
    if (failMatch) failing = parseInt(failMatch[1], 10);

    // Also count ✔ and ✖ symbols
    if (passing === 0 && failing === 0) {
      passing = (output.match(/✔/g) || []).length;
      failing = (output.match(/✖/g) || []).length;
    }

    // Extract failed test names
    const failedLines = output.match(/✖ (.+)/g);
    if (failedLines) {
      for (const line of failedLines) {
        failedNames.push(line.replace(/✖ /, "").trim());
      }
    }

    return { passing, failing, total: passing + failing, failedNames };
  }

  private emptyReport(start: number): SenseReport {
    return {
      senseId: this.id,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
      findings: [],
    };
  }
}
