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
// HELPER FUNCTIONS — Trend Analysis Utilities
// ═══════════════════════════════════════════

/** Trend volatil mi? direction === 'volatile' veya son 12 değerde yüksek stddev */
function isVolatile(t: MetricTrend): boolean {
  if (t.direction === 'volatile') return true;
  const vals = t.values.slice(-12).map(v => v.value);
  if (vals.length < 3) return false;
  return stddev(vals) > 10; // %10'dan fazla sapma = volatil
}

/** Son N değer üzerinden saat başına değişim hızı */
function velocityPerHour(t: MetricTrend, n: number = 12): number | null {
  const recent = t.values.slice(-n);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const hours = (last.ts - first.ts) / 3600000;
  if (hours < 0.01) return null;
  return (last.value - first.value) / hours;
}

/** Trend'in son değeri */
function lastVal(t: MetricTrend): number | null {
  if (t.values.length === 0) return null;
  return t.values[t.values.length - 1].value;
}

/** Standart sapma */
function stddev(vals: number[]): number {
  if (vals.length === 0) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sqDiffs = vals.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / vals.length);
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
  } else if (totalIssues >= 5) {
    mood = 'stressed';
    intensity = 60 + Math.min(totalIssues * 5, 30);
    trigger = `${totalIssues} aktif sorun`;
  } else if (warningCount >= 3) {
    mood = 'alert';
    intensity = 40 + warningCount * 5;
    const warningTitles = readings
      .filter(r => r.severity === 'warning')
      .map(r => r.title)
      .slice(0, 3);
    trigger = `${warningCount} warning: ${warningTitles.join(', ')}`;
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
  // RAM gözlemi — sadece yüksek RAM
  {
    condition: (s) => {
      const ram = s.trends.find(t => t.key === 'ram_usage');
      const lastVal = ram?.values.slice(-1)[0]?.value ?? 0;
      return lastVal > 80;
    },
    generate: (s) => {
      const ram = s.trends.find(t => t.key === 'ram_usage');
      const val = ram?.values.slice(-1)[0]?.value ?? 0;
      return `RAM %${val.toFixed(0)} — hangi süreçler yiyor? Top 5'i kontrol etmeliyim.`;
    },
    source: 'system',
  },
  // Uptime gözlemi — sadece her 48 beat'te (4 saatte bir)
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
  // ═══ AWARENESS DÜŞÜNCELER — Dış dünya ile bağlantı ═══
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
  const moodDuration = Math.floor((Date.now() - state.emotion.since) / 60000);

  // Header — kompakt durum
  lines.push(`[Beat #${state.heartbeatCount}] ${uptime}h uptime | ${state.emotion.mood} (${moodDuration}dk)`);

  // ── Trend Analizi — asıl beyin çalışması ──
  const risingTrends = state.trends.filter(t => t.direction === 'rising');
  const fallingTrends = state.trends.filter(t => t.direction === 'falling');
  const volatileTrends = state.trends.filter(t => isVolatile(t));

  if (risingTrends.length > 0 || fallingTrends.length > 0 || volatileTrends.length > 0) {
    lines.push('');
    lines.push('[Trend Analizi]');

    for (const t of risingTrends) {
      const vel = velocityPerHour(t, 12);
      const current = lastVal(t);
      const velStr = vel !== null ? `hız: +${vel.toFixed(2)}/h` : '';

      let analysis = `  ↑ ${t.key}: ${current?.toFixed(1) ?? '?'}`;
      if (velStr) analysis += ` (${velStr})`;

      // Cross-reference
      if (t.key === 'ram_usage' && current !== null && current > 70) {
        const cpuTrend = state.trends.find(tt => tt.key === 'cpu_load');
        if (cpuTrend && cpuTrend.direction === 'stable') {
          analysis += ' ← CPU stabil, muhtemelen passive leak';
        }
      }

      if (t.prediction) {
        analysis += ` → ${t.prediction}`;
      }
      lines.push(analysis);
    }

    for (const t of fallingTrends) {
      const vel = velocityPerHour(t, 12);
      lines.push(`  ↓ ${t.key}: ${lastVal(t)?.toFixed(1) ?? '?'} (${vel !== null ? vel.toFixed(2) + '/h' : 'yavaş'})`);
    }

    for (const t of volatileTrends) {
      if (t.direction === 'rising' || t.direction === 'falling') continue;
      const vals = t.values.slice(-12).map(v => v.value);
      const sd = stddev(vals);
      lines.push(`  ~ ${t.key}: volatil (σ=${sd.toFixed(2)}) — periyodik süreç veya external faktör`);
    }
  }

  // ── Awareness — bağlam (kısa) ──
  if (awareness) {
    lines.push('');
    lines.push('[Bağlam] ' + awareness.slice(0, 200));
  }

  // ── İncident Analizi ──
  const recentIncidents = state.experiences.filter(
    e => e.category === 'incident' && Date.now() - e.lastSeen < 24 * 3600000
  );
  if (recentIncidents.length > 0) {
    const recurring = recentIncidents.filter(e => e.occurrenceCount >= 3);
    if (recurring.length > 0) {
      lines.push('');
      lines.push(`[Tekrarlayan] ${recurring.length} pattern: ${recurring.map(e => `${e.summary.slice(0, 50)}(${e.occurrenceCount}x)`).join(', ')}`);
    }
  }

  // ── Bildirim audit ──
  if (state.notificationsToday > 30) {
    lines.push('');
    lines.push(`[Self-Audit] ${state.notificationsToday} bildirim/gün — kalibrasyon gerekli.`);
  }

  // ── Stabil durum — kısa ──
  if (risingTrends.length === 0 && fallingTrends.length === 0 && recentIncidents.length === 0) {
    lines.push('');
    lines.push('[Sonuç] Tüm metrikler nominal. Delta yok. İzlemeye devam.');
  }

  // ── Çıkarım — Ne yapmalıyım? ──
  const inferences: string[] = [];

  // Bildirim kontrolü
  if (state.notificationsToday > 10) {
    inferences.push(`${state.notificationsToday} bildirim — eşik aşıldı. Filtre sıkılaştırılmalı.`);
  }

  // Stale work detection
  const staleWork = state.recentThoughts.find(t => t.summary.includes('stale'));
  if (staleWork) {
    inferences.push('Yarım işler birikiyor. Patrona hatırlatma zamanı.');
  }

  // Tehlikeli trend tespiti — sadece gerçek tehlike
  const dangerousTrends = state.trends.filter(t => t.prediction && t.direction === 'rising');
  for (const dt of dangerousTrends) {
    const val = lastVal(dt);
    // Sadece %75+ olan rising trend'ler tehlikeli
    if (val !== null && val > 75) {
      inferences.push(`${dt.key} kritik bölgede (%${val.toFixed(0)}): ${dt.prediction}`);
    }
  }

  // Sniper analizi
  const sniperTrend = state.trends.find(t => t.key === 'sniper_engagement');
  if (sniperTrend) {
    const sniperVal = lastVal(sniperTrend);
    const sniperVel = velocityPerHour(sniperTrend, 24);
    if (sniperVal !== null && sniperVal === 0) {
      inferences.push('Sniper sıfır engagement — API sorunu veya query değişikliği gerekli.');
    } else if (sniperVel !== null && sniperVel < -5) {
      inferences.push(`Sniper engagement düşüşte (${sniperVel.toFixed(1)}/h). İçerik stratejisi gözden geçirilmeli.`);
    }
  }

  // RAM + CPU korelasyon
  const ramTrend = state.trends.find(t => t.key === 'ram_usage');
  const cpuTrend = state.trends.find(t => t.key === 'cpu_load');
  if (ramTrend && cpuTrend) {
    const ramV = lastVal(ramTrend);
    const cpuV = lastVal(cpuTrend);
    if (ramV !== null && cpuV !== null) {
      if (ramV > 80 && cpuV < 1) {
        inferences.push(`RAM %${ramV.toFixed(0)} ama CPU idle — memory leak şüphesi. Top 5 process'i kontrol et.`);
      } else if (ramV > 85) {
        inferences.push(`RAM %${ramV.toFixed(0)} — reboot veya servis restart planla.`);
      }
    }
  }

  // Gece saatleri analizi
  const hour = new Date().getHours();
  if (hour >= 2 && hour < 7) {
    if (recentIncidents.length === 0) {
      inferences.push('Gece sessiz. Nominal operasyon.');
    } else {
      inferences.push(`Gece ${recentIncidents.length} olay — sabah brifingi hazırlanmalı.`);
    }
  }

  // Her şey yolundaysa bile söyle
  if (inferences.length === 0 && risingTrends.length === 0 && recentIncidents.length === 0) {
    inferences.push('Tüm sistemler nominal. Delta yok. Nöbetteyim.');
  }

  lines.push('');
  lines.push('[Çıkarım]');
  for (const inf of inferences) {
    lines.push(`  → ${inf}`);
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
  const uptimeH = Math.floor((Date.now() - state.startedAt) / 3600000);
  const moodEmoji = MOOD_EMOJI[state.emotion.mood];

  // ── System Metrics ──
  const disk = state.trends.find(t => t.key === 'disk_usage');
  const ram = state.trends.find(t => t.key === 'ram_usage');
  const cpu = state.trends.find(t => t.key === 'cpu_load');

  const trendVal = (t?: MetricTrend) => t?.values.length ? t.values[t.values.length - 1].value : null;
  const arrow = (t?: MetricTrend) => {
    if (!t) return '';
    return t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→';
  };

  const diskV = trendVal(disk);
  const ramV = trendVal(ram);
  const cpuV = trendVal(cpu);

  // ── Header: tek satır durum özeti ──
  const lines: string[] = [
    `${moodEmoji} *Durum Raporu* — ${uptimeH}h uptime`,
    `💾 %${diskV?.toFixed(0) ?? '?'}${arrow(disk)} 🧠 %${ramV?.toFixed(0) ?? '?'}${arrow(ram)} ⚡ ${cpuV?.toFixed(1) ?? '?'}${arrow(cpu)}`,
  ];

  // ── Sadece sorunları göster ──
  const recentReadings = state.recentThoughts.flatMap(t => t.readings);
  const issues = recentReadings.filter(r => r.severity !== 'info');
  const criticals = issues.filter(r => r.severity === 'critical');
  const warnings = issues.filter(r => r.severity === 'warning');

  if (criticals.length > 0) {
    lines.push('');
    lines.push('🚨 *Kritik:*');
    // Deduplicate by title
    const seen = new Set<string>();
    for (const r of criticals) {
      if (!seen.has(r.title)) { lines.push(`  ${r.title}`); seen.add(r.title); }
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('⚠️ *Uyarı:*');
    const seen = new Set<string>();
    for (const r of warnings.slice(0, 5)) {
      if (!seen.has(r.title)) { lines.push(`  ${r.title}`); seen.add(r.title); }
    }
  }

  // ── Predictions (sadece tehlikeli) ──
  const predictions = state.trends.filter(t => t.prediction && t.direction === 'rising');
  for (const p of predictions) {
    const val = trendVal(p);
    if (val !== null && val > 70) {
      lines.push(`📈 ${p.prediction}`);
    }
  }

  // ── Sorun yoksa kısa bilgi ──
  if (criticals.length === 0 && warnings.length === 0) {
    lines.push('✅ Tüm sistemler nominal.');
  }

  // ── Footer: kompakt stats ──
  lines.push(`\n📬 ${state.notificationsToday} bildirim | 💭 ${state.recentThoughts.length} düşünce`);

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
