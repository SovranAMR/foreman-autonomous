/**
 * FOREMAN — Consciousness Heartbeat Loop
 * 
 * Ana bilinç döngüsü. Her beat'te:
 * 1. SENSE — Dış dünyayı algıla
 * 2. FEEL  — Duygu durumunu güncelle
 * 3. THINK — Düşünce üret, karar ver
 * 4. TRACK — Trend'leri takip et
 * 5. ACT   — Bildirim gönder veya otomatik düzelt
 * 6. REFLECT — İç diyalog yap, deneyimlerden öğren
 * 7. JOURNAL — Gün sonunda özet yaz
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir, appendFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
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
import {
  processReadings,
  formatThoughtForHuman,
  formatStatusReport,
  formatJournalForHuman,
  deriveMood,
  updateTrends,
  recordExperience,
  generateInnerMonologue,
  generateDailyJournal,
} from './thinker.js';

const run = promisify(exec);

const STATE_DIR = '/home/sovranamr/.foreman';
const STATE_FILE = `${STATE_DIR}/consciousness-state.json`;
const LOG_FILE = `${STATE_DIR}/consciousness.log`;

// ─── Helpers ───

async function ensureDir(): Promise<void> {
  if (!existsSync(STATE_DIR)) await mkdir(STATE_DIR, { recursive: true });
}

async function loadState(): Promise<ConsciousnessState> {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Migrate eski state'i yeni yapıya
    return {
      ...createInitialState(),
      ...parsed,
      emotion: parsed.emotion ?? createInitialState().emotion,
      trends: parsed.trends ?? [],
      experiences: parsed.experiences ?? [],
      journals: parsed.journals ?? [],
      recentThoughts: parsed.recentThoughts ?? [],
      sensorHealth: parsed.sensorHealth ?? {},
    };
  } catch {
    return createInitialState();
  }
}

async function saveState(state: ConsciousnessState): Promise<void> {
  await ensureDir();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function log(msg: string): Promise<void> {
  await ensureDir();
  const ts = new Date().toISOString();
  await appendFile(LOG_FILE, `[${ts}] ${msg}\n`);
}

function getTelegramToken(): string | undefined {
  if (process.env.FOREMAN_TELEGRAM_TOKEN) return process.env.FOREMAN_TELEGRAM_TOKEN;
  try {
    const cfg = JSON.parse(readFileSync('/home/sovranamr/.foreman/config.json', 'utf-8'));
    return cfg.telegram?.botToken;
  } catch { return undefined; }
}

async function sendTelegram(message: string, chatId: string): Promise<boolean> {
  const token = getTelegramToken();
  if (!token) return false;

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
    return resp.ok;
  } catch (e: any) {
    await log(`[telegram-error] ${e.message}`);
    return false;
  }
}

async function executeAutoFix(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await run(command, { timeout: 30000 });
    return (stdout || stderr || 'OK').trim().slice(0, 200);
  } catch (e: any) {
    return `HATA: ${e.message?.slice(0, 200)}`;
  }
}

// ═══════════════════════════════════════════
// HEARTBEAT CYCLE — Tek Bir Bilinç Döngüsü
// ═══════════════════════════════════════════

export async function heartbeatCycle(
  config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG,
): Promise<{ thoughts: Thought[]; state: ConsciousnessState }> {
  const state = await loadState();
  state.alive = true;
  state.heartbeatCount++;
  state.lastBeatAt = Date.now();
  state.uptimeMs = Date.now() - state.startedAt;

  const allThoughts: Thought[] = [];
  const allReadings: SensorReading[] = [];

  await log(`[beat #${state.heartbeatCount}] Başlıyor...`);

  // ─── 1. SENSE ───
  for (const sensorType of config.enabledSensors) {
    const sensorFn = SENSOR_MAP[sensorType];
    if (!sensorFn) continue;

    try {
      const readings = await sensorFn();
      allReadings.push(...readings);
      state.lastSensorRun[sensorType] = Date.now();
      state.sensorHealth[sensorType] = 'healthy';
    } catch (e: any) {
      await log(`[sensor-error] ${sensorType}: ${e.message}`);
      state.sensorHealth[sensorType] = 'failing';
    }
  }

  // ─── 2. FEEL ───
  state.emotion = deriveMood(allReadings, state, config);

  // ─── 3. TRACK ───
  if (config.trendTrackingEnabled) {
    state.trends = updateTrends(state.trends, allReadings);
  }

  // ─── 4. THINK ───
  // Sensörleri grupla ve her grup için düşünce üret
  const sensorGroups = new Map<SensorType, SensorReading[]>();
  for (const r of allReadings) {
    const group = sensorGroups.get(r.sensor) ?? [];
    group.push(r);
    sensorGroups.set(r.sensor, group);
  }

  for (const [, readings] of sensorGroups) {
    const thought = processReadings(readings, state, config);
    if (thought) {
      allThoughts.push(thought);
      state.thoughts.push(thought);
    }
  }

  // ─── 5. ACT ───
  for (const thought of allThoughts) {
    if (!thought.action) continue;

    switch (thought.action.type) {
      case 'auto_fix': {
        const result = await executeAutoFix(thought.action.command!);
        thought.action.result = result;
        thought.autoResolved = !result.startsWith('HATA');
        await log(`[auto-fix] ${thought.action.command} → ${result}`);

        if (config.notifyChatId) {
          await sendTelegram(formatThoughtForHuman(thought), config.notifyChatId);
          state.notificationsToday++;
        }
        break;
      }

      case 'notify': {
        if (config.notifyChatId) {
          const sent = await sendTelegram(formatThoughtForHuman(thought), config.notifyChatId);
          if (sent) state.notificationsToday++;
          await log(`[notify] ${sent ? '✓' : '✗'}: ${thought.summary}`);
        }
        break;
      }

      case 'suppress':
        await log(`[suppress] ${thought.action.reason}: ${thought.summary}`);
        break;

      case 'defer':
        await log(`[defer] ${thought.summary}`);
        break;
    }

    // Deneyimden öğren
    state.experiences = recordExperience(state.experiences, thought);
  }

  // ─── 6. REFLECT — İç Diyalog ───
  if (state.heartbeatCount % config.innerMonologueEvery === 0) {
    const monologue = generateInnerMonologue(state);
    state.lastInnerMonologue = monologue;
    state.lastInnerMonologueAt = Date.now();
    await log(`[inner-voice]\n${monologue}`);
  }

  // ─── 7. STATUS REPORT ───
  if (state.heartbeatCount % config.statusReportEvery === 0 && config.notifyChatId) {
    const report = formatStatusReport(state);
    await sendTelegram(report, config.notifyChatId);
    state.notificationsToday++;
    await log(`[status-report] Gönderildi`);
  }

  // ─── 8. DAILY JOURNAL ───
  const hour = new Date().getHours();
  const today = new Date().toISOString().split('T')[0];
  const hasJournalToday = state.journals.some(j => j.date === today);
  if (hour === config.journalHour && !hasJournalToday) {
    const journal = generateDailyJournal(state);
    state.journals.push(journal);

    // Max 30 gün tut
    if (state.journals.length > 30) {
      state.journals = state.journals.slice(-30);
    }

    if (config.notifyChatId) {
      await sendTelegram(formatJournalForHuman(journal), config.notifyChatId);
      state.notificationsToday++;
    }
    await log(`[journal] Günlük yazıldı: ${journal.summary}`);
  }

  // ─── Cleanup ───
  // Recent thoughts: son 1 saat
  state.recentThoughts = state.thoughts.filter(
    t => Date.now() - t.timestamp < 3600000
  );

  // Max 500 thought tut
  if (state.thoughts.length > 500) {
    state.thoughts = state.thoughts.slice(-500);
  }

  await saveState(state);
  await log(
    `[beat #${state.heartbeatCount}] ${state.emotion.mood} | ` +
    `${allThoughts.length} düşünce | ${allReadings.length} okuma`
  );

  return { thoughts: allThoughts, state };
}

// ═══════════════════════════════════════════
// CONTINUOUS LOOP
// ═══════════════════════════════════════════

let loopTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatLoop(config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG): void {
  if (loopTimer) {
    console.log('[consciousness] Loop zaten çalışıyor');
    return;
  }

  console.log(`[consciousness] 🫀 Bilinç aktif (${config.intervalMs / 1000}s aralık)`);

  // Başlangıç bildirimi
  if (config.notifyChatId) {
    sendTelegram(
      `🫀 *Foreman uyanıyor...*\nSensörler: ${config.enabledSensors.join(', ')}\nAralık: ${config.intervalMs / 1000}s`,
      config.notifyChatId,
    ).catch(() => {});
  }

  // İlk beat hemen
  heartbeatCycle(config).catch(e => console.error('[consciousness] İlk beat hatası:', e));

  // Sonraki beatler
  loopTimer = setInterval(() => {
    heartbeatCycle(config).catch(e => console.error('[consciousness] Beat hatası:', e));
  }, config.intervalMs);
}

export function stopHeartbeatLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    console.log('[consciousness] 💤 Bilinç durdu');
  }
}

export function isHeartbeatRunning(): boolean {
  return loopTimer !== null;
}

// ─── CLI Entry Point ───
if (process.argv[1]?.includes('heartbeat') && process.argv.includes('--once')) {
  heartbeatCycle().then(({ thoughts, state }) => {
    console.log(`\n🫀 Beat tamamlandı. Mood: ${state.emotion.mood}`);
    console.log(`   ${thoughts.length} düşünce, ${state.trends.length} trend`);
    for (const t of thoughts) {
      console.log(`  ${formatThoughtForHuman(t)}`);
    }
  });
}
