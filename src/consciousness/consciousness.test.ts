/**
 * FOREMAN — Consciousness Tests
 * 
 * Bilinç katmanının tüm bileşenlerini test eder:
 * Sensörler, Thinker, Mood, Trends, Experience, Journal, Heartbeat
 */

import { describe, it, beforeEach, expect } from 'vitest';
import {
  createInitialState,
  DEFAULT_HEARTBEAT_CONFIG,
  type SensorReading,
  type ConsciousnessState,
  type HeartbeatConfig,
  type MetricTrend,
  type Thought,
} from './types.js';
import {
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

// ─── Test Helpers ───

function mkReading(overrides: Partial<SensorReading> = {}): SensorReading {
  return {
    sensor: 'system',
    timestamp: Date.now(),
    severity: 'info',
    title: 'Test reading',
    detail: 'Test detail',
    actionable: false,
    ...overrides,
  };
}

function mkConfig(overrides: Partial<HeartbeatConfig> = {}): HeartbeatConfig {
  return {
    ...DEFAULT_HEARTBEAT_CONFIG,
    quietHoursStart: 99, // Disable quiet hours in tests
    quietHoursEnd: 99,
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// MOOD ENGINE
// ═══════════════════════════════════════════

describe('Mood Engine', () => {
  it('serene when all is well', () => {
    const state = createInitialState();
    state.heartbeatCount = 5; // Avoid 0 % 12 === 0 triggering 'curious'
    const readings = [mkReading({ severity: 'info' })];
    const mood = deriveMood(readings, state, mkConfig());
    expect(mood.mood).toBe('serene');
    expect(mood.intensity > 0).toBeTruthy();
  });

  it('critical on critical readings', () => {
    const state = createInitialState();
    const readings = [mkReading({ severity: 'critical', title: 'Disk full!' })];
    const mood = deriveMood(readings, state, mkConfig());
    expect(mood.mood).toBe('critical');
    expect(mood.intensity >= 80).toBeTruthy();
    expect(mood.trigger).toBe('Disk full!');
  });

  it('stressed on multiple warnings', () => {
    const state = createInitialState();
    const readings = [
      mkReading({ severity: 'warning' }),
      mkReading({ severity: 'warning' }),
      mkReading({ severity: 'warning' }),
    ];
    const mood = deriveMood(readings, state, mkConfig());
    expect(mood.mood).toBe('stressed');
  });

  it('alert on single warning', () => {
    const state = createInitialState();
    const readings = [mkReading({ severity: 'warning' })];
    const mood = deriveMood(readings, state, mkConfig());
    expect(mood.mood).toBe('alert');
  });

  it('smooths intensity when mood unchanged', () => {
    const state = createInitialState();
    state.emotion = { mood: 'serene', intensity: 50, since: Date.now() - 60000 };
    const readings = [mkReading({ severity: 'info' })];
    const mood = deriveMood(readings, state, mkConfig());
    // Smoothed between old and new
    expect(mood.intensity >= 10 && mood.intensity <= 60).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// TREND TRACKER
// ═══════════════════════════════════════════

describe('Trend Tracker', () => {
  it('creates new trend from reading', () => {
    const readings = [mkReading({ metricKey: 'disk_usage', value: 45 })];
    const trends = updateTrends([], readings);
    expect(trends.length).toBe(1);
    expect(trends[0].key).toBe('disk_usage');
    expect(trends[0].values.length).toBe(1);
  });

  it('appends to existing trend', () => {
    const existing: MetricTrend[] = [{
      key: 'disk_usage',
      values: [{ ts: Date.now() - 60000, value: 40 }],
      direction: 'stable',
    }];
    const readings = [mkReading({ metricKey: 'disk_usage', value: 45 })];
    const trends = updateTrends(existing, readings);
    expect(trends[0].values.length).toBe(2);
  });

  it('detects rising direction', () => {
    const existing: MetricTrend[] = [{
      key: 'disk_usage',
      values: [
        { ts: Date.now() - 30000, value: 40 },
        { ts: Date.now() - 20000, value: 50 },
        { ts: Date.now() - 10000, value: 60 },
      ],
      direction: 'stable',
    }];
    const readings = [mkReading({ metricKey: 'disk_usage', value: 70 })];
    const trends = updateTrends(existing, readings);
    expect(trends[0].direction).toBe('rising');
  });

  it('generates disk prediction when rising above 70%', () => {
    const now = Date.now();
    const existing: MetricTrend[] = [{
      key: 'disk_usage',
      values: [
        { ts: now - 3600000, value: 72 },
        { ts: now - 2400000, value: 76 },
        { ts: now - 1200000, value: 80 },
      ],
      direction: 'stable',
    }];
    const readings = [mkReading({ metricKey: 'disk_usage', value: 84 })];
    const trends = updateTrends(existing, readings);
    expect(trends[0].prediction, 'Should have a prediction').toBeTruthy();
    expect(trends[0].prediction!.includes('saat')).toBeTruthy();
  });

  it('skips readings without metricKey', () => {
    const readings = [mkReading({ value: 50 })]; // no metricKey
    const trends = updateTrends([], readings);
    expect(trends.length).toBe(0);
  });
});

// ═══════════════════════════════════════════
// EXPERIENCE TRACKER
// ═══════════════════════════════════════════

describe('Experience Tracker', () => {
  it('records new experience', () => {
    const thought: Thought = {
      id: 't_1', timestamp: Date.now(), source: 'system',
      priority: 'high', summary: 'Disk full',
      readings: [], notified: true, autoResolved: false,
      action: { type: 'notify', message: 'disk' },
    };
    const exps = recordExperience([], thought);
    expect(exps.length).toBe(1);
    expect(exps[0].occurrenceCount).toBe(1);
  });

  it('increments occurrence on similar experience', () => {
    const thought1: Thought = {
      id: 't_1', timestamp: Date.now(), source: 'system',
      priority: 'high', summary: 'System issue',
      readings: [], notified: true, autoResolved: false,
    };
    const thought2: Thought = {
      id: 't_2', timestamp: Date.now(), source: 'system',
      priority: 'high', summary: 'System issue again',
      readings: [], notified: true, autoResolved: false,
    };
    let exps = recordExperience([], thought1);
    exps = recordExperience(exps, thought2);
    expect(exps.length).toBe(1); // Same category, merged
    expect(exps[0].occurrenceCount).toBe(2);
  });
});

// ═══════════════════════════════════════════
// THOUGHT GENERATOR
// ═══════════════════════════════════════════

describe('Thought Generator', () => {
  it('returns null for info-only readings', () => {
    const state = createInitialState();
    const readings = [mkReading({ severity: 'info', actionable: false })];
    const thought = processReadings(readings, state, mkConfig());
    expect(thought).toBe(null);
  });

  it('generates thought for warning', () => {
    const state = createInitialState();
    const readings = [mkReading({ severity: 'warning', actionable: true, title: 'RAM high' })];
    const thought = processReadings(readings, state, mkConfig());
    expect(thought).toBeTruthy();
    expect(thought.priority).toBe('high');
    expect(thought.summary.includes('RAM high')).toBeTruthy();
  });

  it('generates critical thought and suggests auto_fix for disk', () => {
    const state = createInitialState();
    const readings = [mkReading({
      sensor: 'system', severity: 'critical', actionable: true,
      title: 'Disk: %96', metricKey: 'disk_usage', value: 96,
    })];
    const thought = processReadings(readings, state, mkConfig({ autoFixEnabled: true }));
    expect(thought).toBeTruthy();
    expect(thought.priority).toBe('critical');
    expect(thought.action?.type).toBe('auto_fix');
    expect(thought.action?.command?.includes('apt-get clean')).toBeTruthy();
  });

  it('respects cooldown for non-critical', () => {
    const state = createInitialState();
    state.lastSensorRun.system = Date.now(); // Just ran
    const readings = [mkReading({ severity: 'warning', actionable: true })];
    const thought = processReadings(readings, state, mkConfig({ sensorCooldownMs: 999999 }));
    expect(thought).toBe(null); // Cooldown active
  });

  it('ignores cooldown for critical', () => {
    const state = createInitialState();
    state.lastSensorRun.system = Date.now();
    const readings = [mkReading({ severity: 'critical', actionable: true })];
    const thought = processReadings(readings, state, mkConfig({ sensorCooldownMs: 999999 }));
    expect(thought).toBeTruthy(); // Critical bypasses cooldown
  });
});

// ═══════════════════════════════════════════
// NOTIFICATION CONTROL
// ═══════════════════════════════════════════

describe('Notification Control', () => {
  it('quiet hours blocks notifications', () => {
    const hour = new Date().getHours();
    const config = mkConfig({ quietHoursStart: hour, quietHoursEnd: hour + 1 });
    expect(isQuietHours(config)).toBe(true);
  });

  it('outside quiet hours allows notifications', () => {
    const config = mkConfig({ quietHoursStart: 99, quietHoursEnd: 99 });
    expect(isQuietHours(config)).toBe(false);
  });

  it('canNotify respects daily limit', () => {
    const state = createInitialState();
    state.notificationsToday = 20;
    const config = mkConfig({ maxDailyNotifications: 20 });
    expect(canNotify(state, config)).toBe(false);
  });

  it('canNotify resets on new day', () => {
    const state = createInitialState();
    state.notificationsToday = 99;
    state.lastResetDate = '2020-01-01';
    const config = mkConfig({ maxDailyNotifications: 20 });
    expect(canNotify(state, config)).toBe(true);
    expect(state.notificationsToday).toBe(0);
  });

  it('cooldown detection works', () => {
    const state = createInitialState();
    state.lastSensorRun.system = Date.now();
    expect(isCoolingDown(state, 'system', 60000)).toBe(true);
    expect(isCoolingDown(state, 'git', 60000)).toBe(false);
  });
});

// ═══════════════════════════════════════════
// INNER MONOLOGUE
// ═══════════════════════════════════════════

describe('Inner Monologue', () => {
  it('generates meaningful inner voice', () => {
    const state = createInitialState();
    state.heartbeatCount = 50;
    state.emotion = { mood: 'serene', intensity: 30, since: Date.now() - 3600000 };
    state.notificationsToday = 3;
    const mono = generateInnerMonologue(state);
    expect(mono.includes('[Beat #50]')).toBeTruthy();
    expect(mono.includes('serene')).toBeTruthy();
    expect(mono.includes('uptime')).toBeTruthy();
  });

  it('mentions rising trends', () => {
    const state = createInitialState();
    state.heartbeatCount = 10;
    state.emotion = { mood: 'alert', intensity: 50, since: Date.now() };
    state.trends = [{
      key: 'disk_usage',
      values: [{ ts: Date.now(), value: 80 }],
      direction: 'rising',
      prediction: 'Disk 48 saat içinde %95\'e ulaşabilir',
    }];
    const mono = generateInnerMonologue(state);
    expect(mono.includes('disk_usage')).toBeTruthy();
    expect(mono.includes('↑')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// DAILY JOURNAL
// ═══════════════════════════════════════════

describe('Daily Journal', () => {
  it('generates journal with metrics', () => {
    const state = createInitialState();
    state.emotion = { mood: 'serene', intensity: 30, since: Date.now() };
    state.thoughts = [];
    state.notificationsToday = 2;
    const journal = generateDailyJournal(state);
    expect(journal.date).toBe(new Date().toISOString().split('T')[0]);
    expect(journal.summary.includes('Sakin')).toBeTruthy();
    expect(journal.metrics.totalNotifications).toBe(2);
  });
});

// ═══════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════

describe('Formatters', () => {
  it('formatThoughtForHuman includes priority emoji', () => {
    const thought: Thought = {
      id: 't_1', timestamp: Date.now(), source: 'system',
      priority: 'critical', summary: 'Disk full!',
      readings: [], notified: true, autoResolved: false,
    };
    const msg = formatThoughtForHuman(thought);
    expect(msg.includes('🚨')).toBeTruthy();
    expect(msg.includes('Disk full!')).toBeTruthy();
  });

  it('formatStatusReport contains mood and metrics', () => {
    const state = createInitialState();
    state.heartbeatCount = 10;
    state.emotion = { mood: 'serene', intensity: 30, since: Date.now() };
    state.trends = [{
      key: 'disk_usage',
      values: [{ ts: Date.now(), value: 45 }],
      direction: 'stable',
    }];
    const report = formatStatusReport(state);
    expect(report.includes('😌')).toBeTruthy();
    expect(report.includes('Durum Raporu')).toBeTruthy();
    expect(report.includes('💾')).toBeTruthy();
  });

  it('formatJournalForHuman has proper structure', () => {
    const state = createInitialState();
    state.emotion = { mood: 'serene', intensity: 30, since: Date.now() };
    const journal = generateDailyJournal(state);
    const msg = formatJournalForHuman(journal);
    expect(msg.includes('📓')).toBeTruthy();
    expect(msg.includes('Günlük')).toBeTruthy();
  });
});
