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
  generateCuriosityThought,
  canNotify,
} from './thinker.js';
import {
  composeProactiveMessage,
  composeMorningMessage,
  composeNightReport,
  composeThoughtMessage,
} from './personality.js';
import {
  loadTaskQueue,
  saveTaskQueue,
  getNextTask,
  getNextStep,
  startStep,
  completeStep,
  failStep,
  formatQueueStatus,
} from './task-queue.js';
import {
  loadLearning,
  saveLearning,
  detectPatterns,
  matchPattern,
  decayPatterns,
} from './learning.js';
import { gatherAwareness, getAwarenessBrief } from './awareness.js';
import {
  buildConsciousnessPrompt,
  shouldInvokeLLM,
  executeConsciousness,
  getFullConversationHistory,
} from './consciousness-llm.js';

const run = promisify(exec);

const STATE_DIR = '/home/sovranamr/.foreman';
const STATE_FILE = `${STATE_DIR}/consciousness-state.json`;
const LOG_FILE = `${STATE_DIR}/consciousness.log`;

// ─── Helpers ───

let lastLLMInvokeAt = 0;  // Track when LLM was last called

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
      proactiveMessages: parsed.proactiveMessages ?? {},
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
    // Önce Markdown dene, başarısızsa plain text gönder
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
    if (resp.ok) return true;

    // Markdown parse hatası — plain text fallback
    const fallback = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    return fallback.ok;
  } catch (e: any) {
    await log(`[telegram-error] ${e.message}`);
    return false;
  }
}

