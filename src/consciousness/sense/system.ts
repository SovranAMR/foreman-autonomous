/**
 * FOREMAN — System Sense Module
 *
 * Monitors hardware resources: CPU load, RAM usage, disk usage, uptime.
 * Uses native Node.js `os` module — no external dependencies.
 *
 * Thresholds are configurable via ConsciousnessConfig.
 * Produces findings when resources exceed thresholds.
 *
 * Implementation notes:
 * - CPU load uses os.loadavg()[0] (1-minute average) normalized by CPU count
 * - RAM uses os.freemem()/os.totalmem()
 * - Disk uses `df` command (POSIX — works on Linux/macOS)
 * - All operations are non-blocking except disk check (child_process)
 */

import { cpus, loadavg, freemem, totalmem, uptime } from "node:os";
import { execSync } from "node:child_process";
import type {
  SenseModule,
  SenseReport,
  SenseFinding,
  ConsciousnessConfig,
} from "../types.js";

export class SystemSense implements SenseModule {
  readonly id = "system" as const;
  readonly name = "System Resources";

  constructor(private config: ConsciousnessConfig) {}

  async scan(): Promise<SenseReport> {
    const start = Date.now();
    const findings: SenseFinding[] = [];

    try {
      // ── CPU Load ──
      const cpuCount = cpus().length || 1;
      const load1m = loadavg()[0]; // 1-minute average
      const normalizedLoad = load1m / cpuCount; // 0.0 to 1.0+ (can exceed 1.0 under heavy load)

      if (normalizedLoad >= this.config.cpuWarningThreshold) {
        findings.push({
          key: "cpu_load_high",
          summary: `CPU yükü yüksek: ${(normalizedLoad * 100).toFixed(0)}% (${load1m.toFixed(2)} / ${cpuCount} core)`,
          severity: normalizedLoad >= 1.0 ? "critical" : "warning",
          value: normalizedLoad,
          metadata: { load1m, cpuCount },
        });
      }

      // ── RAM Usage ──
      const totalMem = totalmem();
      const freeMem = freemem();
      const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

      if (usedPercent >= this.config.ramWarningThreshold) {
        const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);
        const freeGB = (freeMem / 1024 / 1024 / 1024).toFixed(1);
        findings.push({
          key: "ram_usage_high",
          summary: `RAM kullanımı yüksek: ${usedPercent.toFixed(0)}% (${freeGB}GB boş / ${totalGB}GB toplam)`,
          severity: usedPercent >= 95 ? "critical" : "warning",
          value: usedPercent,
          metadata: { totalMem, freeMem, totalGB, freeGB },
        });
      }

      // ── Disk Usage ──
      const diskFindings = this.checkDiskUsage();
      findings.push(...diskFindings);

      // ── Uptime ──
      const uptimeSec = uptime();
      // If uptime is very low, system just rebooted — worth noting
      if (uptimeSec < 300) {
        findings.push({
          key: "system_just_rebooted",
          summary: `Sistem az önce yeniden başlatıldı (uptime: ${Math.floor(uptimeSec)}s)`,
          severity: "info",
          value: uptimeSec,
        });
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
   * Check disk usage via `df` command.
   * Parses output to find partitions above threshold.
   * Only checks real filesystems (excludes tmpfs, devtmpfs, etc.)
   */
  private checkDiskUsage(): SenseFinding[] {
    const findings: SenseFinding[] = [];

    try {
      // -P = POSIX output format (consistent columns), --local = only local filesystems
      const output = execSync("df -P --local 2>/dev/null || df -P 2>/dev/null", {
        encoding: "utf-8",
        timeout: 5000,
      });

      const lines = output.trim().split("\n").slice(1); // skip header

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 6) continue;

        const filesystem = parts[0];
        const usedPercent = parseInt(parts[4], 10);
        const mountpoint = parts[5];

        // Skip virtual filesystems
        if (
          filesystem.startsWith("tmpfs") ||
          filesystem.startsWith("devtmpfs") ||
          filesystem.startsWith("udev") ||
          filesystem === "none" ||
          mountpoint.startsWith("/snap/") ||
          mountpoint.startsWith("/boot/efi")
        ) {
          continue;
        }

        if (usedPercent >= this.config.diskCriticalThreshold) {
          findings.push({
            key: `disk_critical_${mountpoint.replace(/\//g, "_")}`,
            summary: `💾 Disk KRİTİK: ${mountpoint} → ${usedPercent}% dolu!`,
            severity: "critical",
            value: usedPercent,
            metadata: { filesystem, mountpoint },
          });
        } else if (usedPercent >= this.config.diskWarningThreshold) {
          findings.push({
            key: `disk_warning_${mountpoint.replace(/\//g, "_")}`,
            summary: `💾 Disk uyarı: ${mountpoint} → ${usedPercent}% dolu`,
            severity: "warning",
            value: usedPercent,
            metadata: { filesystem, mountpoint },
          });
        }
      }
    } catch {
      // df failed — not critical, just skip disk check
    }

    return findings;
  }
}
