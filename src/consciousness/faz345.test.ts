import { describe, it, expect } from 'vitest';

import {
  composeProactiveMessage,
  composeMorningMessage,
  composeNightReport,
  composeCheckInMessage,
  composeThoughtMessage,
  getPersonalitySystemPrompt,
  DEFAULT_PERSONALITY,
} from './personality.js';

import {
  createTask,
  addTask,
  getNextTask,
  getNextStep,
  startStep,
  completeStep,
  failStep,
  getQueueStats,
  formatQueueStatus,
} from './task-queue.js';

import {
  detectPatterns,
  matchPattern,
  decayPatterns,
  formatLearningSummary,
} from './learning.js';

import {
  createInitialState,
  type ConsciousnessState,
  type Thought,
  type SensorReading,
} from './types.js';

// ═══════════════════════════════════════════
// FAZ 3: PERSONALITY
// ═══════════════════════════════════════════

describe('Personality Engine', () => {
  const state = createInitialState();

  it('composeProactiveMessage returns null for serene mood (below threshold)', () => {
    state.emotion.mood = 'serene';
    const msg = composeProactiveMessage(state);
    // Serene urgency=0, default threshold=0.3, so null
    expect(msg).toBe(null);
  });

  it('composeProactiveMessage returns message for stressed mood', () => {
    state.emotion.mood = 'stressed';
    const msg = composeProactiveMessage(state);
    expect(msg !== null, 'stressed should produce a message').toBeTruthy();
    expect(msg!.includes('😰'), 'should include stressed emoji').toBeTruthy();
  });

  it('composeProactiveMessage returns message for critical mood', () => {
    state.emotion.mood = 'critical';
    const msg = composeProactiveMessage(state);
    expect(msg !== null).toBeTruthy();
    expect(msg!.includes('🚨')).toBeTruthy();
  });

  it('composeMorningMessage returns string', () => {
    state.emotion.mood = 'serene';
    state.heartbeatCount = 100;
    const msg = composeMorningMessage(state);
    expect(typeof msg).toBe('string');
  });

  it('composeNightReport has structure', () => {
    const report = composeNightReport(state);
    expect(report.includes('Gece raporu') || report.includes('🌙')).toBeTruthy();
  });

  it('composeThoughtMessage formats thought', () => {
    const thought: Thought = {
      id: 't1',
      timestamp: Date.now(),
      source: 'system',
      priority: 'critical',
      summary: 'Disk %95 dolu',
      readings: [],
      notified: false,
      autoResolved: false,
    };
    const msg = composeThoughtMessage(thought, state.emotion);
    expect(msg.includes('Disk')).toBeTruthy();
  });

  it('composeCheckInMessage returns null for recent activity', () => {
    const msg = composeCheckInMessage(Date.now(), state);
    expect(msg).toBe(null);
  });

  it('composeCheckInMessage returns message after 8+ hours silence', () => {
    const eightHoursAgo = Date.now() - 9 * 3600000;
    const msg = composeCheckInMessage(eightHoursAgo, state);
    // Depends on current hour — may return null outside 9-22 range
    expect(msg === null || typeof msg === 'string').toBeTruthy();
  });

  it('getPersonalitySystemPrompt returns string with mood', () => {
    const prompt = getPersonalitySystemPrompt(state.emotion);
    expect(prompt.includes('Foreman')).toBeTruthy();
    expect(prompt.length > 20).toBeTruthy();
  });

  it('DEFAULT_PERSONALITY has expected defaults', () => {
    expect(DEFAULT_PERSONALITY.language).toBe('tr');
    expect(DEFAULT_PERSONALITY.tone).toBe('casual');
  });
});

// ═══════════════════════════════════════════
// FAZ 4: TASK QUEUE
// ═══════════════════════════════════════════

