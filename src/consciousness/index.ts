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
  generateCuriosityThought,
} from './thinker.js';

export {
  heartbeatCycle,
  startHeartbeatLoop,
  stopHeartbeatLoop,
  isHeartbeatRunning,
} from './heartbeat.js';

export {
  composeProactiveMessage,
  composeMorningMessage,
  composeNightReport,
  composeCheckInMessage,
  composeThoughtMessage,
  getPersonalitySystemPrompt,
  DEFAULT_PERSONALITY,
} from './personality.js';

export {
  createTask,
  addTask,
  getNextTask,
  getNextStep,
  startStep,
  completeStep,
  failStep,
  getQueueStats,
  formatQueueStatus,
  loadTaskQueue,
  saveTaskQueue,
  cleanupOldTasks,
} from './task-queue.js';

export {
  detectPatterns,
  matchPattern,
  decayPatterns,
  loadLearning,
  saveLearning,
  formatLearningSummary,
} from './learning.js';

export {
  gatherAwareness,
  getAwarenessBrief,
  getLastUserMessage,
  getOpenTasks,
  type AwarenessContext,
  type ConversationSummary,
  type ChainSummary,
} from './awareness.js';
