/**
 * FOREMAN — Consciousness Layer Types
 * 
 * Yaşayan bir sistemin tüm veri yapıları.
 * Bir kalp atışı değil — bir bilinç akışı.
 */

// ═══════════════════════════════════════════
// SENSOR TYPES
// ═══════════════════════════════════════════

export type SensorType =
  | 'system'      // CPU, RAM, Disk, uptime
  | 'service'     // systemd, docker, key processes
  | 'git'         // repo state, uncommitted changes
  | 'test'        // test suite health
  | 'log'         // journalctl / app log errors
  | 'network'     // connectivity, DNS, port checks
  | 'cron'        // scheduled job health
  | 'self'        // Foreman's own health — meta-awareness
  | 'foreman'     // Work tracking, memory writes, agent activity
  | 'sniper'      // Twitter Sniper performance
  | 'github';     // GitHub repo stats

export type Severity = 'info' | 'warning' | 'critical';

export interface SensorReading {
  sensor: SensorType;
  timestamp: number;
  severity: Severity;
  title: string;
  detail: string;
  value?: number;
  actionable: boolean;
  /** Metric key for trend tracking */
  metricKey?: string;
}

// ═══════════════════════════════════════════
// MOOD & EMOTION
// ═══════════════════════════════════════════

/**
 * Mood — Foreman'ın genel ruh hali.
 * Sensör verileri + geçmiş deneyimlerden türetilir.
 */
export type Mood =
  | 'serene'       // Her şey yolunda, sistem sakin
  | 'alert'        // Bir şeyler dikkat istiyor
  | 'stressed'     // Birden fazla sorun var
  | 'critical'     // Acil durum
  | 'curious'      // Boşta, keşfetme modunda
  | 'productive'   // Aktif çalışma var, projeler ilerliyor
  | 'reflective';  // Gece, sakin düşünme zamanı

export interface EmotionalState {
  mood: Mood;
  intensity: number;      // 0-100
  since: number;          // timestamp — bu mood ne zamandan beri
  trigger?: string;       // bu mood'u tetikleyen olay
}

// ═══════════════════════════════════════════
// THOUGHT & INNER MONOLOGUE
// ═══════════════════════════════════════════

export type ThoughtPriority = 'low' | 'medium' | 'high' | 'critical';

export type ThoughtActionType =
  | 'notify'        // Kullanıcıya mesaj at
  | 'auto_fix'      // Otomatik düzelt
  | 'suppress'      // Sessizce yut
  | 'defer'         // Sonraya ertele
  | 'reflect'       // İç diyalogda düşün, aksiyon alma
  | 'learn';        // Bir şey öğren, memory'ye yaz

export interface ThoughtAction {
  type: ThoughtActionType;
  message?: string;
  command?: string;
  result?: string;
  reason?: string;
  until?: number;
  memoryKey?: string;
  memoryValue?: string;
}

export interface Thought {
  id: string;
  timestamp: number;
  source: SensorType | 'inner_monologue' | 'dream';
  priority: ThoughtPriority;
  summary: string;
  readings: SensorReading[];
  action?: ThoughtAction;
  notified: boolean;
  autoResolved: boolean;
  /** Emotional impact of this thought on mood */
  moodImpact?: Mood;
}

// ═══════════════════════════════════════════
// MEMORY & LEARNING
// ═══════════════════════════════════════════

/**
 * Bir deneyim kaydı — Foreman ne gördü, ne yaptı, ne öğrendi
 */
export interface Experience {
  id: string;
  timestamp: number;
  category: 'incident' | 'fix' | 'observation' | 'pattern' | 'user_preference';
  summary: string;
  detail: string;
  /** İlişkili düşünce ID'leri */
  relatedThoughts: string[];
  /** Kaç kez benzer olay yaşandı */
  occurrenceCount: number;
  /** Son yaşandığı zaman */
  lastSeen: number;
}

/**
 * Trend — Bir metriğin zaman içindeki değişimi
 */
export interface MetricTrend {
  key: string;           // e.g. "disk_usage", "ram_usage"
  values: { ts: number; value: number }[];
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  prediction?: string;   // "Disk 3 gün içinde %95'e ulaşacak"
}

// ═══════════════════════════════════════════
// DAILY JOURNAL
// ═══════════════════════════════════════════

export interface DailyJournal {
  date: string;          // YYYY-MM-DD
  mood: Mood;
  summary: string;       // Günün özeti
  incidents: string[];   // Yaşanan sorunlar
  fixes: string[];       // Yapılan düzeltmeler
  observations: string[];// Gözlemler
  metrics: {
    avgCpu: number;
    avgRam: number;
    avgDisk: number;
    totalThoughts: number;
    totalNotifications: number;
    totalAutoFixes: number;
  };
}

// ═══════════════════════════════════════════
// LLM DECISION TRACKING
// ═══════════════════════════════════════════

export interface LlmDecision {
  id: string;
  timestamp: number;
  action: 'respond' | 'work' | 'ask' | 'silent' | 'notify';
  message?: string;
  reasoning?: string;
  contextSummary: string; // Hangi durumda bu karar verildi
  feedback?: 'positive' | 'negative' | 'neutral' | 'ignored';
  evaluated: boolean;
}