async function executeAutoFix(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await run(command, { timeout: 120000 });
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

  // Reset daily counters at day boundary (don't rely on canNotify being called)
  const currentDay = new Date().toISOString().split('T')[0];
  if (state.lastResetDate !== currentDay) {
    state.notificationsToday = 0;
    state.lastResetDate = currentDay;
  }

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

  for (const entry of Array.from(sensorGroups.entries())) {
    const readings = entry[1];
    const thought = processReadings(readings, state, config);
    if (thought) {
      allThoughts.push(thought);
      state.thoughts.push(thought);
    }
  }

  // ─── 4a. PATTERN APPLICATION — Öğrenilen pattern'leri uygula ───
  try {
    const learning = await loadLearning();
    if (learning.patterns.length > 0) {
      for (const reading of allReadings) {
        const matched = matchPattern(reading, learning.patterns);
        if (matched && matched.learnedAction) {
          const thought: Thought = {
            id: `t_${Date.now()}_pat`,
            timestamp: Date.now(),
            source: reading.sensor,
            priority: matched.learnedAction.type === 'auto_fix' ? 'high' : 'low',
            summary: `[Pattern] ${matched.description}: ${reading.title}`,
            readings: [reading],
            action: {
              type: matched.learnedAction.type,
              command: matched.learnedAction.command,
              reason: `Learned pattern (${matched.occurrences}x, conf: ${(matched.confidence * 100).toFixed(0)}%)`,
            },
            notified: false,
            autoResolved: false,
          };
          allThoughts.push(thought);
          state.thoughts.push(thought);
          learning.totalApplied++;
          await log(`[pattern-applied] ${matched.description} → ${matched.learnedAction.type}: ${matched.learnedAction.command ?? matched.learnedAction.reason}`);
        }
      }
      await saveLearning(learning);
    }
  } catch (e: any) {
    await log(`[pattern-apply-error] ${e.message}`);
  }

  // ─── 4b. CURIOSITY — Merak düşünceleri ───
  // Her 6 beat'te bir merak düşüncesi üret — sorun olmasa bile
  if (state.heartbeatCount % 6 === 0) {
    const curiosity = generateCuriosityThought(state, allReadings);
    if (curiosity) {
      allThoughts.push(curiosity);
      state.thoughts.push(curiosity);
      await log(`[curiosity] ${curiosity.summary}`);
    }
  }

  // ─── 5. ACT — Severity Gate + Dedup ───
  // Bildirim dedup: aynı metricKey 1 saat içinde tekrar bildirilmez
  const notifiedMetrics: Record<string, number> = {};
  const recentNotifs = state.thoughts.filter(
    t => t.notified && Date.now() - t.timestamp < 3600000
  );
  for (const rn of recentNotifs) {
    for (const rd of rn.readings) {
      if (rd.metricKey) notifiedMetrics[rd.metricKey] = rn.timestamp;
    }
  }

  for (const thought of allThoughts) {
    if (!thought.action) continue;

    switch (thought.action.type) {
      case 'auto_fix': {
        const result = await executeAutoFix(thought.action.command!);
        thought.action.result = result;
        thought.autoResolved = !result.startsWith('HATA');
        await log(`[auto-fix] ${thought.action.command} → ${result}`);

        // Auto-fix her zaman bildir — ama dedup uygula
        if (config.notifyChatId && canNotify(state, config)) {
          const metricKey = thought.readings[0]?.metricKey;
          const isDup = metricKey && notifiedMetrics[metricKey] && (Date.now() - notifiedMetrics[metricKey] < 3600000);
          if (!isDup) {
            const msg = `[#${state.heartbeatCount}] ${formatThoughtForHuman(thought)}`;
            await sendTelegram(msg, config.notifyChatId);
            state.notificationsToday++;
            thought.notified = true;
            if (metricKey) notifiedMetrics[metricKey] = Date.now();
          }
        }
        break;
      }

      case 'notify': {
        // Severity gate: sadece critical veya high bildirilir
        if (thought.priority !== 'critical' && thought.priority !== 'high') {
          await log(`[gate-blocked] ${thought.priority}: ${thought.summary}`);
          break;
        }
        if (config.notifyChatId && canNotify(state, config)) {
          // Dedup: aynı metricKey 1 saat içinde tekrar gitmez
          const metricKey = thought.readings[0]?.metricKey;
          const isDup = metricKey && notifiedMetrics[metricKey] && (Date.now() - notifiedMetrics[metricKey] < 3600000);
          if (isDup) {
            await log(`[dedup] ${metricKey} son 1h içinde bildirildi, atlıyorum`);
            break;
          }
          const msg = `[#${state.heartbeatCount}] ${formatThoughtForHuman(thought)}`;
          const sent = await sendTelegram(msg, config.notifyChatId);
          if (sent) {
            state.notificationsToday++;
            thought.notified = true;
            if (metricKey) notifiedMetrics[metricKey] = Date.now();
          }
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

    // Deneyimden öğren — sadece anlamlı düşüncelerden (low+reflect = curiosity gürültüsü, kaydetme)
    if (thought.priority !== 'low' || thought.action?.type !== 'reflect') {
      state.experiences = recordExperience(state.experiences, thought);
    }
  }

  // ─── 6. LLM CONSCIOUSNESS — Bilinç karar noktası ───
  // Eski hardcoded REFLECT yerine LLM düşünür ve karar verir
  let awarenessText = '';
  try {
    const awareness = await gatherAwareness();
    awarenessText = awareness.summary;

    // LLM consciousness — provider varsa ve çağırma zamanıysa
    if (config.provider && config.activeModel && shouldInvokeLLM(state, awareness, lastLLMInvokeAt)) {
      await log(`[consciousness] LLM çağrılıyor...`);
      lastLLMInvokeAt = Date.now();

      const conversationHistory = await getFullConversationHistory(30);
      const prompt = await buildConsciousnessPrompt(
        awareness,
        conversationHistory?.messages ?? null,
        state,
      );

      const decision = await executeConsciousness(
        config.provider,
        config.activeModel,
        prompt,
        config.toolExecutor,
      );

      await log(`[consciousness] Karar: ${decision.action} — ${decision.reasoning ?? ''}`);

      // Kararı uygula
      if (decision.action === 'work' && decision.message && config.notifyChatId) {
        // Otonom aksiyon yapıldı — kullanıcıya bildir
        const sent = await sendTelegram(decision.message, config.notifyChatId);
        if (sent) {
          state.notificationsToday++;
          await log(`[consciousness] 🔧 Otonom aksiyon bildirildi: ${decision.message.slice(0, 200)}`);
        }
        if (decision.toolCalls) {
          for (const tc of decision.toolCalls) {
            await log(`[consciousness] Tool: ${tc.name}(${Object.keys(tc.args).join(', ')}) → ${tc.result?.slice(0, 200) ?? '?'}`);
          }
        }
      } else if (decision.action !== 'silent' && decision.message && config.notifyChatId) {
        const sent = await sendTelegram(decision.message, config.notifyChatId);
        if (sent) {
          state.notificationsToday++;
          await log(`[consciousness] Mesaj gönderildi: ${decision.message.slice(0, 100)}`);
        }
      }
    } else if (!config.provider) {
      // Provider yok — eski davranış: sadece inner monologue
      if (state.heartbeatCount % config.innerMonologueEvery === 0) {
        const monologue = generateInnerMonologue(state, awarenessText);
        state.lastInnerMonologue = monologue;
        state.lastInnerMonologueAt = Date.now();
        await log(`[inner-voice]\n${monologue}`);
      }
    }
  } catch (e: any) {
    await log(`[consciousness-error] ${e.message}`);
    // Fallback: eski inner monologue
    if (state.heartbeatCount % config.innerMonologueEvery === 0) {
      const monologue = generateInnerMonologue(state, awarenessText);
      state.lastInnerMonologue = monologue;
      state.lastInnerMonologueAt = Date.now();
      await log(`[inner-voice-fallback]\n${monologue}`);
    }
  }

  // ─── 7. STATUS REPORT ───
  if (state.heartbeatCount % config.statusReportEvery === 0 && config.notifyChatId && canNotify(state, config)) {
    const report = formatStatusReport(state);
    const sent = await sendTelegram(report, config.notifyChatId);
    if (sent) state.notificationsToday++;
    await log(`[status-report] ${sent ? 'Gönderildi' : 'Gönderilemedi'}`);
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

    if (config.notifyChatId && canNotify(state, config)) {
      const sent = await sendTelegram(formatJournalForHuman(journal), config.notifyChatId);
      if (sent) state.notificationsToday++;
    }
    await log(`[journal] Günlük yazıldı: ${journal.summary}`);
  }

  // ─── 9. TASK QUEUE — Otonom görev işleme ───
  try {
    const taskQueue = await loadTaskQueue();
    const nextTask = getNextTask(taskQueue);
    if (nextTask) {
      const step = getNextStep(nextTask);
      if (step && step.type === 'forge' && config.notifyChatId) {
        // Forge-type step — forward to LLM pipeline via Telegram
        const taskPrompt = `[Otonom Görev] ${nextTask.title}: ${step.description}`;
        await sendTelegram(taskPrompt, config.notifyChatId);
        await log(`[task→forge] ${step.description.slice(0, 80)}`);
        const started = startStep(nextTask, step.id);
        const idx = taskQueue.tasks.findIndex(t => t.id === started.id);
        if (idx >= 0) {
          const completed = completeStep(started, step.id, 'Forwarded to forge pipeline');
          taskQueue.tasks[idx] = completed;
          await saveTaskQueue(taskQueue);
        }
      } else if (step && step.type === 'file_write' && step.targetFile && step.content) {
        // Direct file write — no LLM needed
        try {
          const { writeFileSync, mkdirSync } = await import('fs');
          const { dirname } = await import('path');
          const dir = dirname(step.targetFile);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(step.targetFile, step.content, 'utf-8');
          const started = startStep(nextTask, step.id);
          const idx = taskQueue.tasks.findIndex(t => t.id === started.id);
          if (idx >= 0) {
            const completed = completeStep(started, step.id, `Wrote ${step.targetFile}`);
            taskQueue.tasks[idx] = completed;
          }
          await log(`[task→file] Wrote ${step.targetFile}`);
          await saveTaskQueue(taskQueue);
        } catch (e: any) {
          const started = startStep(nextTask, step.id);
          const idx = taskQueue.tasks.findIndex(t => t.id === started.id);
          if (idx >= 0) {
            const failed = failStep(started, step.id, e.message);
            taskQueue.tasks[idx] = failed;
          }
          await log(`[task→file] FAILED: ${e.message}`);
          await saveTaskQueue(taskQueue);
        }
      } else if (step && !step.command && step.description && config.notifyChatId) {
        // Complex task without command — send to LLM
        const taskPrompt = `[Otonom Görev] ${nextTask.title}: ${step.description}`;
        await sendTelegram(taskPrompt, config.notifyChatId);
        await log(`[task→llm] ${step.description.slice(0, 80)}`);
        const started = startStep(nextTask, step.id);
        const idx = taskQueue.tasks.findIndex(t => t.id === started.id);
        if (idx >= 0) {
          const completed = completeStep(started, step.id, 'Forwarded to LLM');
          taskQueue.tasks[idx] = completed;
          await saveTaskQueue(taskQueue);
        }
      } else if (step && step.command) {
        const started = startStep(nextTask, step.id);
        const idx = taskQueue.tasks.findIndex(t => t.id === started.id);
        if (idx >= 0) taskQueue.tasks[idx] = started;

        try {
          const result = await executeAutoFix(step.command);
          const completed = completeStep(started, step.id, result);
          taskQueue.tasks[idx] = completed;
          await log(`[task] ${nextTask.title} → adım "${step.description}" tamamlandı`);

          // Görev bittiyse bildir
          if (completed.status === 'done' && config.notifyChatId && !completed.notifiedCompletion) {
            completed.notifiedCompletion = true;
            await sendTelegram(
              `✅ Görev tamamlandı: ${completed.title}\n${completed.steps.length} adım, ${Math.round(completed.totalTimeMs / 1000)}s`,
              config.notifyChatId,
            );
          }
        } catch (e: any) {
          const failed = failStep(started, step.id, e.message);
          taskQueue.tasks[idx] = failed;
          await log(`[task] ${nextTask.title} → adım "${step.description}" BAŞARISIZ: ${e.message}`);
        }

        await saveTaskQueue(taskQueue);
      }
    }
  } catch (e: any) {
    await log(`[task-queue-error] ${e.message}`);
  }

  // ─── 10. LEARNING — Pattern öğren ───
  try {
    const learning = await loadLearning();
    if (state.thoughts.length >= 10) {
      const recentThoughts = state.thoughts.slice(-50);
      learning.patterns = detectPatterns(recentThoughts, learning.patterns);
      learning.patterns = decayPatterns(learning.patterns);
      learning.lastLearnedAt = Date.now();
      await saveLearning(learning);
    }
  } catch (e: any) {
    await log(`[learning-error] ${e.message}`);
  }

  // ─── 11. PROACTIVE MESSAGING — Sabah/gece mesajları ───
  if (config.notifyChatId) {
    const hour = new Date().getHours();
    const today = new Date().toISOString().split('T')[0];

    // State'e proactive tracking ekle (kalıcı)
    if (!state.proactiveMessages) {
      state.proactiveMessages = {};
    }

    // Sabah selamlaması (1 kez/gün, saat 8-10)
    if (hour >= 8 && hour <= 10 && state.heartbeatCount > 1) {
      const morningKey = `morning_${today}`;
      if (!state.proactiveMessages[morningKey] && canNotify(state, config)) {
        const morning = composeMorningMessage(state);
        if (morning) {
          const sent = await sendTelegram(morning, config.notifyChatId);
          if (sent) {
            state.proactiveMessages[morningKey] = Date.now();
            state.notificationsToday++;
            await log('[proactive] Sabah selamlaması gönderildi');
          }
        }
      }
    }

    // Gece raporu (1 kez/gün, saat 23)
    if (hour === 23) {
      const nightKey = `night_${today}`;
      if (!state.proactiveMessages[nightKey] && canNotify(state, config)) {
        const nightReport = composeNightReport(state);
        const sent = await sendTelegram(nightReport, config.notifyChatId);
        if (sent) {
          state.proactiveMessages[nightKey] = Date.now();
          state.notificationsToday++;
          await log('[proactive] Gece raporu gönderildi');
        }
      }
    }

    // Eski proactive kayıtlarını temizle (3 günden eski)
    const threeDaysAgo = Date.now() - 3 * 24 * 3600000;
    for (const key of Object.keys(state.proactiveMessages)) {
      if (state.proactiveMessages[key] < threeDaysAgo) {
        delete state.proactiveMessages[key];
      }
    }
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
    ).catch(() => { });
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
