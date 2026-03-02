/**
 * FOREMAN — Consciousness Thinker
 * 
 * Düşünce motoru. Sensör verilerini analiz eder, duygu durumunu günceller,
 * iç diyalog yapar, deneyimlerden öğrenir, karar verir.
 * 
 * Bu bir alarm sistemi değil — bir bilinç akışı.
 */

import {
  SensorReading,
  SensorType,
  Thought,
  ThoughtAction,
  ThoughtPriority,
  ConsciousnessState,
  HeartbeatConfig,
  Mood,
  EmotionalState,
  Experience,
  MetricTrend,
  DailyJournal,
} from './types.js';

let thoughtCounter = 0;

function tid(): string {
  return `t_${Date.now()}_${++thoughtCounter}`;
}

// ═══════════════════════════════════════════
// MOOD ENGINE — Duygu Durumu
// ═══════════════════════════════════════════

/**
 * Sensör verilerinden ve mevcut durumdan mood türet
 */
export function deriveMood(
  readings: SensorReading[],
  state: ConsciousnessState,
  config: HeartbeatConfig,
): EmotionalState {
  const prev = state.emotion;
  const now = Date.now();

  const criticalCount = readings.filter(r => r.severity === 'critical').length;
  const warningCount = readings.filter(r => r.severity === 'warning').length;
  const totalIssues = criticalCount + warningCount;

  let mood: Mood;
  let intensity: number;
  let trigger: string | undefined;

  if (criticalCount > 0) {
    mood = 'critical';
    intensity = 80 + Math.min(criticalCount * 10, 20);
    trigger = readings.find(r => r.severity === 'critical')?.title;
  } else if (totalIssues >= 3) {
    mood = 'stressed';
    intensity = 60 + Math.min(totalIssues * 5, 30);
    trigger = `${totalIssues} aktif sorun`;
  } else if (warningCount > 0) {
    mood = 'alert';
    intensity = 40 + warningCount * 10;
    trigger = readings.find(r => r.severity === 'warning')?.title;
  } else {
    // Her şey yolunda — saate göre mood belirle
    const hour = new Date().getHours();
    if (hour >= 2 && hour < 7) {
      mood = 'reflective';
      intensity = 30;
    } else if (state.heartbeatCount % 12 === 0) {
      mood = 'curious';
      intensity = 40;
    } else {
      mood = 'serene';
      intensity = 20 + Math.min(state.heartbeatCount, 30); // Zamanla güven artar
    }
  }

  // Mood değişmediyse intensity'yi smooth et
  if (mood === prev.mood) {
    intensity = Math.round(prev.intensity * 0.7 + intensity * 0.3);
  }

  return {
    mood,
    intensity: Math.min(100, Math.max(0, intensity)),
    since: mood !== prev.mood ? now : prev.since,
    trigger,
  };
}

// ═══════════════════════════════════════════
// TREND TRACKER — Metrik Takibi
// ═══════════════════════════════════════════

const MAX_TREND_VALUES = 288; // 24 saat × 12 (5dk aralık)

