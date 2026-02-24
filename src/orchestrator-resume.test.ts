import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Orchestrator } from './orchestrator.js';

describe('Orchestrator Engineering - Resume & Robustness', () => {
  let engine: any;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    // Mock engine with minimal required interface
    engine = {
      config: { projectRoot: '/tmp/foreman-test' },
      state: {
        snapshot: () => ({ projectName: 'test-project', totalTokens: 0 }),
        canTransition: () => true,
        transition: () => {},
      },
      sessions: {
        start: () => ({ id: 'session-1' }),
        end: () => {},
        getActive: () => null,
        addCompletedTask: () => {},
        getRecentSummaries: () => [],
      },
      sessionManager: {
        createSession: () => ({
          addMessage: () => {},
          persist: () => {},
          getMessages: () => [],
        }),
      },
      sessionLifecycle: {
        create: () => ({ slug: 'test-slug', id: 'lifecycle-1' }),
        transition: () => {},
        setMemory: () => {},
      },
      identity: {
        reload: () => {},
        buildContextInjection: () => '',
        updateMemory: () => {},
      },
      memory: {
        cleanup: () => {},
        getHotMemories: () => [],
        getWarmMemories: () => [],
        list: () => [],
        create: () => {},
        consolidate: () => {},
      },
      cache: {
        purgeExpired: () => {},
        getTtlForLayer: () => 60000,
      },
      git: {
        stashSave: () => ({ hasChanges: false }),
        createTaskBranch: () => ({ success: true, branch: 'task-branch' }),
        summarizeChanges: () => '',
        executor: {
            gitStatus: () => ({ clean: true }),
            runShell: () => ({ success: true, stdout: '', stderr: '' }),
        }
      },
      chains: {
        create: () => ({ id: 'chain-1' }),
        updateStatus: () => {},
        updateSummary: () => {},
        get: () => ({ id: 'chain-1', thoughts: [] }),
        list: () => [],
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
        on: () => {},
      },
      hooks: {
        run: async () => ({ block: false }),
        register: () => {},
      },
      rollback: {
        createPoint: () => {},
        rollbackLastAtom: () => ({ success: true }),
        rollbackBlock: () => ({ success: true }),
        clear: () => {},
      },
      tasks: {
        create: () => ({ id: 'task-1' }),
        addChain: () => {},
        addSubtask: () => {},
        topologicalSort: () => [],
        getReadyTasks: () => [],
      },
      interactive: {
        isEnabled: () => false,
      },
      recall: () => [],
      stepWithPhase: async () => ({
        thought: {
          id: 'thought-1',
          status: 'done',
          output: 'Mock output',
          confidence: 0.9,
          layer: 'visioner',
        },
        formatValid: true,
        retryCount: 0,
      }),
      evaluateConfidence: () => 'pass',
      evaluateContext: () => ({ isSafe: true }),
      getContextWindow: () => ({ tokens: 100000 }),
      embeddingEngine: {
          search: async () => []
      },
      costTracker: {
          formatReport: () => 'Cost: $0'
      },
      cronEngine: {
          addJob: () => {}
      },
      scheduler: {
          fireEvent: () => {}
      },
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
          analyze: () => null,
          validate: () => ({ valid: true })
      },
      syncMemory: () => {},
      repairChain: () => ({ healthy: true, repaired: 0, details: '' }),
      thoughts: {
          get: () => null,
          update: () => {}
      },
      forgeBridge: {
          notifyPipelineStart: () => {},
          notifyPipelineEnd: () => {}
      },
      projectInfo: {
        name: 'test-project',
        language: 'typescript',
        languages: ['typescript'],
        frameworks: [],
        buildSystem: 'npm',
        dependencies: { prod: 0, dev: 0 },
        fileCount: 0,
        scripts: {},
        healthScore: 100,
        healthIssues: []
      }
    } as any;

    orchestrator = new Orchestrator(engine);
  });

  it('should handle resume checkpoint creation', async () => {
    // Override stepWithPhase to return blocks for decompose
    let callCount = 0;
    engine.stepWithPhase = async (_chainId: string, _input: string, layer: string) => {
        callCount++;
        if (layer === 'visioner') {
            return {
                thought: { id: 'v1', status: 'done', output: 'Vision statement with more than twenty characters.', confidence: 0.9, layer: 'visioner' },
                formatValid: true,
                retryCount: 0
            };
        }
        if (layer === 'strategist') {
            return {
                thought: { id: 's1', status: 'done', output: 'Block 1: Test\nBlock 2: Test', confidence: 0.9, layer: 'strategist' },
                formatValid: true,
                retryCount: 0,
                parsed: { blocks: ['Block 1', 'Block 2'], atoms: ['Atom 1'] }
            };
        }
        return {
            thought: { 
                id: 'w1', 
                status: 'done', 
                output: 'Worker output', 
                confidence: 0.9, 
                layer: 'worker', 
                workerProtocol: { 
                    step1_read: 'read',
                    step2_reason: 'reason',
                    step3_context: 'context',
                    step4_decide: 'decide',
                    step5_plan: 'plan',
                    step6_execute: 'execute',
                    step7_verify: 'pass',
                    step8_report: 'report'
                } 
            },
            formatValid: true,
            retryCount: 0
        };
    };

    const result = await orchestrator.run('test task');
    assert.strictEqual(result.success, true);
    // Should have created checkpoints during the run (internal state of resume engine)
    assert.ok(callCount >= 2);
  });

  it('should handle budget exhaustion', async () => {
    // Mock state to return high token count
    engine.state.snapshot = () => ({ projectName: 'test-project', totalTokens: 600000 });

    engine.stepWithPhase = async () => ({
        thought: { id: 'v1', status: 'done', output: 'Vision statement with more than twenty characters.', confidence: 0.9, layer: 'visioner' },
        formatValid: true,
        retryCount: 0
    });

    const result = await orchestrator.run('test task');
    // It should block after vision because budget is checked before atoms
    assert.strictEqual(result.blockedAt, 'budget_exceeded');
  });

  it('should handle empty vision failure', async () => {
      engine.stepWithPhase = async () => ({
          thought: { id: 'v1', status: 'done', output: 'short', confidence: 0.9, layer: 'visioner' },
          formatValid: true,
          retryCount: 0
      });

      const result = await orchestrator.run('test task');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.blockedAt, 'vision_empty');
  });
});
