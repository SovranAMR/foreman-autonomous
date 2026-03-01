/**
 * FOREMAN — Consciousness Layer Types
 * Faz 1: Heartbeat + Proactive Agency
 */

// ─── Sensor Types ───

export type SensorType = 
  | 'system'      // CPU, RAM, Disk
  | 'service'     // systemd services, docker containers
  | 'git'         // repo changes, stale branches
  | 'test'        // test failures
  | 'log'         // error patterns in logs
  | 'cron'        // scheduled job failures
  | 'network';    // connectivity, port checks

export interface SensorReading {
  sensor: SensorType;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  /** Metric value if applicable (e.g., disk usage %) */
  value?: number;
  /** Should this trigger a notification? */
  actionable: boolean;
}

// ─── Thought Types ───

export type ThoughtPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Thought {
  id: string;
  timestamp: number;
  source: SensorType;
  priority: ThoughtPriority;
  summary: string;
  readings: SensorReading[];
  /** Action taken or suggested */
  action?: ThoughtAction;
  /** Was the user notified? */
  notified: boolean;
  /** Was this auto-resolved? */
  autoResolved: boolean;
}

export type ThoughtAction = 
  | { type: 'notify'; message: string }
  | { type: 'auto_fix'; command: string; result?: string }
  | { type: 'suppress'; reason: string }
  | { type: 'defer'; until: number };

// ─── Heartbeat Config ───

export interface HeartbeatConfig {
  /** Interval between heartbeats in ms (default: 5min = 300000) */
  intervalMs: number;
  /** Quiet hours — no notifications (e.g., 23:00-08:00) */
  quietHoursStart: number;  // hour 0-23
  quietHoursEnd: number;    // hour 0-23
  /** Max notifications per day */
  maxDailyNotifications: number;
  /** Sensors to run */
  enabledSensors: SensorType[];
  /** Auto-fix enabled? */
  autoFixEnabled: boolean;
  /** Telegram chat ID to notify */
  notifyChatId?: string;
  /** Cooldown per sensor type in ms (prevent spam) */
  sensorCooldownMs: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 5 * 60 * 1000,        // 5 minutes
  quietHoursStart: 23,
  quietHoursEnd: 8,
  maxDailyNotifications: 10,
  enabledSensors: ['system', 'service', 'git', 'test', 'log'],
  autoFixEnabled: true,
  notifyChatId: undefined,
  sensorCooldownMs: 30 * 60 * 1000, // 30 min cooldown per sensor
};

// ─── Consciousness State ───

export interface ConsciousnessState {
  /** When the heartbeat loop started */
  startedAt: number;
  /** Total heartbeats completed */
  heartbeatCount: number;
  /** All thoughts generated */
  thoughts: Thought[];
  /** Notification count today */
  notificationsToday: number;
  /** Last notification reset date (YYYY-MM-DD) */
  lastResetDate: string;
  /** Last sensor run timestamps (for cooldown) */
  lastSensorRun: Partial<Record<SensorType, number>>;
  /** Is the loop currently running? */
  alive: boolean;
}

export function createInitialState(): ConsciousnessState {
  return {
    startedAt: Date.now(),
    heartbeatCount: 0,
    thoughts: [],
    notificationsToday: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    lastSensorRun: {},
    alive: false,
  };
}
