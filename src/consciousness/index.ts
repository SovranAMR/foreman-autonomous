/**
 * FOREMAN — Consciousness Module
 * 
 * Yaşayan bir sistemin bilinç katmanı.
 * Algılar, hisseder, düşünür, öğrenir, paylaşır.
 */

export {
  type SensorReading,
  type SensorType,
  type Severity,
  type Thought,
  type ThoughtAction,
  type ThoughtActionType,
  type ThoughtPriority,
  type HeartbeatConfig,
  type ConsciousnessState,
  type Mood,
  type EmotionalState,
  type Experience,
  type MetricTrend,
  type DailyJournal,
  DEFAULT_HEARTBEAT_CONFIG,
  createInitialState,
} from './types.js';

export { SENSOR_MAP } from './sensors.js';

export {
  processReadings,
  formatThoughtForHuman,
  formatStatusReport,
  formatJournalForHuman,
  isQuietHours,
  canNotify,
  isCoolingDown,
  deriveMood,
  updateTrends,
  recordExperience,
  generateInnerMonologue,
  generateDailyJournal,
} from './thinker.js';

export {
  heartbeatCycle,
  startHeartbeatLoop,
  stopHeartbeatLoop,
  isHeartbeatRunning,
} from './heartbeat.js';
