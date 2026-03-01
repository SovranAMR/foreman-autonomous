/**
 * FOREMAN — Consciousness Sensors
 * Her sensor sistemi farklı bir açıdan "algılar"
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { SensorReading, SensorType } from './types.js';

const run = promisify(exec);

async function shell(cmd: string, timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await run(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch (e: any) {
    return e.stdout?.trim?.() ?? e.message ?? '';
  }
}

// ═══════════════════════════════════════════
// SYSTEM SENSOR — CPU, RAM, Disk
// ═══════════════════════════════════════════

export async function senseSystem(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Disk usage
  const dfOut = await shell("df -h / | tail -1 | awk '{print $5}'");
  const diskPct = parseInt(dfOut.replace('%', ''), 10);
  if (!isNaN(diskPct)) {
    const severity = diskPct > 90 ? 'critical' : diskPct > 80 ? 'warning' : 'info';
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity,
      title: `Disk kullanımı: %${diskPct}`,
      detail: `Root partition %${diskPct} dolu`,
      value: diskPct,
      actionable: diskPct > 80,
    });
  }

  // RAM usage
  const memOut = await shell("free -m | awk '/Mem:/{printf \"%.0f\", $3/$2*100}'");
  const ramPct = parseInt(memOut, 10);
  if (!isNaN(ramPct)) {
    const severity = ramPct > 90 ? 'critical' : ramPct > 80 ? 'warning' : 'info';
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity,
      title: `RAM kullanımı: %${ramPct}`,
      detail: `RAM %${ramPct} kullanımda`,
      value: ramPct,
      actionable: ramPct > 85,
    });
  }

  // Load average
  const loadOut = await shell("cat /proc/loadavg | awk '{print $1}'");
  const load = parseFloat(loadOut);
  const cpuCount = parseInt(await shell("nproc"), 10) || 4;
  if (!isNaN(load)) {
    const loadRatio = load / cpuCount;
    const severity = loadRatio > 2 ? 'critical' : loadRatio > 1 ? 'warning' : 'info';
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity,
      title: `Load: ${load} (${cpuCount} CPU)`,
      detail: `Load average ${load}, ${cpuCount} CPU — oran: ${loadRatio.toFixed(1)}`,
      value: load,
      actionable: loadRatio > 1.5,
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// SERVICE SENSOR — systemd, docker, key processes
// ═══════════════════════════════════════════

const WATCHED_SERVICES = [
  'gcloud-cca-gateway',
  'docker',
  'ssh',
];

const WATCHED_PROCESSES = [
  'foreman',
  'openclaw',
];

export async function senseServices(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Check systemd services
  for (const svc of WATCHED_SERVICES) {
    const status = await shell(`systemctl is-active ${svc} 2>/dev/null`);
    if (status && status !== 'active') {
      readings.push({
        sensor: 'service',
        timestamp: now,
        severity: 'critical',
        title: `🔴 ${svc} servisi durmuş`,
        detail: `systemctl status: ${status}`,
        actionable: true,
      });
    }
  }

  // Check key processes
  for (const proc of WATCHED_PROCESSES) {
    const pidCheck = await shell(`pgrep -f ${proc} | head -1`);
    if (!pidCheck) {
      readings.push({
        sensor: 'service',
        timestamp: now,
        severity: 'warning',
        title: `⚠️ ${proc} process bulunamadı`,
        detail: `pgrep -f ${proc} sonuç döndürmedi`,
        actionable: true,
      });
    }
  }

  return readings;
}

// ═══════════════════════════════════════════
// GIT SENSOR — Uncommitted changes, stale repos
// ═══════════════════════════════════════════

const WATCHED_REPOS = [
  '/home/sovranamr/projects/foreman',
];

export async function senseGit(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  for (const repo of WATCHED_REPOS) {
    // Uncommitted changes
    const status = await shell(`cd ${repo} && git status --porcelain 2>/dev/null`);
    if (status) {
      const lines = status.split('\n').filter(Boolean);
      readings.push({
        sensor: 'git',
        timestamp: now,
        severity: 'info',
        title: `📝 ${repo.split('/').pop()}: ${lines.length} uncommitted değişiklik`,
        detail: lines.slice(0, 5).join('\n') + (lines.length > 5 ? `\n...+${lines.length - 5} more` : ''),
        value: lines.length,
        actionable: false,
      });
    }

    // Last commit age
    const lastCommitTs = await shell(`cd ${repo} && git log -1 --format=%ct 2>/dev/null`);
    const ts = parseInt(lastCommitTs, 10);
    if (!isNaN(ts)) {
      const ageHours = (now / 1000 - ts) / 3600;
      if (ageHours > 48) {
        readings.push({
          sensor: 'git',
          timestamp: now,
          severity: 'info',
          title: `📦 ${repo.split('/').pop()}: ${Math.floor(ageHours)}h commit yok`,
          detail: `Son commit ${Math.floor(ageHours)} saat önce`,
          value: ageHours,
          actionable: false,
        });
      }
    }
  }

  return readings;
}

// ═══════════════════════════════════════════
// TEST SENSOR — Run tests, detect failures
// ═══════════════════════════════════════════

export async function senseTests(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Quick test run on foreman project
  const testOut = await shell(
    'cd /home/sovranamr/projects/foreman && npx tsx --test src/state.test.ts 2>&1 | tail -5',
    30000,
  );

  const hasFail = testOut.includes('✖') || testOut.includes('FAIL') || testOut.includes('ERR');
  if (hasFail) {
    readings.push({
      sensor: 'test',
      timestamp: now,
      severity: 'warning',
      title: '🧪 Test failure tespit edildi',
      detail: testOut.slice(-300),
      actionable: true,
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// LOG SENSOR — Scan recent logs for errors
// ═══════════════════════════════════════════

export async function senseLogs(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Check journalctl for recent errors
  const errors = await shell(
    "journalctl --since '5 min ago' -p err --no-pager -q 2>/dev/null | tail -10"
  );

  if (errors && errors.length > 10) {
    const lines = errors.split('\n').filter(Boolean);
    readings.push({
      sensor: 'log',
      timestamp: now,
      severity: 'warning',
      title: `📋 Son 5dk'da ${lines.length} sistem hatası`,
      detail: lines.slice(0, 5).join('\n'),
      value: lines.length,
      actionable: lines.length > 5,
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// SENSOR REGISTRY
// ═══════════════════════════════════════════

export const SENSOR_MAP: Record<SensorType, () => Promise<SensorReading[]>> = {
  system: senseSystem,
  service: senseServices,
  git: senseGit,
  test: senseTests,
  log: senseLogs,
  cron: async () => [],      // Faz 2
  network: async () => [],   // Faz 2
};
