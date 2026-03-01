/**
 * FOREMAN — Service Sense Module
 *
 * Monitors critical system services and processes.
 * Checks:
 * 1. systemd units (via systemctl is-active)
 * 2. Process presence (via pgrep)
 * 3. Port availability (via /dev/tcp or ss)
 *
 * Can detect:
 * - Service down → auto-restart candidate
 * - Service flapping (repeatedly restarting)
 * - Port not listening (service started but not accepting connections)
 *
 * The monitoredServices config maps friendly names to systemd unit names
 * or "process:name" / "port:number" formats.
 */

import { execSync } from "node:child_process";
import type {
  SenseModule,
  SenseReport,
  SenseFinding,
  ConsciousnessConfig,
} from "../types.js";

/** Parsed service target */
interface ServiceTarget {
  name: string;
  kind: "systemd" | "process" | "port";
  target: string;
}

export class ServiceSense implements SenseModule {
  readonly id = "service" as const;
  readonly name = "Service Monitor";

  constructor(private config: ConsciousnessConfig) {}

  async scan(): Promise<SenseReport> {
    const start = Date.now();
    const findings: SenseFinding[] = [];

    try {
      const targets = this.parseTargets();

      for (const svc of targets) {
        try {
          const status = this.checkService(svc);
          if (!status.alive) {
            findings.push({
              key: `service_down_${svc.name}`,
              summary: `🔴 Servis KAPALI: ${svc.name} (${svc.kind}:${svc.target})`,
              severity: "critical",
              metadata: {
                serviceName: svc.name,
                kind: svc.kind,
                target: svc.target,
                detail: status.detail,
              },
            });
          }
        } catch (err) {
          findings.push({
            key: `service_check_error_${svc.name}`,
            summary: `Servis kontrolü başarısız: ${svc.name} — ${err instanceof Error ? err.message : String(err)}`,
            severity: "warning",
          });
        }
      }

      // ── Always check gateway (critical for Foreman itself) ──
      const gatewayAlive = this.isProcessRunning("gcloud-cca-gateway") ||
                           this.isProcessRunning("antigravity");
      if (!gatewayAlive) {
        // Check if gateway systemd unit exists first
        const unitExists = this.systemdUnitExists("gcloud-cca-gateway");
        if (unitExists) {
          findings.push({
            key: "service_down_antigravity_gateway",
            summary: "🔴 Antigravity Gateway KAPALI — LLM erişimi kesilmiş olabilir",
            severity: "critical",
            metadata: { serviceName: "gcloud-cca-gateway", kind: "systemd" },
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
   * Parse monitoredServices config into structured targets.
   *
   * Formats:
   * - "unit-name" → systemd unit
   * - "process:name" → check process by name
   * - "port:8080" → check if port is listening
   */
  private parseTargets(): ServiceTarget[] {
    const targets: ServiceTarget[] = [];
    for (const [name, value] of Object.entries(this.config.monitoredServices)) {
      if (value.startsWith("process:")) {
        targets.push({ name, kind: "process", target: value.slice(8) });
      } else if (value.startsWith("port:")) {
        targets.push({ name, kind: "port", target: value.slice(5) });
      } else {
        targets.push({ name, kind: "systemd", target: value });
      }
    }
    return targets;
  }

  /**
   * Check if a service is alive.
   */
  private checkService(svc: ServiceTarget): { alive: boolean; detail: string } {
    switch (svc.kind) {
      case "systemd":
        return this.checkSystemd(svc.target);
      case "process":
        return {
          alive: this.isProcessRunning(svc.target),
          detail: this.isProcessRunning(svc.target) ? "running" : "not found",
        };
      case "port":
        return this.checkPort(parseInt(svc.target, 10));
      default:
        return { alive: false, detail: "unknown kind" };
    }
  }

  /**
   * Check systemd unit status.
   */
  private checkSystemd(unit: string): { alive: boolean; detail: string } {
    try {
      const status = execSync(`systemctl is-active ${unit} 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return { alive: status === "active", detail: status };
    } catch {
      // Non-zero exit = not active
      return { alive: false, detail: "inactive or not found" };
    }
  }

  /**
   * Check if a process is running by name.
   */
  private isProcessRunning(name: string): boolean {
    try {
      execSync(`pgrep -f "${name}" > /dev/null 2>&1`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a systemd unit file exists.
   */
  private systemdUnitExists(unit: string): boolean {
    try {
      execSync(`systemctl cat ${unit} > /dev/null 2>&1`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a port is listening.
   */
  private checkPort(port: number): { alive: boolean; detail: string } {
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return { alive: false, detail: "invalid port" };
    }
    try {
      const output = execSync(
        `ss -tlnp 2>/dev/null | grep ":${port} " || netstat -tlnp 2>/dev/null | grep ":${port} "`,
        { encoding: "utf-8", timeout: 3000 }
      );
      return { alive: output.trim().length > 0, detail: output.trim().slice(0, 200) };
    } catch {
      return { alive: false, detail: "port not listening" };
    }
  }
}
