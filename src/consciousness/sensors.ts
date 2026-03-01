/**
 * FOREMAN — Consciousness Sensors
 * 
 * Algı katmanı. Dış dünyayı hisseden gözler ve kulaklar.
 * Her sensör bağımsız çalışır, kendi alanını gözlemler.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { SensorReading, SensorType } from './types.js';

const run = promisify(exec);

async function shell(cmd: string, timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await run(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch (e: any) {
    return e.stdout?.trim?.() ?? '';
  }
}

// ═══════════════════════════════════════════
// SYSTEM — CPU, RAM, Disk, Uptime
// ═══════════════════════════════════════════

export async function senseSystem(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Disk usage
  const dfOut = await shell("df -h / | tail -1 | awk '{print $5}'");
  const diskPct = parseInt(dfOut.replace('%', ''), 10);
  if (!isNaN(diskPct)) {
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity: diskPct > 90 ? 'critical' : diskPct > 80 ? 'warning' : 'info',
      title: `Disk: %${diskPct}`,
      detail: `Root partition %${diskPct} dolu`,
      value: diskPct,
      actionable: diskPct > 80,
      metricKey: 'disk_usage',
    });
  }

  // RAM usage
  const memOut = await shell("free -m | awk '/Mem:/{printf \"%.0f\", $3/$2*100}'");
  const ramPct = parseInt(memOut, 10);
  if (!isNaN(ramPct)) {
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity: ramPct > 90 ? 'critical' : ramPct > 80 ? 'warning' : 'info',
      title: `RAM: %${ramPct}`,
      detail: `RAM %${ramPct} kullanımda`,
      value: ramPct,
      actionable: ramPct > 85,
      metricKey: 'ram_usage',
    });
  }

  // CPU load
  const loadOut = await shell("cat /proc/loadavg | awk '{print $1}'");
  const load = parseFloat(loadOut);
  const cpuCount = parseInt(await shell("nproc"), 10) || 4;
  if (!isNaN(load)) {
    const ratio = load / cpuCount;
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity: ratio > 2 ? 'critical' : ratio > 1 ? 'warning' : 'info',
      title: `CPU Load: ${load.toFixed(1)} (${cpuCount} core)`,
      detail: `Oran: ${ratio.toFixed(2)}`,
      value: load,
      actionable: ratio > 1.5,
      metricKey: 'cpu_load',
    });
  }

  // Uptime
  const uptimeOut = await shell("cat /proc/uptime | awk '{print $1}'");
  const uptimeSec = parseFloat(uptimeOut);
  if (!isNaN(uptimeSec)) {
    const uptimeHours = Math.floor(uptimeSec / 3600);
    const uptimeDays = Math.floor(uptimeHours / 24);
    readings.push({
      sensor: 'system',
      timestamp: now,
      severity: 'info',
      title: `Uptime: ${uptimeDays}g ${uptimeHours % 24}s`,
      detail: `Sistem ${uptimeDays} gün ${uptimeHours % 24} saat açık`,
      value: uptimeHours,
      actionable: false,
      metricKey: 'uptime_hours',
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// SERVICE — systemd, docker, key processes
// ═══════════════════════════════════════════

const WATCHED_SERVICES = ['docker'];

const WATCHED_PROCESSES: { name: string; critical: boolean }[] = [
  { name: 'foreman', critical: true },
];

export async function senseServices(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  for (const svc of WATCHED_SERVICES) {
    const status = await shell(`systemctl is-active ${svc} 2>/dev/null`);
    if (status && status !== 'active') {
      readings.push({
        sensor: 'service',
        timestamp: now,
        severity: 'critical',
        title: `🔴 ${svc} durmuş (${status})`,
        detail: `systemctl is-active: ${status}`,
        actionable: true,
      });
    }
  }

  for (const proc of WATCHED_PROCESSES) {
    const pid = await shell(`pgrep -f "${proc.name}" | head -1`);
    if (!pid) {
      readings.push({
        sensor: 'service',
        timestamp: now,
        severity: proc.critical ? 'critical' : 'warning',
        title: `${proc.critical ? '🔴' : '⚠️'} ${proc.name} çalışmıyor`,
        detail: `pgrep -f ${proc.name} boş döndü`,
        actionable: true,
      });
    }
  }

  // Docker container check
  const dockerPs = await shell('docker ps --format "{{.Names}}:{{.Status}}" 2>/dev/null');
  if (dockerPs) {
    for (const line of dockerPs.split('\n').filter(Boolean)) {
      const [name, status] = line.split(':');
      if (status && !status.startsWith('Up')) {
        readings.push({
          sensor: 'service',
          timestamp: now,
          severity: 'warning',
          title: `🐳 ${name} container durmuş`,
          detail: `Status: ${status}`,
          actionable: true,
        });
      }
    }
  }

  return readings;
}

// ═══════════════════════════════════════════
// GIT — Repo durumu
// ═══════════════════════════════════════════

const WATCHED_REPOS = ['/home/sovranamr/projects/foreman'];

export async function senseGit(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  for (const repo of WATCHED_REPOS) {
    if (!existsSync(repo)) continue;
    const repoName = repo.split('/').pop()!;

    // Uncommitted changes
    const status = await shell(`cd ${repo} && git status --porcelain 2>/dev/null`);
    if (status) {
      const lines = status.split('\n').filter(Boolean);
      readings.push({
        sensor: 'git',
        timestamp: now,
        severity: 'info',
        title: `📝 ${repoName}: ${lines.length} uncommitted`,
        detail: lines.slice(0, 5).join('\n'),
        value: lines.length,
        actionable: false,
      });
    }

    // Last commit age
    const lastTs = await shell(`cd ${repo} && git log -1 --format=%ct 2>/dev/null`);
    const ts = parseInt(lastTs, 10);
    if (!isNaN(ts)) {
      const ageH = (now / 1000 - ts) / 3600;
      if (ageH > 24) {
        readings.push({
          sensor: 'git',
          timestamp: now,
          severity: ageH > 72 ? 'warning' : 'info',
          title: `📦 ${repoName}: ${Math.floor(ageH)}s commit yok`,
          detail: `Son commit ${Math.floor(ageH)} saat önce`,
          value: ageH,
          actionable: false,
        });
      }
    }
  }

  return readings;
}

// ═══════════════════════════════════════════
// TEST — Test suite sağlığı
// ═══════════════════════════════════════════

export async function senseTests(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Sadece hızlı bir test çalıştır (state.test.ts küçük)
  const out = await shell(
    'cd /home/sovranamr/projects/foreman && npx tsx --test src/state.test.ts 2>&1 | tail -5',
    30000,
  );

  const hasFail = out.includes('✖') || out.includes('FAIL') || out.includes('not ok');
  if (hasFail) {
    readings.push({
      sensor: 'test',
      timestamp: now,
      severity: 'warning',
      title: '🧪 Test failure tespit edildi',
      detail: out.slice(-300),
      actionable: true,
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// LOG — Sistem loglarında hata tarama
// ═══════════════════════════════════════════

export async function senseLogs(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  const errors = await shell(
    "journalctl --since '5 min ago' -p err --no-pager -q 2>/dev/null | tail -10"
  );

  if (errors && errors.length > 10) {
    const lines = errors.split('\n').filter(Boolean);
    readings.push({
      sensor: 'log',
      timestamp: now,
      severity: lines.length > 10 ? 'warning' : 'info',
      title: `📋 Son 5dk: ${lines.length} hata`,
      detail: lines.slice(0, 5).join('\n'),
      value: lines.length,
      actionable: lines.length > 10,
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// SELF — Foreman'ın kendi sağlığı (meta-awareness)
// ═══════════════════════════════════════════

export async function senseSelf(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // Consciousness state dosyası var mı, güncel mi
  try {
    const statePath = '/home/sovranamr/.foreman/consciousness-state.json';
    if (existsSync(statePath)) {
      const st = await stat(statePath);
      const ageMin = (now - st.mtimeMs) / 60000;
      if (ageMin > 10) {
        readings.push({
          sensor: 'self',
          timestamp: now,
          severity: 'warning',
          title: `🧠 State dosyası ${Math.floor(ageMin)}dk eski`,
          detail: 'Heartbeat düzgün çalışmıyor olabilir',
          actionable: true,
        });
      }
    }
  } catch {}

  // Memory usage of this process
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  if (heapMB > 500) {
    readings.push({
      sensor: 'self',
      timestamp: now,
      severity: heapMB > 1000 ? 'critical' : 'warning',
      title: `🧠 Foreman heap: ${heapMB}MB`,
      detail: `RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`,
      value: heapMB,
      actionable: heapMB > 1000,
      metricKey: 'foreman_heap_mb',
    });
  }

  return readings;
}

// ═══════════════════════════════════════════
// NETWORK — Bağlantı kontrolü
// ═══════════════════════════════════════════

export async function senseNetwork(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  const now = Date.now();

  // DNS çalışıyor mu
  const dns = await shell('timeout 5 nslookup google.com 2>/dev/null | grep -c "Address"');
  const dnsOk = parseInt(dns, 10) >= 2;
  if (!dnsOk) {
    readings.push({
      sensor: 'network',
      timestamp: now,
      severity: 'critical',
      title: '🌐 DNS çözümlemesi başarısız',
      detail: 'google.com çözümlenemedi',
      actionable: true,
    });
  }

  // Telegram API'ye erişim var mı
  const tg = await shell('timeout 5 curl -s -o /dev/null -w "%{http_code}" https://api.telegram.org 2>/dev/null');
  if (tg && tg !== '200' && tg !== '404') {
    readings.push({
      sensor: 'network',
      timestamp: now,
      severity: 'warning',
      title: `📡 Telegram API: HTTP ${tg}`,
      detail: 'Telegram API erişim sorunu',
      actionable: true,
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
  self: senseSelf,
  network: senseNetwork,
  cron: async () => [],
};