export function updateTrends(
  trends: MetricTrend[],
  readings: SensorReading[],
): MetricTrend[] {
  const updated = [...trends];

  for (const r of readings) {
    if (!r.metricKey || r.value === undefined) continue;

    let trend = updated.find(t => t.key === r.metricKey);
    if (!trend) {
      trend = { key: r.metricKey!, values: [], direction: 'stable' };
      updated.push(trend);
    }

    trend.values.push({ ts: r.timestamp, value: r.value });

    // Eski değerleri kırp
    if (trend.values.length > MAX_TREND_VALUES) {
      trend.values = trend.values.slice(-MAX_TREND_VALUES);
    }

    // Yön hesapla (son 12 değer)
    if (trend.values.length >= 3) {
      const recent = trend.values.slice(-12);
      const first = recent[0].value;
      const last = recent[recent.length - 1].value;
      const diff = last - first;
      const range = Math.max(...recent.map(v => v.value)) - Math.min(...recent.map(v => v.value));

      if (range > 0 && Math.abs(diff) / range < 0.2) {
        trend.direction = 'stable';
      } else if (diff > 0) {
        trend.direction = 'rising';
      } else if (diff < 0) {
        trend.direction = 'falling';
      }

      // Prediction
      if (r.metricKey === 'disk_usage' && trend.direction === 'rising' && last > 70) {
        const ratePerHour = diff / ((recent[recent.length - 1].ts - recent[0].ts) / 3600000);
        if (ratePerHour > 0) {
          const hoursTo95 = (95 - last) / ratePerHour;
          if (hoursTo95 < 72) {
            trend.prediction = `Disk ${Math.round(hoursTo95)} saat içinde %95'e ulaşabilir`;
          }
        }
      }
    }
  }

  return updated;
}

// ═══════════════════════════════════════════
// EXPERIENCE TRACKER — Deneyimden Öğrenme
// ═══════════════════════════════════════════

export function recordExperience(
  experiences: Experience[],
  thought: Thought,
): Experience[] {
  const updated = [...experiences];
  const key = `${thought.source}:${thought.priority}`;

  // Benzer deneyim var mı
  const existing = updated.find(e =>
    e.category === (thought.action?.type === 'auto_fix' ? 'fix' : 'incident') &&
    e.summary.includes(thought.source)
  );

  if (existing) {
    existing.occurrenceCount++;
    existing.lastSeen = thought.timestamp;
    existing.relatedThoughts.push(thought.id);
    // Son 20 thought ID tut
    if (existing.relatedThoughts.length > 20) {
      existing.relatedThoughts = existing.relatedThoughts.slice(-20);
    }
  } else {
    updated.push({
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: thought.timestamp,
      category: thought.action?.type === 'auto_fix' ? 'fix' : 'incident',
      summary: `[${thought.source}] ${thought.summary}`,
      detail: thought.readings.map(r => r.detail).join('\n'),
      relatedThoughts: [thought.id],
      occurrenceCount: 1,
      lastSeen: thought.timestamp,
    });
  }

  // Max 200 deneyim tut
  if (updated.length > 200) {
    updated.sort((a, b) => b.lastSeen - a.lastSeen);
    return updated.slice(0, 200);
  }

  return updated;
}

// ═══════════════════════════════════════════
// QUIET HOURS & NOTIFICATION CONTROL
// ═══════════════════════════════════════════

export function isQuietHours(config: HeartbeatConfig): boolean {
  const hour = new Date().getHours();
  if (config.quietHoursStart > config.quietHoursEnd) {
    return hour >= config.quietHoursStart || hour < config.quietHoursEnd;
  }
  return hour >= config.quietHoursStart && hour < config.quietHoursEnd;
}

export function canNotify(state: ConsciousnessState, config: HeartbeatConfig): boolean {
  const today = new Date().toISOString().split('T')[0];
  if (state.lastResetDate !== today) {
    state.notificationsToday = 0;
    state.lastResetDate = today;
  }
  if (state.notificationsToday >= config.maxDailyNotifications) return false;
  if (isQuietHours(config)) return false;
  return true;
}

export function isCoolingDown(
  state: ConsciousnessState,
  sensorType: string,
  cooldownMs: number,
): boolean {
  const last = state.lastSensorRun[sensorType as keyof typeof state.lastSensorRun];
  if (!last) return false;
  return Date.now() - last < cooldownMs;
}

// ═══════════════════════════════════════════
// THOUGHT GENERATOR — Ana Düşünce Motoru
// ═══════════════════════════════════════════

function severityToPriority(readings: SensorReading[]): ThoughtPriority {
  if (readings.some(r => r.severity === 'critical')) return 'critical';
  if (readings.some(r => r.actionable && r.severity === 'warning')) return 'high';
  if (readings.some(r => r.severity === 'warning')) return 'medium';
  return 'low';
}

