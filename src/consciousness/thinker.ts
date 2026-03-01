/**
 * FOREMAN — Consciousness Thinker
 * Sensor verilerini analiz eder, düşünce üretir, karar verir
 */

import {
  SensorReading,
  Thought,
  ThoughtAction,
  ThoughtPriority,
  ConsciousnessState,
  HeartbeatConfig,
} from './types.js';

let thoughtCounter = 0;

function generateThoughtId(): string {
  return `thought_${Date.now()}_${++thoughtCounter}`;
}

/**
 * Severity → Priority mapping
 */
function severityToPriority(readings: SensorReading[]): ThoughtPriority {
  const hasCritical = readings.some(r => r.severity === 'critical');
  const hasWarning = readings.some(r => r.severity === 'warning');
  const actionableCount = readings.filter(r => r.actionable).length;

  if (hasCritical) return 'critical';
  if (hasWarning && actionableCount > 0) return 'high';
  if (hasWarning) return 'medium';
  return 'low';
}

/**
 * Quiet hours kontrolü
 */
export function isQuietHours(config: HeartbeatConfig): boolean {
  const hour = new Date().getHours();
  if (config.quietHoursStart > config.quietHoursEnd) {
    // Gece geçişi: 23-08 → 23,0,1,...7
    return hour >= config.quietHoursStart || hour < config.quietHoursEnd;
  }
  return hour >= config.quietHoursStart && hour < config.quietHoursEnd;
}

/**
 * Cooldown kontrolü — aynı sensor'dan çok sık bildirim gelmesini engeller
 */
export function isCoolingDown(
  state: ConsciousnessState,
  sensorType: string,
  cooldownMs: number,
): boolean {
  const lastRun = state.lastSensorRun[sensorType as keyof typeof state.lastSensorRun];
  if (!lastRun) return false;
  return Date.now() - lastRun < cooldownMs;
}

/**
 * Günlük bildirim limiti kontrolü
 */
export function canNotify(state: ConsciousnessState, config: HeartbeatConfig): boolean {
  // Reset daily counter
  const today = new Date().toISOString().split('T')[0];
  if (state.lastResetDate !== today) {
    state.notificationsToday = 0;
    state.lastResetDate = today;
  }

  if (state.notificationsToday >= config.maxDailyNotifications) return false;
  if (isQuietHours(config)) return false;
  return true;
}

/**
 * Auto-fix kararları
 */
function decideAutoFix(readings: SensorReading[]): ThoughtAction | null {
  for (const r of readings) {
    // Gateway düşmüşse otomatik restart
    if (r.sensor === 'service' && r.title.includes('gcloud-cca-gateway')) {
      return {
        type: 'auto_fix',
        command: 'sudo systemctl restart gcloud-cca-gateway',
      };
    }

    // Disk %95+ ise apt cache temizle
    if (r.sensor === 'system' && r.title.includes('Disk') && (r.value ?? 0) > 95) {
      return {
        type: 'auto_fix',
        command: 'sudo apt-get clean && sudo journalctl --vacuum-size=100M',
      };
    }
  }
  return null;
}

/**
 * Ana düşünce üretici
 * Sensor verilerini alır → Thought döndürür
 */
export function processReadings(
  readings: SensorReading[],
  state: ConsciousnessState,
  config: HeartbeatConfig,
): Thought | null {
  // Sadece actionable veya warning+ olanları düşün
  const significant = readings.filter(
    r => r.actionable || r.severity !== 'info'
  );

  if (significant.length === 0) return null;

  const priority = severityToPriority(significant);
  const sensor = significant[0].sensor;

  // Cooldown check
  if (priority !== 'critical' && isCoolingDown(state, sensor, config.sensorCooldownMs)) {
    return null; // Spam engelle, critical hariç
  }

  // Düşünce oluştur
  const thought: Thought = {
    id: generateThoughtId(),
    timestamp: Date.now(),
    source: sensor,
    priority,
    summary: significant.map(r => r.title).join(' | '),
    readings: significant,
    notified: false,
    autoResolved: false,
  };

  // Auto-fix denemesi
  if (config.autoFixEnabled && priority === 'critical') {
    const fix = decideAutoFix(significant);
    if (fix) {
      thought.action = fix;
    }
  }

  // Bildirim kararı
  if (priority === 'critical' || priority === 'high') {
    if (canNotify(state, config) || priority === 'critical') {
      thought.action = thought.action ?? { type: 'notify', message: thought.summary };
      thought.notified = true;
    }
  } else if (priority === 'medium' && canNotify(state, config)) {
    thought.action = { type: 'notify', message: thought.summary };
    thought.notified = true;
  } else {
    thought.action = { type: 'suppress', reason: 'low priority or quiet hours' };
  }

  return thought;
}

/**
 * Düşünce özetini insan-okunur Telegram mesajına çevir
 */
export function formatThoughtForHuman(thought: Thought): string {
  const priorityEmoji: Record<ThoughtPriority, string> = {
    low: '📝',
    medium: '⚡',
    high: '⚠️',
    critical: '🚨',
  };

  const emoji = priorityEmoji[thought.priority];
  let msg = `${emoji} **${thought.summary}**`;

  if (thought.action?.type === 'auto_fix') {
    msg += `\n🔧 Otomatik fix: \`${thought.action.command}\``;
    if (thought.action.result) {
      msg += `\n✅ Sonuç: ${thought.action.result}`;
    }
  }

  return msg;
}
