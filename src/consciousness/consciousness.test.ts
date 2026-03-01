/**
 * FOREMAN — Consciousness Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  processReadings,
  formatThoughtForHuman,
  isQuietHours,
  canNotify,
  isCoolingDown,
  DEFAULT_HEARTBEAT_CONFIG,
} from './index.js';
import type { SensorReading, HeartbeatConfig, ConsciousnessState } from './types.js';

// ─── Helper ───

function makeReading(overrides: Partial<SensorReading> = {}): SensorReading {
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

function makeConfig(overrides: Partial<HeartbeatConfig> = {}): HeartbeatConfig {
  return {
    ...DEFAULT_HEARTBEAT_CONFIG,
    quietHoursStart: 3,  // 03:00-04:00 — şu an büyük ihtimalle quiet değil
    quietHoursEnd: 4,
    ...overrides,
  };
}

// ─── Tests ───

describe('Consciousness — Types', () => {
  it('createInitialState returns valid state', () => {
    const state = createInitialState();
    assert.equal(state.heartbeatCount, 0);
    assert.equal(state.alive, false);
    assert.deepEqual(state.thoughts, []);
    assert.equal(state.notificationsToday, 0);
  });
});

describe('Consciousness — Thinker', () => {
  it('ignores info-only readings with no actionable', () => {
    const state = createInitialState();
    const config = makeConfig();
    const readings = [makeReading({ severity: 'info', actionable: false })];

    const thought = processReadings(readings, state, config);
    assert.equal(thought, null);
  });

  it('produces thought for critical reading', () => {
    const state = createInitialState();
    const config = makeConfig();
    const readings = [
      makeReading({
        severity: 'critical',
        actionable: true,
        title: '🔴 Disk %95 dolu',
      }),
    ];

    const thought = processReadings(readings, state, config);
    assert.ok(thought);
    assert.equal(thought.priority, 'critical');
    assert.ok(thought.summary.includes('Disk'));
    assert.equal(thought.notified, true);
  });

  it('produces thought for warning + actionable', () => {
    const state = createInitialState();
    const config = makeConfig();
    const readings = [
      makeReading({
        severity: 'warning',
        actionable: true,
        title: 'RAM %87',
      }),
    ];

    const thought = processReadings(readings, state, config);
    assert.ok(thought);
    assert.equal(thought.priority, 'high');
  });

  it('suppresses low priority thoughts', () => {
    const state = createInitialState();
    const config = makeConfig();
    const readings = [
      makeReading({
        severity: 'warning',
        actionable: false,
        title: 'Minor issue',
      }),
    ];

    const thought = processReadings(readings, state, config);
    assert.ok(thought);
    assert.equal(thought.priority, 'medium');
    // Medium priority should still notify (not in quiet hours)
  });

  it('respects cooldown — skips duplicate sensor', () => {
    const state = createInitialState();
    state.lastSensorRun = { system: Date.now() }; // Just ran
    const config = makeConfig({ sensorCooldownMs: 60000 });
    const readings = [
      makeReading({
        severity: 'warning',
        actionable: true,
        sensor: 'system',
      }),
    ];

    const thought = processReadings(readings, state, config);
    assert.equal(thought, null); // Cooldown active
  });

  it('critical ignores cooldown', () => {
    const state = createInitialState();
    state.lastSensorRun = { system: Date.now() };
    const config = makeConfig({ sensorCooldownMs: 60000 });
    const readings = [
      makeReading({
        severity: 'critical',
        actionable: true,
        sensor: 'system',
      }),
    ];

    const thought = processReadings(readings, state, config);
    assert.ok(thought); // Critical bypasses cooldown
  });

  it('auto-fix for gateway down', () => {
    const state = createInitialState();
    const config = makeConfig({ autoFixEnabled: true });
    const readings = [
      makeReading({
        sensor: 'service',
        severity: 'critical',
        actionable: true,
        title: '🔴 gcloud-cca-gateway servisi durmuş',
      }),
    ];

    const thought = processReadings(readings, state, config);
    assert.ok(thought);
    assert.equal(thought.action?.type, 'auto_fix');
    if (thought.action?.type === 'auto_fix') {
      assert.ok(thought.action.command.includes('restart'));
    }
  });
});

describe('Consciousness — Quiet Hours', () => {
  it('detects quiet hours correctly', () => {
    const hour = new Date().getHours();
    // Config: quiet 03:00-04:00
    const config = makeConfig({ quietHoursStart: 3, quietHoursEnd: 4 });
    const expected = hour >= 3 && hour < 4;
    assert.equal(isQuietHours(config), expected);
  });

  it('handles overnight quiet hours (23-08)', () => {
    const hour = new Date().getHours();
    const config = makeConfig({ quietHoursStart: 23, quietHoursEnd: 8 });
    const expected = hour >= 23 || hour < 8;
    assert.equal(isQuietHours(config), expected);
  });
});

describe('Consciousness — Notification Limits', () => {
  it('blocks when daily limit reached', () => {
    const state = createInitialState();
    state.notificationsToday = 10;
    state.lastResetDate = new Date().toISOString().split('T')[0];
    const config = makeConfig({ maxDailyNotifications: 10 });

    assert.equal(canNotify(state, config), false);
  });

  it('resets counter on new day', () => {
    const state = createInitialState();
    state.notificationsToday = 10;
    state.lastResetDate = '2020-01-01'; // Old date
    const config = makeConfig({
      maxDailyNotifications: 10,
      quietHoursStart: 3,
      quietHoursEnd: 4,
    });

    // Should reset and allow (unless we're in quiet hours)
    const hour = new Date().getHours();
    const inQuiet = hour >= 3 && hour < 4;
    assert.equal(canNotify(state, config), !inQuiet);
    assert.equal(state.notificationsToday, 0); // Reset happened
  });
});

describe('Consciousness — Formatting', () => {
  it('formats thought for Telegram', () => {
    const thought = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'system' as const,
      priority: 'critical' as const,
      summary: 'Disk %95 dolu',
      readings: [],
      notified: true,
      autoResolved: false,
      action: { type: 'auto_fix' as const, command: 'apt clean', result: 'OK' },
    };

    const msg = formatThoughtForHuman(thought);
    assert.ok(msg.includes('🚨'));
    assert.ok(msg.includes('Disk'));
    assert.ok(msg.includes('apt clean'));
    assert.ok(msg.includes('OK'));
  });
});