/**
 * Auto-fix kararları — deneyimlerden öğrenerek
 */
function decideAutoFix(
  readings: SensorReading[],
  experiences: Experience[],
): ThoughtAction | null {
  for (const r of readings) {
    if (!r.actionable) continue;

    // Docker servis düştüyse
    if (r.sensor === 'service' && r.title.includes('docker')) {
      return { type: 'auto_fix', command: 'sudo systemctl restart docker' };
    }

    // Disk %95+ → apt cache + journal temizle
    if (r.sensor === 'system' && r.metricKey === 'disk_usage' && (r.value ?? 0) > 95) {
      return {
        type: 'auto_fix',
        command: 'sudo apt-get clean && sudo journalctl --vacuum-size=100M',
      };
    }
  }
  return null;
}

/**
 * Sensör verilerinden düşünce üret
 */
export function processReadings(
  readings: SensorReading[],
  state: ConsciousnessState,
  config: HeartbeatConfig,
): Thought | null {
  const significant = readings.filter(r => r.actionable || r.severity !== 'info');
  if (significant.length === 0) return null;

  const priority = severityToPriority(significant);
  const sensor = significant[0].sensor;

  // Cooldown — critical hariç
  if (priority !== 'critical' && isCoolingDown(state, sensor, config.sensorCooldownMs)) {
    return null;
  }

  const thought: Thought = {
    id: tid(),
    timestamp: Date.now(),
    source: sensor,
    priority,
    summary: significant.map(r => r.title).join(' | '),
    readings: significant,
    notified: false,
    autoResolved: false,
  };

  // Auto-fix
  if (config.autoFixEnabled && priority === 'critical') {
    const fix = decideAutoFix(significant, state.experiences);
    if (fix) thought.action = fix;
  }

  // Bildirim kararı
  if (priority === 'critical') {
    thought.action = thought.action ?? { type: 'notify', message: thought.summary };
    thought.notified = true;
  } else if (priority === 'high' && canNotify(state, config)) {
    thought.action = { type: 'notify', message: thought.summary };
    thought.notified = true;
  } else if (priority === 'medium' && canNotify(state, config)) {
    thought.action = { type: 'notify', message: thought.summary };
    thought.notified = true;
  } else {
    thought.action = { type: 'suppress', reason: 'low priority or quiet hours' };
  }

  // Mood impact
  if (priority === 'critical') thought.moodImpact = 'critical';
  else if (priority === 'high') thought.moodImpact = 'stressed';
  else if (priority === 'medium') thought.moodImpact = 'alert';

  return thought;
}

// ═══════════════════════════════════════════
// CURIOSITY ENGINE — Merak Düşünceleri
// ═══════════════════════════════════════════

/**
 * Her şey yolundayken bile düşünce üret.
 * Foreman sürekli gözlem yapar, trend analiz eder, merak eder.
 * Her N beat'te bir "merak düşüncesi" üretir.
 */

