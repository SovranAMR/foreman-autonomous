
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Orchestrator } from './orchestrator.js';
import { Engine } from './engine.js';

describe('Orchestrator Edge Cases (Robustness)', () => {
  let engine: any;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    // Minimal mock for Engine
    engine = {
      config: { projectRoot: '/tmp/foreman' },
      projectInfo: { 
        name: 'test-project', 
        language: 'typescript',
        languages: ['typescript'],
        frameworks: [],
        buildSystem: 'npm',
        isMonorepo: false,
        hasDocker: false,
        hasCI: false,
        dependencies: { prod: 0, dev: 0 },
        fileCount: 0,
        scripts: {},
        healthScore: 100,
        healthIssues: []
      },
      state: {
        snapshot: () => ({ projectName: 'test-project', totalTokens: 0 }),
        canTransition: () => true,
        transition: () => {}
      },
      sessions: {
        start: () => ({ id: 's1' }),
        end: () => {},
        getActive: () => ({ id: 's1' }),
        addCompletedTask: () => {},
        getRecentSummaries: () => []
      },
      sessionLifecycle: {
        create: () => ({ slug: 'test-slug', id: 'sl1' }),
        transition: () => {},
        setMemory: () => {},
        memory: new Map()
      },
      identity: {
        reload: () => {},
        buildContextInjection: () => '',
        updateMemory: () => {}
      },
      memory: {
        cleanup: () => {},
        getHotMemories: () => [],
        getWarmMemories: () => [],
        create: () => {},
        list: () => [],
        consolidate: () => {},
        listRecent: () => []
      },
      cache: {
        purgeExpired: () => {},
        getTtlForLayer: () => 60000
      },
      git: {
        stashSave: () => ({ hasChanges: false }),
        createTaskBranch: () => ({ success: true, branch: 'task-branch' }),
        executor: {
          gitStatus: () => ({ clean: true }),
          runShell: () => ({ success: true, stdout: '', stderr: '' })
        },
        summarizeChanges: () => ''
      },
      hooks: {
        run: async () => ({ block: false }),
        register: () => () => {}
      },
      rollback: {
        createPoint: () => {},
        rollbackLastAtom: () => ({ success: true }),
        rollbackBlock: () => ({ success: true }),
        clear: () => {}
      },
      streaming: {
        pipelineStart: () => {},
        pipelineEnd: () => {},
        phaseStart: () => {},
        phaseEnd: () => {},
        warning: () => {},
        error: () => {},
        blockStart: () => {},
        blockEnd: () => {},
        atomStart: () => {},
        atomEnd: () => {},
        toolCall: () => {},
        on: () => {}
      },
      chains: {
        create: () => ({ id: 'c1' }),
        updateStatus: () => {},
        updateSummary: () => {},
        list: () => [],
        get: () => ({ id: 'c1', thoughts: [] })
      },
      tasks: {
        create: () => ({ id: 't1' }),
        addChain: () => {},
        addSubtask: () => {},
        topologicalSort: () => [],
        getReadyTasks: () => []
      },
      interactive: {
        isEnabled: () => false
      },
      embeddingEngine: {
        search: async () => []
      },
      recall: () => [],
      getContextWindow: () => ({ tokens: 128000 }),
      evaluateContext: () => ({ isSafe: true }),
      evaluateConfidence: () => 'pass',
      stepWithPhase: async () => ({
        thought: { id: 'th1', status: 'done', output: 'test output', layer: 'visioner', confidence: 0.9 },
        formatValid: true,
        retryCount: 0
      }),
      repairChain: () => ({ healthy: true, repaired: 0, details: '' }),
      syncMemory: () => {},
      processRegistry: {
        listRunning: () => [],
        listFinished: () => [],
        killAll: () => {}
      },
      subAgents: {
        list: () => [],
        kill: () => {}
      },
      commandQueue: {
        drainAll: async () => {}
      },
      approvalEngine: {
        getAllowlist: () => [],
        stats: () => ({ allowed: 0, denied: 0 })
      },
      runSecurityScan: () => ({ summary: { critical: 0, high: 0 } }),
      mediaEngine: {
        analyze: () => null
      },
      costTracker: {
        formatReport: () => 'Cost: $0.00'
      },
      scheduler: {
        fireEvent: () => {}
      },
      cronEngine: {
        addJob: () => {}
      },
      forgeBridge: {
        notifyPipelineStart: () => {},
        notifyPipelineEnd: () => {}
      },
      thoughts: {
        get: () => null,
        update: () => {}
      },
      browser: {
        checkAvailability: () => false
      }
    };

    orchestrator = new Orchestrator(engine as any);
  });

  it('should handle session budget exceeded correctly', async () => {
    // Mock session budget exceeded
    let budgetCallCount = 0;
    engine.state.snapshot = () => {
      budgetCallCount++;
      return { 
        projectName: 'test-project', 
        totalTokens: budgetCallCount > 5 ? 1000000 : 0 // Exceed 500k limit after some calls
      };
    };

    // We need to make it reach the atom loop
    engine.stepWithPhase = async (cid: string, input: string, layer: string) => {
      if (layer === 'visioner') return { thought: { id: 'v1', status: 'done', output: 'Detailed vision document with enough length', layer: 'visioner', confidence: 0.9 }, formatValid: true };
      if (layer === 'strategist' && input.includes('blocks')) return { thought: { id: 'd1', status: 'done', output: 'Block 1: Test', layer: 'strategist', confidence: 0.9 }, formatValid: true, parsed: { blocks: ['Block 1'] } };
      if (layer === 'researcher') return { thought: { id: 'r1', status: 'done', output: 'Findings', layer: 'researcher', confidence: 0.9 }, formatValid: true };
      if (layer === 'strategist' && input.includes('atomic tasks')) return { thought: { id: 'a1', status: 'done', output: 'Atom 1: Test', layer: 'strategist', confidence: 0.9 }, formatValid: true, parsed: { atoms: ['Atom 1'] } };
      return { thought: { id: 'th', status: 'done', output: 'done', layer: 'worker', confidence: 0.9 }, formatValid: true };
    };

    const result = await orchestrator.run('test task');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.blockedAt, 'budget_exceeded');
  });

  it('should handle vision rejection/empty output correctly', async () => {
    // Mock empty vision output
    engine.stepWithPhase = async () => ({
      thought: { id: 'v1', status: 'done', output: 'short', layer: 'visioner', confidence: 0.9 },
      formatValid: true
    });

    const result = await orchestrator.run('test task');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.blockedAt, 'vision_empty');
  });

  it('should handle decompose failure (no blocks) correctly', async () => {
    engine.stepWithPhase = async (cid: string, input: string, layer: string) => {
      if (layer === 'visioner') return { thought: { id: 'v1', status: 'done', output: 'Detailed vision document with enough length', layer: 'visioner', confidence: 0.9 }, formatValid: true };
      if (layer === 'strategist') return { thought: { id: 'd1', status: 'done', output: 'No blocks here', layer: 'strategist', confidence: 0.9 }, formatValid: true, parsed: { blocks: [] } };
      return { thought: { id: 'th', status: 'done', output: 'done', layer: 'worker', confidence: 0.9 }, formatValid: true };
    };

    const result = await orchestrator.run('test task');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.blockedAt, 'decompose');
  });

  it('should handle context window pressure with compaction', async () => {
    // Mock context window pressure
    engine.evaluateContext = () => ({ isSafe: false });
    
    // Track if compact was called (we check it via side effect in the orchestrator if we can)
    // Here we just ensure it doesn't crash
    
    engine.stepWithPhase = async (cid: string, input: string, layer: string) => {
        if (layer === 'visioner') return { thought: { id: 'v1', status: 'done', output: 'Detailed vision document with enough length', layer: 'visioner', confidence: 0.9 }, formatValid: true };
        if (layer === 'strategist' && input.includes('blocks')) return { thought: { id: 'd1', status: 'done', output: 'Block 1: Test', layer: 'strategist', confidence: 0.9 }, formatValid: true, parsed: { blocks: ['Block 1'] } };
        if (layer === 'researcher') return { thought: { id: 'r1', status: 'done', output: 'Findings', layer: 'researcher', confidence: 0.9 }, formatValid: true };
        if (layer === 'strategist' && input.includes('atomic tasks')) return { thought: { id: 'a1', status: 'done', output: 'Atom 1: Test', layer: 'strategist', confidence: 0.9 }, formatValid: true, parsed: { atoms: ['Atom 1'] } };
        // Break after first atom to finish test
        budgetCallCount = 100; 
        return { thought: { id: 'th', status: 'done', output: 'done', layer: 'worker', confidence: 0.9 }, formatValid: true };
    };

    let budgetCallCount = 0;
    engine.state.snapshot = () => {
        budgetCallCount++;
        return { projectName: 'test-project', totalTokens: budgetCallCount > 10 ? 1000000 : 0 };
    };

    await orchestrator.run('test task');
    // Success or failure doesn't matter here, we want to see it run through the logic
  });
});
