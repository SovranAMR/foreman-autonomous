/**
 * FOREMAN — Consciousness Module
 * Faz 1: Heartbeat + Proactive Agency
 */

export { 
  type SensorReading,
  type SensorType,
  type Thought,
  type ThoughtAction,
  type ThoughtPriority,
  type HeartbeatConfig,
  type ConsciousnessState,
  DEFAULT_HEARTBEAT_CONFIG,
  createInitialState,
} from './types.js';

export { SENSOR_MAP } from './sensors.js';

export { 
  processReadings,
  formatThoughtForHuman,
  isQuietHours,
  canNotify,
  isCoolingDown,
} from './thinker.js';

export {
  heartbeatCycle,
  startHeartbeatLoop,
  stopHeartbeatLoop,
  isHeartbeatRunning,
} from './heartbeat.js';