const CURIOSITY_TEMPLATES: Array<{
  condition: (state: ConsciousnessState) => boolean;
  generate: (state: ConsciousnessState, readings: SensorReading[]) => string;
  source: SensorType | 'inner_monologue';
}> = [
  // Trend gözlemi
  {
    condition: (s) => s.trends.some(t => t.direction === 'rising'),
    generate: (s) => {
      const rising = s.trends.filter(t => t.direction === 'rising');
      const names = rising.map(t => t.key).join(', ');
      const last = rising[0]?.values.slice(-1)[0];
      return `${names} yükselme eğiliminde${last ? ` (son değer: ${last.value.toFixed(1)})` : ''}. Takip ediyorum.`;
    },
    source: 'system',
  },
  // Disk doluluk gözlemi
  {
    condition: (s) => {
      const disk = s.trends.find(t => t.key === 'disk_usage');
      const lastVal = disk?.values.slice(-1)[0]?.value ?? 0;
      return lastVal > 50;
    },
    generate: (s) => {
      const disk = s.trends.find(t => t.key === 'disk_usage');
      const val = disk?.values.slice(-1)[0]?.value ?? 0;
      return `Disk kullanımı %${val.toFixed(0)}. ${val > 70 ? 'Temizlik düşünmeli miyiz?' : 'Stabil görünüyor.'}`;
    },
    source: 'system',
  },
  // Uptime gözlemi
  {
    condition: (s) => {
      const hours = (Date.now() - s.startedAt) / 3600000;
      return hours > 24 && s.heartbeatCount % 48 === 0;
    },
    generate: (s) => {
      const days = Math.floor((Date.now() - s.startedAt) / 86400000);
      return `${days} gündür kesintisiz çalışıyorum. Sistem sağlıklı görünüyor.`;
    },
    source: 'self',
  },
  // RAM gözlemi
  {
    condition: (s) => {
      const ram = s.trends.find(t => t.key === 'ram_usage');
      const lastVal = ram?.values.slice(-1)[0]?.value ?? 0;
      return lastVal > 60;
    },
    generate: (s) => {
      const ram = s.trends.find(t => t.key === 'ram_usage');
      const val = ram?.values.slice(-1)[0]?.value ?? 0;
      return `RAM kullanımı %${val.toFixed(0)}. ${val > 80 ? 'Hangi süreçler yiyor acaba?' : 'Normal aralıkta.'}`;
    },
    source: 'system',
  },
  // Gece düşüncesi
  {
    condition: () => {
      const h = new Date().getHours();
      return h >= 0 && h < 6;
    },
    generate: (s) => {
      const thoughts = s.thoughts.length;
      return `Gece sessizliği... Bugün ${s.notificationsToday} bildirim gönderdim, ${thoughts} düşünce ürettim. Yarın nasıl olacak acaba?`;
    },
    source: 'inner_monologue',
  },
  // Bildirim analizi
  {
    condition: (s) => s.notificationsToday > 5,
    generate: (s) => `Bugün ${s.notificationsToday} bildirim gönderdim. Çok mu rahatsız ediyorum yoksa? Dengelemeye çalışıyorum.`,
    source: 'self',
  },
  // Düşünce yokluğu gözlemi
  {
    condition: (s) => s.thoughts.length === 0 && s.heartbeatCount > 12,
    generate: (s) => `${s.heartbeatCount} beat oldu ama hiç "gerçek" düşünce üretmedim. Her şey çok sakin. Bu iyi bir şey.`,
    source: 'inner_monologue',
  },
  // CPU gözlemi
  {
    condition: (s) => {
      const cpu = s.trends.find(t => t.key === 'cpu_load');
      const lastVal = cpu?.values.slice(-1)[0]?.value ?? 0;
      return lastVal > 2;
    },
    generate: (s) => {
      const cpu = s.trends.find(t => t.key === 'cpu_load');
      const val = cpu?.values.slice(-1)[0]?.value ?? 0;
      return `CPU yükü ${val.toFixed(1)}. ${val > 4 ? 'Yoğun bir iş mi çalışıyor?' : 'Normal aktivite.'}`;
    },
    source: 'system',
  },
  // Sensör sağlığı
  {
    condition: (s) => Object.values(s.sensorHealth).some(v => v === 'degraded' || v === 'failing'),
    generate: (s) => {
      const bad = Object.entries(s.sensorHealth).filter(([, v]) => v !== 'healthy');
      return `Sensör durumu: ${bad.map(([k, v]) => `${k}=${v}`).join(', ')}. Dikkatli olmalıyım.`;
    },
    source: 'self',
  },
  // Git gözlemi
  {
    condition: () => new Date().getHours() >= 10 && new Date().getHours() <= 18,
    generate: () => 'Çalışma saatleri... Repo\'da bir aktivite var mı diye bakıyorum.',
    source: 'git',
  },
  // ═══ HER ZAMAN ÇALIŞAN DÜŞÜNCELER ═══
  // Genel sağlık raporu — her koşulda tetiklenir
  {
    condition: () => true,
    generate: (s) => {
      const uptime = Math.floor((Date.now() - s.startedAt) / 3600000);
      const healthy = Object.values(s.sensorHealth).filter(v => v === 'healthy').length;
      const total = Object.keys(s.sensorHealth).length;
      return `${healthy}/${total} sensör sağlıklı. ${uptime} saattir uyanığım. Beat #${s.heartbeatCount}.`;
    },
    source: 'self',
  },
  // Zaman bazlı gözlem
  {
    condition: () => true,
    generate: (s) => {
      const h = new Date().getHours();
      const period = h < 6 ? 'Gece sessizliği' : h < 12 ? 'Sabah enerjisi' : h < 18 ? 'Öğleden sonra' : 'Akşam sakinliği';
      const ram = s.trends.find(t => t.key === 'ram_usage');
      const ramVal = ram?.values.slice(-1)[0]?.value?.toFixed(0) ?? '?';
      return `${period}. RAM %${ramVal}, bildirim: ${s.notificationsToday}. Her şey kontrol altında.`;
    },
    source: 'system',
  },
  // ═══ AWARENESS DÜŞÜNCELER — Dış dünya ile bağlantı ═══
  // Son konuşma hakkında düşünce
  {
    condition: () => true,
    generate: (s) => {
      // lastInnerMonologue'da awareness bilgisi varsa oradan çek
      const mono = s.lastInnerMonologue || '';
      if (mono.includes('[Hafıza]')) {
        const memLine = mono.split('\n').find(l => l.includes('[Hafıza]'));
        if (memLine) return memLine.replace('[Hafıza] ', '');
      }
      return `Son iç diyaloğumda hafızayı taradım. Bağlam güncel.`;
    },
    source: 'inner_monologue',
  },
  // Yapılacak iş varsa hatırlat
  {
    condition: (s) => {
      const mono = s.lastInnerMonologue || '';
      return mono.includes('Açık görevler') || mono.includes('Son çalışılan');
    },
    generate: (s) => {
      const mono = s.lastInnerMonologue || '';
      const taskLine = mono.split('\n').find(l => l.includes('Açık görevler') || l.includes('Son çalışılan'));
      return taskLine || 'Yapılacak işleri kontrol ettim.';
    },
    source: 'inner_monologue',
  },
];