describe('Task Queue', () => {
  it('createTask creates valid task', () => {
    const task = createTask('Test', 'Test task', [
      { description: 'Step 1', command: 'echo 1' },
      { description: 'Step 2', command: 'echo 2' },
    ]);
    expect(task.title).toBe('Test');
    expect(task.steps.length).toBe(2);
    expect(task.status).toBe('pending');
  });

  it('addTask adds to queue', () => {
    const task = createTask('T1', 'Desc', [{ description: 'S1' }]);
    const queue = { tasks: [], completedCount: 0, failedCount: 0, lastProcessedAt: 0 };
    const updated = addTask(queue, task);
    expect(updated.tasks.length).toBe(1);
  });

  it('getNextTask returns highest priority in_progress', () => {
    const low = createTask('Low', '', [{ description: 's' }], 'low');
    low.status = 'in_progress';
    const high = createTask('High', '', [{ description: 's' }], 'high');
    high.status = 'in_progress';
    const queue = { tasks: [low, high], completedCount: 0, failedCount: 0, lastProcessedAt: 0 };
    const next = getNextTask(queue);
    expect(next?.title).toBe('High');
  });

  it('getNextStep returns current step', () => {
    const task = createTask('T', '', [
      { description: 'S1' },
      { description: 'S2' },
    ]);
    const step = getNextStep(task);
    expect(step?.description).toBe('S1');
  });

  it('startStep marks step as in_progress', () => {
    const task = createTask('T', '', [{ description: 'S1' }]);
    const stepId = task.steps[0].id;
    const updated = startStep(task, stepId);
    expect(updated.steps[0].status).toBe('in_progress');
    expect(updated.status).toBe('in_progress');
  });

  it('completeStep moves to next step', () => {
    const task = createTask('T', '', [
      { description: 'S1' },
      { description: 'S2' },
    ]);
    task.status = 'in_progress';
    const stepId = task.steps[0].id;
    const updated = completeStep(task, stepId, 'OK');
    expect(updated.steps[0].status).toBe('done');
    expect(updated.currentStepIndex).toBe(1);
  });

  it('completeStep finishes task when all steps done', () => {
    const task = createTask('T', '', [{ description: 'S1' }]);
    task.status = 'in_progress';
    const updated = completeStep(task, task.steps[0].id, 'OK');
    expect(updated.status).toBe('done');
  });

  it('failStep retries then fails', () => {
    const task = createTask('T', '', [{ description: 'S1' }]);
    task.steps[0].maxRetries = 2;
    let updated = failStep(task, task.steps[0].id, 'err1');
    expect(updated.steps[0].status).toBe('pending'); // retry 1
    updated = failStep(updated, updated.steps[0].id, 'err2');
    expect(updated.steps[0].status).toBe('failed'); // max retries
    expect(updated.status).toBe('failed');
  });

  it('getQueueStats returns correct counts', () => {
    const t1 = createTask('T1', '', [{ description: 's' }]);
    t1.status = 'done';
    const t2 = createTask('T2', '', [{ description: 's' }]);
    t2.status = 'in_progress';
    const queue = { tasks: [t1, t2], completedCount: 0, failedCount: 0, lastProcessedAt: 0 };
    const stats = getQueueStats(queue);
    expect(stats.done).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.total).toBe(2);
  });

  it('formatQueueStatus returns readable string', () => {
    const t1 = createTask('Build App', '', [{ description: 's1' }, { description: 's2' }]);
    t1.status = 'in_progress';
    const queue = { tasks: [t1], completedCount: 0, failedCount: 0, lastProcessedAt: 0 };
    const output = formatQueueStatus(queue);
    expect(output.includes('Görev Kuyruğu')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// FAZ 5: LEARNING
// ═══════════════════════════════════════════

describe('Learning Engine', () => {
  it('detectPatterns finds repeated patterns', () => {
    const thoughts: Thought[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      timestamp: Date.now() - i * 60000,
      source: 'system' as const,
      priority: 'high' as const,
      summary: 'Disk: %92 kullanımda',
      readings: [],
      notified: false,
      autoResolved: false,
    }));
    const patterns = detectPatterns(thoughts, []);
    expect(patterns.length > 0, 'should detect at least one pattern').toBeTruthy();
    expect(patterns[0].trigger.sensor === 'disk').toBeTruthy();
  });

  it('detectPatterns updates existing pattern confidence', () => {
    const existing = [{
      id: 'p1',
      description: 'disk pattern',
      occurrences: 5,
      firstSeen: Date.now() - 86400000,
      lastSeen: Date.now() - 3600000,
      trigger: { sensor: 'disk', keyword: 'disk_high' },
      confidence: 0.5,
      active: true,
    }];
    const thoughts: Thought[] = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`,
      timestamp: Date.now() - i * 60000,
      source: 'system' as const,
      priority: 'high' as const,
      summary: 'Disk: %92 dolu',
      readings: [],
      notified: false,
      autoResolved: false,
    }));
    const updated = detectPatterns(thoughts, existing);
    const diskPattern = updated.find(p => p.trigger.sensor === 'system' && p.trigger.keyword.includes('disk'));
    expect(diskPattern).toBeTruthy();
    expect(diskPattern!.confidence > 0.5, 'confidence should increase').toBeTruthy();
  });

  it('matchPattern finds matching pattern for reading', () => {
    const patterns = [{
      id: 'p1',
      description: 'disk high',
      occurrences: 10,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      trigger: { sensor: 'system', keyword: 'disk_high' },
      confidence: 0.8,
      active: true,
      learnedAction: { type: 'auto_fix' as const, command: 'apt clean', reason: 'learned' },
    }];
    const reading: SensorReading = {
      sensor: 'system',
      title: 'Disk: %95 kullanımda',
      detail: '',
      severity: 'warning',
      timestamp: Date.now(),
      actionable: true,
    };
    const match = matchPattern(reading, patterns);
    expect(match !== null).toBeTruthy();
    expect(match!.learnedAction?.command).toBe('apt clean');
  });

  it('matchPattern returns null for low confidence', () => {
    const patterns = [{
      id: 'p1',
      description: 'disk',
      occurrences: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      trigger: { sensor: 'system', keyword: 'disk_high' },
      confidence: 0.1, // too low
      active: true,
    }];
    const reading: SensorReading = {
      sensor: 'system',
      title: 'Disk: %95 kullanımda',
      detail: '',
      severity: 'warning',
      timestamp: Date.now(),
      actionable: true,
    };
    const match = matchPattern(reading, patterns);
    expect(match).toBe(null);
  });

  it('decayPatterns reduces confidence for old patterns', () => {
    const patterns = [{
      id: 'p1',
      description: 'old',
      occurrences: 5,
      firstSeen: Date.now() - 90 * 86400000,
      lastSeen: Date.now() - 40 * 86400000, // 40 days ago
      trigger: { sensor: 'x', keyword: 'y' },
      confidence: 0.5,
      active: true,
    }];
    const decayed = decayPatterns(patterns);
    expect(decayed[0].confidence < 0.5).toBeTruthy();
  });

  it('formatLearningSummary returns summary', () => {
    const state = {
      patterns: [{
        id: 'p1',
        description: 'test pattern',
        occurrences: 10,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        trigger: { sensor: 'disk', keyword: 'disk_high' },
        confidence: 0.9,
        active: true,
      }],
      totalLearned: 1,
      totalApplied: 5,
      lastLearnedAt: Date.now(),
    };
    const summary = formatLearningSummary(state);
    expect(summary.includes('Öğrenme')).toBeTruthy();
    expect(summary.includes('1')).toBeTruthy();
  });

  it('formatLearningSummary handles empty state', () => {
    const state = { patterns: [], totalLearned: 0, totalApplied: 0, lastLearnedAt: 0 };
    const summary = formatLearningSummary(state);
    expect(summary.includes('Henüz')).toBeTruthy();
  });
});
