import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PipelineObserver } from './pipeline-observer.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';

describe('PipelineObserver Robustness', () => {
  let projectRoot: string;
  let observer: PipelineObserver;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'foreman-obs-test-'));
    observer = new PipelineObserver(projectRoot);
  });

  it('should handle missing event data gracefully', () => {
    // Start without proper start call (edge case)
    observer.onBlockStart("Block 1/1: Test");
    observer.onAtomStart("Atom 1/1: Test");
    observer.onAtomEnd(true, 50);
    observer.onBlockEnd();

    const summary = observer.getSummary();
    assert.strictEqual(summary.totalBlocks, 1);
    assert.strictEqual(summary.passedAtoms, 1);
    assert.strictEqual(summary.totalTokens, 50);
  });

  it('should track and report hallucinations', () => {
    observer.onPipelineStart("Hallucination Test");
    observer.onOrchestratorEvent({
      type: 'hallucination' as any,
      message: 'Found fake tool call: delete_production_db()'
    });

    const summary = observer.getSummary();
    assert.strictEqual(summary.totalHallucinations, 1);
    const md = observer.formatMarkdownSummary();
    assert.ok(md.includes('Hallucinations 🛡️'), 'MD summary should include hallucination section');
    assert.ok(md.includes('delete_production_db'), 'MD summary should contain the hallucination detail');
  });

  it('should generate valid JSONL logs', () => {
    observer.onPipelineStart("Log Test");
    observer.onBlockStart("Block 1/1: Test");
    observer.onAtomStart("Atom 1/1: Test");
    observer.onAtomEnd(true, 10);
    observer.onPipelineEnd(true);

    const logPath = observer.getLogPath();
    assert.ok(existsSync(logPath), 'Log file should exist');

    const content = readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(content.length, 5, 'Should have 5 log entries');

    const firstEvent = JSON.parse(content[0]);
    assert.strictEqual(firstEvent.type, 'start');
    assert.strictEqual(firstEvent.category, 'pipeline');
  });

  it('should throttle telegram updates but send final report', async () => {
    let callCount = 0;
    const observer = new PipelineObserver(projectRoot);
    observer.enableTelegram(async (text) => {
      callCount++;
    }, 10000); // 10s throttle

    observer.onPipelineStart("Telegram Test"); // 1 call (immediate)
    observer.onPhaseStart("p1", "d1"); // Should be throttled
    observer.onPhaseStart("p2", "d2"); // Should be throttled
    observer.onPipelineEnd(true); // 1 call (final report bypasses throttle or is separate)

    // onPipelineEnd calls sendTelegramFinal which doesn't use throttle check
    // sendTelegramFinal calls this.telegramCallback directly.
    assert.strictEqual(callCount, 2, 'Should have 1 start + 1 final report, middle ones throttled');
  });

  it('should handle malformed block/atom descriptions', () => {
    observer.onPipelineStart("Malformed Test");
    observer.onBlockStart("Not a numbered block");
    observer.onAtomStart("Not a numbered atom");
    observer.onAtomEnd(true);
    observer.onBlockEnd();

    const blocks = observer.getBlocks();
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].description, "Not a numbered block");
    assert.strictEqual(blocks[0].atoms.length, 1);
    assert.strictEqual(blocks[0].atoms[0].description, "Not a numbered atom");
  });

  it('should track cost correctly via OrchestratorEvent', () => {
    observer.onPipelineStart("Cost Test");
    observer.onOrchestratorEvent({
      type: 'cost' as any,
      data: { cost: 0.05 }
    });
    observer.onOrchestratorEvent({
      type: 'cost' as any,
      data: { cost: 0.10 }
    });

    const summary = observer.getSummary();
    assert.ok(Math.abs(summary.totalCost - 0.15) < 0.0001);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