// ═══════════════════════════════════════════
// CONSCIOUSNESS STATE
// ═══════════════════════════════════════════

export interface ConsciousnessState {
  // ─── Identity ───
  startedAt: number;
  uptimeMs: number;

  // ─── Heartbeat ───
  heartbeatCount: number;
  lastBeatAt: number;
  alive: boolean;

  // ─── Emotional ───
  emotion: EmotionalState;

  // ─── Thoughts ───
  thoughts: Thought[];
  recentThoughts: Thought[];  // Son 1 saatin düşünceleri

  // ─── Notifications ───
  notificationsToday: number;
  lastResetDate: string;

  // ─── Sensors ───
  lastSensorRun: Partial<Record<SensorType, number>>;
  sensorHealth: Partial<Record<SensorType, 'healthy' | 'degraded' | 'failing'>>;

  // ─── Trends ───
  trends: MetricTrend[];

  // ─── Experiences ───
  experiences: Experience[];

  // ─── LLM Decisions (Phase 3) ───
  llmDecisions: LlmDecision[];

  // ─── Journal ───
  journals: DailyJournal[];

  // ─── Inner Voice ───
  lastInnerMonologue: string;
  lastInnerMonologueAt: number;

  // ─── Proactive Messaging ───
  proactiveMessages: Record<string, number>;
}

export function createInitialState(): ConsciousnessState {
  const now = Date.now();
  return {
    startedAt: now,
    uptimeMs: 0,
    heartbeatCount: 0,
    lastBeatAt: 0,
    alive: false,
    emotion: {
      mood: 'serene',
      intensity: 50,
      since: now,
    },
    thoughts: [],
    recentThoughts: [],
    notificationsToday: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    lastSensorRun: {},
    sensorHealth: {},
    trends: [],
    experiences: [],
    llmDecisions: [],
    journals: [],
    lastInnerMonologue: '',
    lastInnerMonologueAt: 0,
    proactiveMessages: {},
  };
}

// ═══════════════════════════════════════════
// HEARTBEAT CONFIG
// ═══════════════════════════════════════════

export interface HeartbeatConfig {
  /** Ana döngü aralığı (ms) */
  intervalMs: number;
  /** Sessiz saatler */
  quietHoursStart: number;
  quietHoursEnd: number;
  /** Günlük max bildirim */
  maxDailyNotifications: number;
  /** Aktif sensörler */
  enabledSensors: SensorType[];
  /** Otomatik fix aktif mi */
  autoFixEnabled: boolean;
  /** Telegram chat ID */
  notifyChatId?: string;
  /** Sensör cooldown (ms) */
  sensorCooldownMs: number;
  /** İç diyalog aralığı — her N beat'te bir iç diyalog yap */
  innerMonologueEvery: number;
  /** Durum raporu aralığı — her N beat'te bir rapor gönder */
  statusReportEvery: number;
  /** Günlük journal saati (0-23) */
  journalHour: number;
  /** Trend takibi aktif mi */
  trendTrackingEnabled: boolean;
  /** LLM provider — consciousness için (opsiyonel, yoksa eski davranış) */
  provider?: any;
  /** Tool executor — consciousness tool call'lar için */
  toolExecutor?: any;
  /** Aktif model adı */
  activeModel?: string;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 15 * 60 * 1000,          // 15 dakika
  quietHoursStart: 2,                  // Gece 2
  quietHoursEnd: 7,                    // Sabah 7
  maxDailyNotifications: 10,
  enabledSensors: ['system', 'service', 'git', 'test', 'log', 'self', 'cron', 'foreman', 'sniper', 'github'],
  autoFixEnabled: true,
  notifyChatId: undefined,
  sensorCooldownMs: 15 * 60 * 1000,   // 15 dakika (30 çok uzundu)
  innerMonologueEvery: 12,             // Her 1 saatte bir iç diyalog
  statusReportEvery: 36,               // Her 3 saatte bir durum raporu
  journalHour: 23,                     // Gece 23'te günlük journal
  trendTrackingEnabled: true,
};

// ═══════════════════════════════════════════
// FOREMAN SENSOR DATA TYPES
// ═══════════════════════════════════════════

export interface ForemanSensorData {
  sensed_at: number;
  status: 'active' | 'paused' | 'error' | null;
  metrics: {
    active_count?: number | null;
    paused_count?: number | null;
    completed_count?: number | null;
    last_completed_title?: string | null;
  };
  metadata?: {
    source_path?: string;
    work_dir?: string;
  };
}

export interface SniperSensorData {
  sensed_at: number;
  status: 'active' | 'paused' | 'error' | null;
  metrics: {
    likes?: number | null;
    replies?: number | null;
    tweets?: number | null;
    queries?: string[] | null;
    uptime_minutes?: number | null;
  };
  metadata?: {
    log_path?: string;
    last_query?: string;
  };
}

export interface CronJobInfo {
  name: string;
  healthy: boolean;
  last_run?: number | null;
  schedule?: string;
}

export interface CronSensorData {
  sensed_at: number;
  status: 'active' | 'paused' | 'error' | null;
  metrics: {
    healthy_count?: number | null;
    unhealthy_count?: number | null;
    jobs?: CronJobInfo[] | null;
  };
  metadata?: {
    config_path?: string;
  };
}