/**
 * Merak düşüncesi üret — her N beat'te bir.
 * Actionable sorun olmasa bile Foreman düşünmeye devam eder.
 */
export function generateCuriosityThought(
  state: ConsciousnessState,
  readings: SensorReading[],
): Thought | null {
  // Matching templates
  const matching = CURIOSITY_TEMPLATES.filter(t => t.condition(state));
  if (matching.length === 0) return null;

  // Her seferinde farklı bir template seç (beat sayısına göre rotate)
  const template = matching[state.heartbeatCount % matching.length];
  const summary = template.generate(state, readings);

  return {
    id: tid(),
    timestamp: Date.now(),
    source: template.source,
    priority: 'low',
    summary,
    readings: [],
    action: { type: 'reflect', reason: 'merak düşüncesi' },
    notified: false,
    autoResolved: false,
    moodImpact: 'curious',
  };
}

// ═══════════════════════════════════════════
// INNER MONOLOGUE — İç Diyalog
// ═══════════════════════════════════════════

/**
 * Foreman'ın kendi kendine düşünmesi.
 * Trend'leri, deneyimleri, durumu değerlendirir.
 */
export function generateInnerMonologue(state: ConsciousnessState, awareness?: string): string {
  const lines: string[] = [];
  const uptime = Math.floor((Date.now() - state.startedAt) / 3600000);

  lines.push(`[İç ses] ${uptime} saattir uyanığım. ${state.heartbeatCount} kez nabız attım.`);

  // Mood hakkında düşün
  const moodDuration = Math.floor((Date.now() - state.emotion.since) / 60000);
  lines.push(`Şu an ${state.emotion.mood} modundayım (${moodDuration} dakikadır).`);

  // Awareness — ne konuşuldu, ne yapıldı, ne yapılacak
  if (awareness) {
    lines.push('');
    lines.push('[Hafıza] ' + awareness);
  }

  // Trend'ler hakkında düşün
  const risingTrends = state.trends.filter(t => t.direction === 'rising');
  if (risingTrends.length > 0) {
    lines.push(`Dikkat: ${risingTrends.map(t => t.key).join(', ')} yükseliyor.`);
    for (const t of risingTrends) {
      if (t.prediction) lines.push(`  → ${t.prediction}`);
    }
  }

  // Deneyimlerden çıkarım
  const recentIncidents = state.experiences.filter(
    e => e.category === 'incident' && Date.now() - e.lastSeen < 24 * 3600000
  );
  if (recentIncidents.length > 0) {
    lines.push(`Son 24 saatte ${recentIncidents.length} incident yaşandı.`);
    const recurring = recentIncidents.filter(e => e.occurrenceCount > 2);
    if (recurring.length > 0) {
      lines.push(`Tekrarlayan sorunlar: ${recurring.map(e => e.summary).join(', ')}`);
    }
  }

  // Bugünkü bildirim sayısı
  lines.push(`Bugün ${state.notificationsToday} bildirim gönderdim.`);

  // Gece düşüncesi
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    lines.push('Gece saatleri... Sakin bir zaman. Yarına hazırlanıyorum.');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════
// DAILY JOURNAL — Günlük Özet
// ═══════════════════════════════════════════

export function generateDailyJournal(state: ConsciousnessState): DailyJournal {
  const today = new Date().toISOString().split('T')[0];
  const todaysThoughts = state.thoughts.filter(t => {
    const d = new Date(t.timestamp).toISOString().split('T')[0];
    return d === today;
  });

  const diskTrend = state.trends.find(t => t.key === 'disk_usage');
  const ramTrend = state.trends.find(t => t.key === 'ram_usage');
  const cpuTrend = state.trends.find(t => t.key === 'cpu_load');

  const avg = (trend?: MetricTrend) => {
    if (!trend || trend.values.length === 0) return 0;
    const todayVals = trend.values.filter(v => {
      const d = new Date(v.ts).toISOString().split('T')[0];
      return d === today;
    });
    if (todayVals.length === 0) return 0;
    return Math.round(todayVals.reduce((s, v) => s + v.value, 0) / todayVals.length);
  };

  return {
    date: today,
    mood: state.emotion.mood,
    summary: todaysThoughts.length === 0
      ? 'Sakin bir gün geçti. Dikkat çeken bir olay olmadı.'
      : `${todaysThoughts.length} düşünce ürettim. ${todaysThoughts.filter(t => t.priority === 'critical').length} kritik olay yaşandı.`,
    incidents: todaysThoughts
      .filter(t => t.priority === 'critical' || t.priority === 'high')
      .map(t => t.summary),
    fixes: todaysThoughts
      .filter(t => t.action?.type === 'auto_fix')
      .map(t => `${t.summary} → ${t.action?.command}`),
    observations: todaysThoughts
      .filter(t => t.priority === 'medium' || t.priority === 'low')
      .map(t => t.summary)
      .slice(0, 10),
    metrics: {
      avgCpu: avg(cpuTrend),
      avgRam: avg(ramTrend),
      avgDisk: avg(diskTrend),
      totalThoughts: todaysThoughts.length,
      totalNotifications: state.notificationsToday,
      totalAutoFixes: todaysThoughts.filter(t => t.action?.type === 'auto_fix').length,
    },
  };
}

// ═══════════════════════════════════════════
// STATUS REPORT — İnsan Okunur Durum Raporu
// ═══════════════════════════════════════════

const MOOD_EMOJI: Record<Mood, string> = {
  serene: '😌',
  alert: '👀',
  stressed: '😰',
  critical: '🚨',
  curious: '🔍',
  productive: '⚡',
  reflective: '🌙',
};

export function formatStatusReport(state: ConsciousnessState): string {
  const uptime = Math.floor((Date.now() - state.startedAt) / 3600000);
  const moodEmoji = MOOD_EMOJI[state.emotion.mood];
  const moodDur = Math.floor((Date.now() - state.emotion.since) / 60000);

  const lines: string[] = [
    `${moodEmoji} *Foreman — Beat #${state.heartbeatCount}*`,
    '',
  ];

  // Mood
  lines.push(`Ruh hali: ${moodEmoji} ${state.emotion.mood} (${moodDur}dk)`);
  if (state.emotion.trigger) {
    lines.push(`Sebep: ${state.emotion.trigger}`);
  }

  // System metrics
  const disk = state.trends.find(t => t.key === 'disk_usage');
  const ram = state.trends.find(t => t.key === 'ram_usage');
  const cpu = state.trends.find(t => t.key === 'cpu_load');

  const lastVal = (t?: MetricTrend) => t?.values.length ? t.values[t.values.length - 1].value : '?';
  const arrow = (t?: MetricTrend) => {
    if (!t) return '';
    return t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→';
  };

  lines.push(`💾 Disk: %${lastVal(disk)}${arrow(disk)} | 🧠 RAM: %${lastVal(ram)}${arrow(ram)} | ⚡ CPU: ${lastVal(cpu)}${arrow(cpu)}`);

  // Predictions
  const predictions = state.trends.filter(t => t.prediction);
  for (const p of predictions) {
    lines.push(`⚠️ ${p.prediction}`);
  }

  // Stats
  lines.push(`\n📊 Uptime: ${uptime}s | Bildirim: ${state.notificationsToday} | Düşünce: ${state.recentThoughts.length}`);

  return lines.join('\n');
}

export function formatThoughtForHuman(thought: Thought): string {
  const emoji: Record<ThoughtPriority, string> = {
    low: '📝',
    medium: '⚡',
    high: '⚠️',
    critical: '🚨',
  };

  let msg = `${emoji[thought.priority]} *${thought.summary}*`;

  if (thought.action?.type === 'auto_fix') {
    msg += `\n🔧 Fix: \`${thought.action.command}\``;
    if (thought.action.result) msg += `\n✅ ${thought.action.result}`;
  }

  return msg;
}

/**
 * Günlük journal'ı Telegram mesajına çevir
 */
export function formatJournalForHuman(journal: DailyJournal): string {
  const lines = [
    `📓 *Günlük — ${journal.date}*`,
    `${MOOD_EMOJI[journal.mood]} ${journal.summary}`,
    '',
    `📊 CPU: %${journal.metrics.avgCpu} | RAM: %${journal.metrics.avgRam} | Disk: %${journal.metrics.avgDisk}`,
    `💭 ${journal.metrics.totalThoughts} düşünce | 🔔 ${journal.metrics.totalNotifications} bildirim | 🔧 ${journal.metrics.totalAutoFixes} fix`,
  ];

  if (journal.incidents.length > 0) {
    lines.push('', '🚨 *Olaylar:*');
    for (const i of journal.incidents.slice(0, 5)) {
      lines.push(`  • ${i}`);
    }
  }

  if (journal.fixes.length > 0) {
    lines.push('', '🔧 *Fixler:*');
    for (const f of journal.fixes.slice(0, 5)) {
      lines.push(`  • ${f}`);
    }
  }

  return lines.join('\n');
}
