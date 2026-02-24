/**
 * FOREMAN — Orchestrator Robustness Test
 *
 * Verifies that Orchestrator handles edge cases gracefully:
 * - Empty vision rejection
 * - Token budget enforcement
 * - State transition integrity
 * - Worker protocol validation failure
 *
 * Uses node:test and node:assert only.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Orchestrator } from './orchestrator.js';
import { Engine } from './engine.js';
import type { Thought, StepResult } from './types.js';

// Mock Engine to avoid real LLM calls and complex setup
class MockEngine extends Engine {
  mockResults: Record<string, any> = {};
  
  constructor() {
    // Pass minimal config
    super({
      projectRoot: '/tmp/foreman-test',
      primaryModel: 'mock-model',
      layers: {} as any
    });
  }

  // Override to return mock results
  async stepWithPhase(chainId: string, input: string, layer: string, phase: string): Promise<StepResult> {
    const key = `${layer}_${phase}`;
    const mock = this.mockResults[key] || {
      thought: {
        id: `t_${Date.now()}`,
        status: 'done',
        output: 'Mock output',
        confidence: 0.9,
        layer,
        tokenCost: 100
      },
      formatValid: true
    };
    return mock;
  }

  // Override state to avoid persistence issues
  state = {
    snapshot: () => ({
      totalTokens: this.totalTokens || 0,
      projectName: 'test-project'
    }),
    canTransition: () => true,
    transition: () => {},
  } as any;
  
  totalTokens = 0;
  
  // Minimal overrides for orchestrator dependencies
  sessions = { 
    start: () => ({ id: 's1' }), 
    end: () => {}, 
    getActive: () => ({ id: 's1' }),
    addCompletedTask: () => {},
    getRecentSummaries: () => []
  } as any;
  sessionManager = { createSession: () => ({ addMessage: () => {}, persist: () => {}, getMessages: () => [] }) } as any;
  sessionLifecycle = { create: () => ({ slug: 'test-slug', id: 'sl1' }), transition: () => {}, setMemory: () => {} } as any;
  identity = { reload: () => {}, buildContextInjection: () => '', updateMemory: () => {} } as any;
  cache = { purgeExpired: () => {}, getTtlForLayer: () => 1000 } as any;
  memory = { cleanup: () => {}, getHotMemories: () => [], getWarmMemories: () => [], list: () => [], consolidate: () => {}, create: () => {} } as any;
  git = { 
    stashSave: () => ({ hasChanges: false }), 
    createTaskBranch: () => ({ success: true }), 
    summarizeChanges: () => '',
    executor: { gitStatus: () => ({ clean: true }), runShell: () => ({ success: true }) },
    getBranches: () => ({ current: 'main' }),
    listTaskBranches: () => []
  } as any;
  tasks = { create: () => ({ id: 't1' }), addChain: () => {}, addSubtask: () => {}, topologicalSort: () => [], getReadyTasks: () => [] } as any;
  streaming = { pipelineStart: () => {}, pipelineEnd: () => {}, phaseStart: () => {}, phaseEnd: () => {}, atomStart: () => {}, atomEnd: () => {}, blockStart: () => {}, blockEnd: () => {}, error: () => {}, warning: () => {}, toolCall: () => {}, on: () => {} } as any;
  rollback = { createPoint: () => {}, clear: () => {}, rollbackLastAtom: () => ({ success: true }) } as any;
  chains = { create: () => ({ id: 'c1' }), updateStatus: () => {}, updateSummary: () => {}, list: () => [], get: () => null } as any;
  hooks = { run: async () => ({ block: false }), register: () => {} } as any;
  interactive = { isEnabled: () => false } as any;
  embeddingEngine = { search: async () => [] } as any;
  recall = () => [];
  syncMemory = () => {};
  processRegistry = { listRunning: () => [], listFinished: () => [], killAll: () => {} } as any;
  subAgents = { list: () => [], kill: () => {} } as any;
  commandQueue = { drainAll: async () => {} } as any;
  approvalEngine = { getAllowlist: () => [], stats: () => ({ allowed: 0, denied: 0 }) } as any;
  runSecurityScan = () => ({ summary: { critical: 0, high: 0 } });
  mediaEngine = { analyze: () => null, validate: () => ({ valid: true }) } as any;
  generateCategoryMemoryFiles = () => {};
  costTracker = { formatReport: () => '' } as any;
  scheduler = { fireEvent: () => {} } as any;
  evaluateConfidence = () => 'pass';
  buildCompactContextForChain = () => '';
  getContextWindow = () => ({ tokens: 100000 });
  evaluateContext = () => ({ isSafe: true });
  processStats = () => ({ totalSpawned: 0, running: 0, finished: 0 });
  repairChain = () => ({ healthy: true, repaired: 0, details: '' });
  forgeBridge = { notifyPipelineStart: () => {}, notifyPipelineEnd: () => {} } as any;
  cronEngine = { addJob: () => {} } as any;
}

describe('Orchestrator Robustness', () => {
  let engine: MockEngine;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    engine = new MockEngine();
    orchestrator = new Orchestrator(engine as any);
  });

  it('should block pipeline if vision phase returns empty output', async () => {
    engine.mockResults['visioner_vision'] = {
      thought: {
        id: 't_vision',
        status: 'done',
        output: '   ', // Empty/trivial output
        confidence: 0.9,
        layer: 'visioner',
        tokenCost: 100
      },
      formatValid: true
    };

    const result = await orchestrator.run('Test task');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.blockedAt, 'vision_empty');
  });

  it('should block pipeline if session token budget is exceeded', async () => {
    // Set token usage just below limit (limit is 500,000 in Orchestrator)
    engine.totalTokens = 500_001; 

    // We need to pass vision and decompose to reach the atom loop where budget check happens
    engine.mockResults['visioner_vision'] = {
      thought: { id: 't_v', status: 'done', output: 'A valid vision document that is long enough.', confidence: 1.0, layer: 'visioner' },
      formatValid: true
    };
    engine.mockResults['strategist_decompose'] = {
      thought: { id: 't_d', status: 'done', output: 'Block 1: Test', confidence: 1.0, layer: 'strategist' },
      formatValid: true,
      parsed: { blocks: ['Block 1'] }
    };
    engine.mockResults['researcher_research'] = {
      thought: { id: 't_r', status: 'done', output: 'Research results', confidence: 1.0, layer: 'researcher' },
      formatValid: true
    };
    engine.mockResults['strategist_atomize'] = {
      thought: { id: 't_a', status: 'done', output: 'Atom 1: Test', confidence: 1.0, layer: 'strategist' },
      formatValid: true,
      parsed: { atoms: ['Atom 1'] }
    };

    const result = await orchestrator.run('Test task');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.blockedAt, 'budget_exceeded');
  });

  it('should continue if atom fails but budget is still okay', async () => {
    engine.mockResults['visioner_vision'] = {
      thought: { id: 't_v', status: 'done', output: 'A valid vision document that is long enough.', confidence: 1.0, layer: 'visioner' },
      formatValid: true
    };
    engine.mockResults['strategist_decompose'] = {
      thought: { id: 't_d', status: 'done', output: 'Block 1: Test', confidence: 1.0, layer: 'strategist' },
      formatValid: true,
      parsed: { blocks: ['Block 1'] }
    };
    engine.mockResults['researcher_research'] = {
      thought: { id: 't_r', status: 'done', output: 'Research results', confidence: 1.0, layer: 'researcher' },
      formatValid: true
    };
    engine.mockResults['strategist_atomize'] = {
      thought: { id: 't_a', status: 'done', output: 'Atom 1: Test', confidence: 1.0, layer: 'strategist' },
      formatValid: true,
      parsed: { atoms: ['Atom 1'] }
    };
    
    // Worker returns "blocked"
    engine.mockResults['worker_execute'] = {
      thought: { 
        id: 't_e', 
        status: 'blocked', 
        output: 'Worker failed to follow protocol', 
        confidence: 0.5, 
        layer: 'worker',
        blockedReason: 'Worker protocol incomplete'
      },
      formatValid: true
    };

    const result = await orchestrator.run('Test task');
    // Pipeline itself succeeds if it finishes all blocks, even if some atoms failed
    assert.strictEqual(result.success, true);
  });
});
