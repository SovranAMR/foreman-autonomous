/**
 * FOREMAN — Consciousness Heartbeat Loop
 * Sürekli çalışan ana döngü: Sense → Think → Act
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import {
  ConsciousnessState,
  HeartbeatConfig,
  DEFAULT_HEARTBEAT_CONFIG,
  SensorReading,
  SensorType,
  Thought,
  createInitialState,
} from './types.js';
import { SENSOR_MAP } from './sensors.js';
import { processReadings, formatThoughtForHuman } from './thinker.js';

const run = promisify(exec);

const STATE_FILE = '/home/sovranamr/.foreman/consciousness-state.json';
const LOG_FILE = '/home/sovranamr/.foreman/consciousness.log';

// ─── State Persistence ───

async function loadState(): Promise<ConsciousnessState> {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return createInitialState();
  }
}

async function saveState(state: ConsciousnessState): Promise<void> {
  const dir = STATE_FILE.replace(/\/[^/]+$/, '');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function appendLog(msg: string): Promise<void> {
  const dir = LOG_FILE.replace(/\/[^/]+$/, '');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  const { appendFile } = await import('fs/promises');
  await appendFile(LOG_FILE, line);
}

// ─── Notification ───

function getTelegramToken(): string | undefined {
  // 1. Environment variable
  if (process.env.FOREMAN_TELEGRAM_TOKEN) return process.env.FOREMAN_TELEGRAM_TOKEN;
  // 2. Config file
  try {
    const { readFileSync } = require('fs');
    const cfg = JSON.parse(readFileSync('/home/sovranamr/.foreman/config.json', 'utf-8'));
    return cfg.telegram?.botToken;
  } catch { return undefined; }
}

async function sendTelegramNotification(
  message: string,
  chatId?: string,
): Promise<boolean> {
  const token = getTelegramToken();
  if (!token || !chatId) return false;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    return resp.ok;
  } catch (e: any) {
    await appendLog(`[notify-error] ${e.message}`);
    return false;
  }
}

// ─── Auto-Fix Executor ───

async function executeAutoFix(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await run(command, { timeout: 30000 });
    return (stdout || stderr || 'OK').trim().slice(0, 200);
  } catch (e: any) {
    return `HATA: ${e.message?.slice(0, 200)}`;
  }
}

// ─── Single Heartbeat Cycle ───

export async function heartbeatCycle(
  config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG,
): Promise<{ thoughts: Thought[]; state: ConsciousnessState }> {
  const state = await loadState();
  state.alive = true;
  state.heartbeatCount++;

  const allThoughts: Thought[] = [];

  await appendLog(`[heartbeat #${state.heartbeatCount}] Başlıyor...`);

  // ─── SENSE: Her sensörü çalıştır ───
  for (const sensorType of config.enabledSensors) {
    const sensorFn = SENSOR_MAP[sensorType];
    if (!sensorFn) continue;

    // Cooldown check (critical hariç, thinker'da da var ama erken çık)
    const lastRun = state.lastSensorRun[sensorType];
    if (lastRun && Date.now() - lastRun < config.sensorCooldownMs) {
      continue; // Skip — çok yakın zamanda çalıştı
    }

    let readings: SensorReading[] = [];
    try {
      readings = await sensorFn();
    } catch (e: any) {
      await appendLog(`[sensor-error] ${sensorType}: ${e.message}`);
      continue;
    }

    state.lastSensorRun[sensorType] = Date.now();

    if (readings.length === 0) continue;

    // ─── THINK: Okumayı düşünceye çevir ───
    const thought = processReadings(readings, state, config);
    if (!thought) continue;

    allThoughts.push(thought);
    state.thoughts.push(thought);

    await appendLog(`[thought] ${thought.priority}: ${thought.summary}`);

    // ─── ACT: Düşünceye göre hareket et ───
    if (thought.action) {
      switch (thought.action.type) {
        case 'auto_fix': {
          await appendLog(`[auto-fix] Çalıştırılıyor: ${thought.action.command}`);
          const result = await executeAutoFix(thought.action.command);
          thought.action.result = result;
          thought.autoResolved = true;
          await appendLog(`[auto-fix] Sonuç: ${result}`);

          // Fix sonrası da bildir
          if (config.notifyChatId) {
            const msg = formatThoughtForHuman(thought);
            await sendTelegramNotification(msg, config.notifyChatId);
            state.notificationsToday++;
          }
          break;
        }

        case 'notify': {
          if (config.notifyChatId) {
            const msg = formatThoughtForHuman(thought);
            const sent = await sendTelegramNotification(msg, config.notifyChatId);
            if (sent) state.notificationsToday++;
            await appendLog(`[notify] ${sent ? 'Gönderildi' : 'BAŞARISIZ'}: ${thought.summary}`);
          }
          break;
        }

        case 'suppress':
          await appendLog(`[suppress] ${thought.action.reason}: ${thought.summary}`);
          break;

        case 'defer':
          await appendLog(`[defer] ${thought.summary} → ${new Date(thought.action.until).toISOString()}`);
          break;
      }
    }
  }

  // Eski düşünceleri temizle (max 100 tut)
  if (state.thoughts.length > 100) {
    state.thoughts = state.thoughts.slice(-100);
  }

  await saveState(state);
  // ─── Periyodik Durum Raporu (her 6 beat = ~30dk) ───
  if (state.heartbeatCount % 6 === 0 && config.notifyChatId) {
    const readings = await Promise.all(
      config.enabledSensors.map(async s => {
        const fn = SENSOR_MAP[s];
        if (!fn) return [];
        try { return await fn(); } catch { return []; }
      })
    ).then(arrs => arrs.flat());

    const diskR = readings.find(r => r.sensor === 'system' && r.title.includes('Disk'));
    const ramR = readings.find(r => r.sensor === 'system' && r.title.includes('RAM'));
    const loadR = readings.find(r => r.sensor === 'system' && r.title.includes('Load'));

    const statusMsg = [
      `📊 *Durum Raporu* (#${state.heartbeatCount})`,
      `💾 Disk: %${diskR?.value ?? '?'} | 🧠 RAM: %${ramR?.value ?? '?'} | ⚡ Load: ${loadR?.value ?? '?'}`,
      `🔔 Bugün ${state.notificationsToday} bildirim`,
      allThoughts.length > 0 ? `💭 Bu döngüde ${allThoughts.length} düşünce` : '✅ Her şey normal',
    ].join('\n');

    await sendTelegramNotification(statusMsg, config.notifyChatId);
    state.notificationsToday++;
  }

  await appendLog(
    `[heartbeat #${state.heartbeatCount}] Tamamlandı. ${allThoughts.length} düşünce üretildi.`
  );

  return { thoughts: allThoughts, state };
}

// ─── Continuous Loop ───

let loopTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatLoop(config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG): void {
  if (loopTimer) {
    console.log('[consciousness] Loop zaten çalışıyor');
    return;
  }

  console.log(`[consciousness] 🫀 Heartbeat başlatıldı (${config.intervalMs / 1000}s aralık)`);

  // İlk başlatmada "Ben buradayım" bildirimi gönder
  if (config.notifyChatId) {
    sendTelegramNotification(
      `🫀 *Foreman Consciousness aktif*\nHeartbeat: ${config.intervalMs / 1000}s aralık\nSensörler: ${config.enabledSensors.join(', ')}`,
      config.notifyChatId,
    ).catch(() => {});
  }

  // İlk beat hemen
  heartbeatCycle(config).catch(e => console.error('[consciousness] İlk beat hatası:', e));

  // Sonraki beatler interval ile
  loopTimer = setInterval(() => {
    heartbeatCycle(config).catch(e => console.error('[consciousness] Beat hatası:', e));
  }, config.intervalMs);
}

export function stopHeartbeatLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    console.log('[consciousness] 💤 Heartbeat durduruldu');
  }
}

export function isHeartbeatRunning(): boolean {
  return loopTimer !== null;
}

// ─── CLI Entry Point ───

if (process.argv[1]?.includes('heartbeat') && process.argv.includes('--once')) {
  // Tek seferlik çalıştır (test/debug için)
  heartbeatCycle().then(({ thoughts }) => {
    console.log(`\n🫀 Heartbeat tamamlandı. ${thoughts.length} düşünce:`);
    for (const t of thoughts) {
      console.log(`  ${formatThoughtForHuman(t)}`);
    }
  });
}
