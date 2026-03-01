/**
 * FOREMAN — Log Sense Module
 *
 * Scans log files and journal for recent errors.
 * Sources:
 * 1. Configured log file paths (logPaths in config)
 * 2. journalctl (last 15 minutes, priority err+)
 * 3. Foreman's own log output
 *
 * Produces findings when new errors are detected.
 * Uses a "last seen" watermark to avoid re-reporting old errors.
 *
 * Implementation: Reads last N lines of each log file (tail approach)
 * rather than parsing entire files — keeps memory and CPU usage low.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import type {
  SenseModule,
  SenseReport,
  SenseFinding,
  ConsciousnessConfig,
} from "../types.js";

/** Patterns that indicate an error in log output */
const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /\bFATAL\b/i,
  /\bCRITICAL\b/i,
  /\bPANIC\b/i,
  /\bOOM\b/i,
  /\bout of memory\b/i,
  /\bSegmentation fault\b/i,
  /\bKilled process\b/i,
  /\bUnhandledPromiseRejection\b/i,
  /\bECONNREFUSED\b/,
  /\bENOSPC\b/,
  /\bEACCES\b/,
];

/** Patterns to ignore (false positives) */
const IGNORE_PATTERNS = [
  /error\.ts/i,  // file names containing "error"
  /error-handler/i,
  /ErrorBoundary/i,
  /catch.*error/i,
  /\.error\s*=/,  // property assignments
];

export class LogSense implements SenseModule {
  readonly id = "log" as const;
  readonly name = "Log Scanner";

  /** Track last scanned position per file */
  private lastScanTimestamps: Map<string, number> = new Map();

  constructor(private config: ConsciousnessConfig) {}

  async scan(): Promise<SenseReport> {
    const start = Date.now();
    const findings: SenseFinding[] = [];

    try {
      // ── journalctl errors (last 15 min) ──
      const journalFindings = this.scanJournal();
      findings.push(...journalFindings);

      // ── Configured log files ──
      for (const logPath of this.config.logPaths) {
        const fileFindings = this.scanLogFile(logPath);
        findings.push(...fileFindings);
      }

      // ── dmesg errors (kernel-level issues) ──
      const dmesgFindings = this.scanDmesg();
      findings.push(...dmesgFindings);

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
   * Scan systemd journal for recent errors.
   */
  private scanJournal(): SenseFinding[] {
    const findings: SenseFinding[] = [];
    try {
      const output = execSync(
        'journalctl --no-pager -p err --since "15 min ago" -o short-iso 2>/dev/null | tail -20',
        { encoding: "utf-8", timeout: 5000 }
      );

      const errorLines = output.trim().split("\n").filter(l => l.trim().length > 0);
      if (errorLines.length > 0) {
        // Deduplicate similar errors
        const uniqueErrors = this.deduplicateErrors(errorLines);
        if (uniqueErrors.length > 0) {
          findings.push({
            key: "journal_errors",
            summary: `📋 ${uniqueErrors.length} yeni sistem hatası (son 15dk):\n${uniqueErrors.slice(0, 3).join("\n")}`,
            severity: uniqueErrors.length > 5 ? "warning" : "info",
            value: uniqueErrors.length,
            metadata: { errors: uniqueErrors.slice(0, 10) },
          });
        }
      }
    } catch {
      // journalctl not available or permission denied — skip
    }
    return findings;
  }

  /**
   * Scan a log file for recent errors.
   * Only reads lines newer than last scan.
   */
  private scanLogFile(path: string): SenseFinding[] {
    const findings: SenseFinding[] = [];

    try {
      if (!existsSync(path)) return findings;

      const stat = statSync(path);
      const lastScan = this.lastScanTimestamps.get(path) ?? 0;

      // Skip if file hasn't been modified since last scan
      if (stat.mtimeMs <= lastScan) return findings;

      // Read last 100 lines
      const output = execSync(`tail -100 "${path}" 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 3000,
      });

      const errorLines: string[] = [];
      for (const line of output.split("\n")) {
        if (this.isErrorLine(line)) {
          errorLines.push(line.trim().slice(0, 200));
        }
      }

      if (errorLines.length > 0) {
        const uniqueErrors = this.deduplicateErrors(errorLines);
        if (uniqueErrors.length > 0) {
          findings.push({
            key: `log_errors_${path.replace(/[^a-zA-Z0-9]/g, "_")}`,
            summary: `📋 ${uniqueErrors.length} hata: ${path}\n${uniqueErrors[0]}`,
            severity: uniqueErrors.length > 5 ? "warning" : "info",
            value: uniqueErrors.length,
            metadata: { path, errors: uniqueErrors.slice(0, 5) },
          });
        }
      }

      this.lastScanTimestamps.set(path, stat.mtimeMs);
    } catch {
      // File read error — skip
    }

    return findings;
  }

  /**
   * Scan dmesg for kernel-level errors (OOM, hardware issues).
   */
  private scanDmesg(): SenseFinding[] {
    const findings: SenseFinding[] = [];
    try {
      const output = execSync(
        'dmesg --level=err,crit,alert,emerg -T 2>/dev/null | tail -10',
        { encoding: "utf-8", timeout: 3000 }
      );

      const lines = output.trim().split("\n").filter(l => l.trim().length > 0);

      // Check for OOM specifically
      const oomLines = lines.filter(l => /oom|out of memory|killed process/i.test(l));
      if (oomLines.length > 0) {
        findings.push({
          key: "dmesg_oom",
          summary: `💀 OOM Killer aktif! Süreçler öldürülüyor:\n${oomLines[0].slice(0, 200)}`,
          severity: "critical",
          value: oomLines.length,
        });
      }
    } catch {
      // dmesg requires root — skip if permission denied
    }

    return findings;
  }

  /**
   * Check if a line matches error patterns (and isn't a false positive).
   */
  private isErrorLine(line: string): boolean {
    if (!line || line.length < 5) return false;

    // Check ignore patterns first
    for (const pattern of IGNORE_PATTERNS) {
      if (pattern.test(line)) return false;
    }

    // Check error patterns
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(line)) return true;
    }

    return false;
  }

  /**
   * Deduplicate similar error lines.
   * Groups by first 50 chars and keeps one representative from each group.
   */
  private deduplicateErrors(lines: string[]): string[] {
    const seen = new Map<string, string>();
    for (const line of lines) {
      // Normalize: remove timestamps, PIDs, hex addresses
      const key = line
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*/g, "")
        .replace(/\b\d+\b/g, "N")
        .replace(/0x[0-9a-f]+/gi, "0xN")
        .trim()
        .slice(0, 60);
      if (!seen.has(key)) {
        seen.set(key, line.trim().slice(0, 200));
      }
    }
    return [...seen.values()];
  }
}
