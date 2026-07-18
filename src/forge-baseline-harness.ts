/**
 * FOREMAN — Forge Pipeline Baseline Harness
 *
 * Testability seam for P01-B01-A01. Probes current Forge path behavior
 * without changing production orchestration logic.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { StateManager, InvalidTransitionError, MissingReasonError } from "./state.js";
import { TOOL_DEFINITIONS, createEngineToolExecutor } from "./tools.js";
import type { ToolCall } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";
import { EditEngine } from "./edit-engine.js";
import { GitEngine } from "./git-engine.js";
import { LinkIntelligence } from "./link-intelligence.js";
import { HooksEngine } from "./hooks-engine.js";
import {
  parseBuildOutput,
  parseTestOutput,
  detectRegressions,
} from "./verification-engine.js";
import { quickReviewCheck, classifyReviewerLlmResponse, parseReviewResponse } from "./reviewer-gate.js";
import type { WorkerProtocol } from "./types.js";
import { RollbackEngine } from "./rollback-engine.js";
import { PipelineResumeEngine } from "./pipeline-resume.js";
import { Orchestrator } from "./orchestrator.js";
import baselineFixture from "./fixtures/forge-baseline-v1.json" with { type: "json" };
import {
  getActiveForgeBaselineContract,
  validateFixtureAgainstContract,
  buildProbeEvidence,
  buildProbeTelemetry,
  buildBaselineProvenance,
  buildBaselineRunRecord,
  detectBaselineProbeRegression,
  validateBaselineRunRecord,
  type BaselineOutcome,
  type BaselinePath,
  type BaselineProbeRegressionReport,
  type ForgeBaselineFixture,
  type ForgeBaselineRunRecord,
  type ForgeProbeDisposition,
} from "./forge-baseline-contract.js";

export type { BaselineOutcome, BaselinePath, ForgeBaselineFixture, ForgeBaselineRunRecord } from "./forge-baseline-contract.js";
export {
  getActiveForgeBaselineContract,
  validateFixtureAgainstContract,
  validateBaselineRunRecord,
  detectBaselineProbeRegression,
} from "./forge-baseline-contract.js";

export type { BaselineProbeRegressionReport } from "./forge-baseline-contract.js";

export interface ForgeBaselineRegressionResult {
  passed: boolean;
  record: ForgeBaselineRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: BaselineProbeRegressionReport | null;
  detail: string;
}

export interface BaselineProbeResult {
  id: string;
  path: BaselinePath;
  expected: BaselineOutcome;
  actual: BaselineOutcome;
  detail: string;
  aligned: boolean;
  criterion?: string;
}

const GOOD_PROTOCOL: WorkerProtocol = {
  step1_read: "Read HeroSection.tsx: 350 lines, SVG path at line 180, GSAP timeline at line 75",
  step2_context: "SVG inside motion.div z-index:-10, GSAP timeline has 3 tweens, path 'smileArc'",
  step3_impact: "Adding strokeDasharray won't affect fill (none). No other animations target this path.",
  step4_decide: "Line 182: add strokeDasharray='500' strokeDashoffset='500'. Line 80: GSAP tween at 0.3",
  step5_predict: "Smile arc draws left-to-right over 1.8s, starting 0.3s after bloom",
  step6_execute: "Added strokeDasharray and strokeDashoffset to SVG path, GSAP tween added to timeline",
  step7_verify: "Build passed ✔, 12 tests pass, visual check shows arc drawing correctly",
  step8_report: "SVG draw-on animation working. No unexpected side effects found.",
};

const VISION_DOC = `## Vision
**EMOTION TARGET**: Quiet luxury
**FOCAL POINT**: Single smile arc
**COLOR PHILOSOPHY**: Gold + dark, max 3 colors
**MOTION BUDGET**: 2 animations max
**FORBIDDEN LIST**:
- Particle rain
- Blur spam
- Hover effects on mobile
- More than 3 colors`;

function outcome(ok: boolean): BaselineOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  path: BaselinePath,
  expected: BaselineOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): BaselineProbeResult {
  const actual = outcome(ok);
  return {
    id,
    path,
    expected,
    actual,
    detail,
    aligned: actual === expected,
    criterion,
  };
}

function probeState(id: string, expected: BaselineOutcome): BaselineProbeResult {
  const root = mkdtempSync(join(tmpdir(), "forge-baseline-state-"));
  try {
    const sm = StateManager.create(root, "baseline-state", false);

    switch (id) {
      case "state.valid_pipeline_chain": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("verifying", "execution done");
        sm.transition("complete", "all verified");
        return probe(id, "state", expected, sm.current() === "complete", `final=${sm.current()}`);
      }
      case "state.rejects_skip_to_executing": {
        let rejected = false;
        try {
          sm.transition("executing", "skip everything");
        } catch (err) {
          rejected = err instanceof InvalidTransitionError;
        }
        return probe(
          id,
          "state",
          expected,
          rejected && sm.current() === "idle",
          `rejected=${rejected}, state=${sm.current()}`,
        );
      }
      case "state.rejects_empty_reason": {
        let rejected = false;
        try {
          sm.transition("visioning", "");
        } catch (err) {
          rejected = err instanceof MissingReasonError;
        }
        return probe(id, "state", expected, rejected, `rejected=${rejected}`);
      }
      case "state.blocked_from_executing": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        return probe(
          id,
          "state",
          expected,
          sm.current() === "blocked",
          `state=${sm.current()}`,
        );
      }
      case "state.recover_from_blocked": {
        sm.transition("visioning", "start");
        sm.transition("decomposing", "vision done");
        sm.transition("executing", "atoms ready");
        sm.transition("blocked", "worker blocked");
        sm.transition("decomposing", "replan after block");
        return probe(
          id,
          "state",
          expected,
          sm.current() === "decomposing",
          `state=${sm.current()}`,
        );
      }
      default:
        return probe(id, "state", expected, false, "unknown probe id");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function probeTool(id: string, expected: BaselineOutcome): Promise<BaselineProbeResult> {
  const root = mkdtempSync(join(tmpdir(), "forge-baseline-tool-"));
  try {
    switch (id) {
      case "tool.definitions_registered": {
        const names = new Set(TOOL_DEFINITIONS.map(t => t.name));
        const ok = names.has("bash") && names.has("read_file") && names.has("edit_file") && TOOL_DEFINITIONS.length >= 40;
        return probe(id, "tool", expected, ok, `count=${TOOL_DEFINITIONS.length}`);
      }
      case "tool.unknown_tool_errors": {
        const exec = new ExecutionEngine(root);
        const edit = new EditEngine(root);
        const git = new GitEngine(root);
        const links = new LinkIntelligence(root);
        const execute = createEngineToolExecutor(root, exec, edit, git, links);
        const result = await execute({ name: "not_a_real_tool", args: {} });
        const ok = result.isError === true && result.content.includes("Unknown tool");
        return probe(id, "tool", expected, ok, result.content);
      }
      case "tool.hooks_can_block": {
        const exec = new ExecutionEngine(root);
        const edit = new EditEngine(root);
        const git = new GitEngine(root);
        const links = new LinkIntelligence(root);
        const hooks = new HooksEngine();
        hooks.register("before_tool_call", () => ({ block: true, blockReason: "blocked for baseline" }));
        const execute = createEngineToolExecutor(root, exec, edit, git, links, hooks);
        const result = await execute({ name: "read_file", args: { path: "package.json" } });
        const ok = result.isError === true && result.content.includes("blocked");
        return probe(id, "tool", expected, ok, result.content);
      }
      default:
        return probe(id, "tool", expected, false, "unknown probe id");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function probeVerification(id: string, expected: BaselineOutcome): BaselineProbeResult {
  switch (id) {
    case "verification.parse_build_success": {
      const result = parseBuildOutput("vite v5.0.0 building for production...\n✓ built in 1.2s");
      return probe(id, "verification", expected, result.success, result.summary);
    }
    case "verification.parse_build_errors": {
      const result = parseBuildOutput(
        "src/app.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      );
      return probe(
        id,
        "verification",
        expected,
        !result.success && result.errors.length === 1 && result.errors[0]?.file === "src/app.ts",
        result.summary,
      );
    }
    case "verification.parse_test_output": {
      const result = parseTestOutput(
        "✔ adds numbers (1.2ms)\n✖ rejects bad input\nℹ tests 2\nℹ pass 1\nℹ fail 1",
      );
      return probe(
        id,
        "verification",
        expected,
        result.total === 2 && result.passed === 1 && result.failed === 1,
        `total=${result.total}, passed=${result.passed}, failed=${result.failed}`,
      );
    }
    case "verification.detect_regressions": {
      const previous = parseTestOutput("✔ stable test\nℹ tests 1\nℹ pass 1\nℹ fail 0");
      const current = parseTestOutput("✖ stable test\nℹ tests 1\nℹ pass 0\nℹ fail 1");
      const report = detectRegressions(previous, current);
      return probe(
        id,
        "verification",
        expected,
        report.hasRegression && report.regressions.includes("stable test"),
        report.summary,
      );
    }
    default:
      return probe(id, "verification", expected, false, "unknown probe id");
  }
}

function probeReviewer(id: string, expected: BaselineOutcome): BaselineProbeResult {
  switch (id) {
    case "reviewer.good_protocol_passes": {
      const result = quickReviewCheck(GOOD_PROTOCOL, VISION_DOC);
      return probe(id, "reviewer", expected, result === null, result ? result.verdict : "null");
    }
    case "reviewer.trivial_verify_rejected": {
      const result = quickReviewCheck({ ...GOOD_PROTOCOL, step7_verify: "Looks good" }, VISION_DOC);
      return probe(
        id,
        "reviewer",
        expected,
        result !== null && result.verdict === "REJECT",
        result?.verdict ?? "null",
      );
    }
    case "reviewer.forbidden_violation_rejected": {
      const result = quickReviewCheck(
        {
          ...GOOD_PROTOCOL,
          step6_execute: "Added particle rain effect with 500 floating dots and blur background",
        },
        VISION_DOC,
      );
      return probe(
        id,
        "reviewer",
        expected,
        result !== null && result.verdict === "REJECT",
        result?.verdict ?? "null",
      );
    }
    case "reviewer.empty_llm_response_passes": {
      const empty = classifyReviewerLlmResponse("");
      const whitespace = classifyReviewerLlmResponse("   \n  ");
      const ok = !empty.sufficient && !whitespace.sufficient;
      return probe(
        id,
        "reviewer",
        expected,
        ok,
        `emptySufficient=${empty.sufficient}, whitespaceSufficient=${whitespace.sufficient}`,
      );
    }
    case "reviewer.nogo_reject_verdict": {
      const result = parseReviewResponse(
        "VERDICT: REJECT\nREASONING: Vision violation detected\nVIOLATIONS: particle rain\nSUGGESTIONS: Remove particles\nCONFIDENCE: 0.95",
      );
      const ok = result.verdict === "REJECT" && result.rejectionFeedback !== undefined;
      return probe(id, "reviewer", expected, ok, `verdict=${result.verdict}`);
    }
    case "reviewer.nogo_needs_revision": {
      const result = parseReviewResponse(
        "VERDICT: NEEDS_REVISION\nREASONING: Almost correct\nVIOLATIONS: None\nSUGGESTIONS: Strengthen verify step\nCONFIDENCE: 0.7",
      );
      const ok = result.verdict === "NEEDS_REVISION" && result.rejectionFeedback !== undefined;
      return probe(id, "reviewer", expected, ok, `verdict=${result.verdict}`);
    }
    default:
      return probe(id, "reviewer", expected, false, "unknown probe id");
  }
}

async function probeRollback(id: string, expected: BaselineOutcome): Promise<BaselineProbeResult> {
  const root = mkdtempSync(join(tmpdir(), "forge-baseline-rollback-"));
  try {
    const engine = new RollbackEngine(root);

    switch (id) {
      case "rollback.point_without_git": {
        const point = engine.createPoint("pipeline", "baseline probe");
        const ok = point === null && !engine.isGitRepository();
        return probe(id, "rollback", expected, ok, `point=${point ? "created" : "null"}, isGit=${engine.isGitRepository()}`);
      }
      case "rollback.history_tracks_attempts": {
        const history = engine.getHistory();
        return probe(
          id,
          "rollback",
          expected,
          Array.isArray(history.rollbacks),
          `entries=${history.rollbacks.length}`,
        );
      }
      case "rollback.orchestrator_calls_create_point": {
        let called = false;
        const mockEngine = buildMinimalOrchestratorEngine(root, {
          onCreatePoint: () => {
            called = true;
          },
        });
        const orchestrator = new Orchestrator(mockEngine);
        await orchestrator.run("rollback baseline probe");
        return probe(id, "rollback", expected, called, `createPointCalled=${called}`);
      }
      case "rollback.unknown_point_fails": {
        const result = engine.rollback("rb_nonexistent_id");
        const ok = result.success === false && typeof result.error === "string" && result.error.length > 0;
        return probe(id, "rollback", expected, ok, `success=${result.success}, error=${result.error ?? "none"}`);
      }
      case "rollback.last_atom_no_points": {
        const result = engine.rollbackLastAtom();
        return probe(id, "rollback", expected, result === null, `result=${result === null ? "null" : "object"}`);
      }
      default:
        return probe(id, "rollback", expected, false, "unknown probe id");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function probeResume(id: string, expected: BaselineOutcome): Promise<BaselineProbeResult> {
  const root = mkdtempSync(join(tmpdir(), "forge-baseline-resume-"));
  try {
    switch (id) {
      case "resume.checkpoint_roundtrip": {
        const resume = new PipelineResumeEngine(root);
        const cp = resume.createCheckpoint("baseline task", "chain-1");
        resume.updatePhase("decompose", { visionOutput: "vision", blocks: ["Block 1"] });
        const loaded = resume.loadCheckpoint();
        const ok = loaded !== null && loaded.task === cp.task && loaded.phase === "decompose";
        return probe(id, "resume", expected, ok, `phase=${loaded?.phase ?? "null"}`);
      }
      case "resume.atom_completion_tracking": {
        const resume = new PipelineResumeEngine(root);
        resume.createCheckpoint("baseline task", "chain-1");
        resume.completeAtom(0, 1, 1, 10);
        const ok = resume.isAtomCompleted(0, 1) && !resume.isAtomCompleted(0, 2);
        return probe(id, "resume", expected, ok, `completed=${resume.isAtomCompleted(0, 1)}`);
      }
      case "resume.missing_checkpoint_starts_fresh": {
        const mockEngine = buildMinimalOrchestratorEngine(root);
        const orchestrator = new Orchestrator(mockEngine);
        const result = await orchestrator.run("fresh resume probe", { resume: true });
        const ok = result.success === true && result.resumed !== true;
        return probe(
          id,
          "resume",
          expected,
          ok,
          `success=${result.success}, resumed=${result.resumed ?? false}`,
        );
      }
      case "resume.corrupt_checkpoint_returns_null": {
        const resume = new PipelineResumeEngine(root);
        const cpPath = join(root, ".foreman", "pipeline-checkpoint.json");
        mkdirSync(dirname(cpPath), { recursive: true });
        writeFileSync(cpPath, "{ not valid json", "utf-8");
        const loaded = resume.loadCheckpoint();
        return probe(id, "resume", expected, loaded === null, `loaded=${loaded === null ? "null" : "object"}`);
      }
      default:
        return probe(id, "resume", expected, false, "unknown probe id");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function buildMinimalOrchestratorEngine(
  projectRoot: string,
  hooks?: { onCreatePoint?: () => void },
): any {
  let createPointCalled = false;
  return {
    config: { projectRoot },
    state: {
      snapshot: () => ({ projectName: "baseline", totalTokens: 0 }),
      canTransition: () => true,
      transition: () => {},
    },
    sessions: {
      start: () => ({ id: "session-1" }),
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
      create: () => ({ slug: "baseline", id: "lifecycle-1" }),
      transition: () => {},
      setMemory: () => {},
    },
    identity: {
      reload: () => {},
      buildContextInjection: () => "",
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
      createTaskBranch: () => ({ success: true, branch: "task-branch" }),
      summarizeChanges: () => "",
      executor: {
        gitStatus: () => ({ clean: true }),
        runShell: () => ({ success: true, stdout: "", stderr: "" }),
      },
    },
    chains: {
      create: () => ({ id: "chain-1" }),
      updateStatus: () => {},
      updateSummary: () => {},
      get: () => ({ id: "chain-1", thoughts: [] }),
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
      createPoint: () => {
        createPointCalled = true;
        hooks?.onCreatePoint?.();
        return { success: true };
      },
      rollbackLastAtom: () => ({ success: true }),
      rollbackBlock: () => ({ success: true }),
      clear: () => {},
    },
    tasks: {
      create: () => ({ id: "task-1" }),
      addChain: () => {},
      addSubtask: () => {},
      topologicalSort: () => [],
      getReadyTasks: () => [],
    },
    interactive: {
      isEnabled: () => false,
    },
    recall: () => [],
    stepWithPhase: async (_chainId: string, _input: string, layer: string) => {
      if (layer === "visioner") {
        return {
          thought: {
            id: "v1",
            status: "done",
            output: "Vision statement with more than twenty characters for baseline.",
            confidence: 0.9,
            layer: "visioner",
          },
          formatValid: true,
          retryCount: 0,
        };
      }
      if (layer === "strategist") {
        return {
          thought: {
            id: "s1",
            status: "done",
            output: "Block 1: Baseline block",
            confidence: 0.9,
            layer: "strategist",
          },
          formatValid: true,
          retryCount: 0,
          parsed: { blocks: ["Block 1"], atoms: ["Atom 1"] },
        };
      }
      return {
        thought: {
          id: "w1",
          status: "done",
          output: "Worker output",
          confidence: 0.9,
          layer: "worker",
          workerProtocol: GOOD_PROTOCOL,
        },
        formatValid: true,
        retryCount: 0,
      };
    },
    evaluateConfidence: () => "pass",
    evaluateContext: () => ({ isSafe: true }),
    getContextWindow: () => ({ tokens: 100000 }),
    embeddingEngine: { search: async () => [] },
    costTracker: { formatReport: () => "Cost: $0" },
    cronEngine: { addJob: () => {} },
    scheduler: { fireEvent: () => {} },
    processRegistry: {
      listRunning: () => [],
      listFinished: () => [],
      killAll: () => {},
    },
    subAgents: {
      list: () => [],
      kill: () => {},
    },
    commandQueue: {
      drainAll: async () => {},
    },
    approvalEngine: {
      getAllowlist: () => [],
      stats: () => ({ allowed: 0, denied: 0 }),
    },
    runSecurityScan: () => ({ summary: { critical: 0, high: 0 } }),
    mediaEngine: {
      analyze: () => null,
      validate: () => ({ valid: true }),
    },
    syncMemory: () => {},
    repairChain: () => ({ healthy: true, repaired: 0, details: "" }),
    thoughts: {
      get: () => null,
      update: () => {},
    },
    forgeBridge: {
      notifyPipelineStart: () => {},
      notifyPipelineEnd: () => {},
    },
    projectInfo: {
      name: "baseline",
      language: "typescript",
      languages: ["typescript"],
      frameworks: [],
      buildSystem: "npm",
      dependencies: { prod: 0, dev: 0 },
      fileCount: 0,
      scripts: {},
      healthScore: 100,
      healthIssues: [],
    },
    get createPointCalled() {
      return createPointCalled;
    },
  };
}

async function runProbe(
  entry: { id: string; expected: BaselineOutcome },
  path: BaselinePath,
): Promise<BaselineProbeResult> {
  const contractProbe = getActiveForgeBaselineContract().paths[path].probes.find(p => p.id === entry.id);
  const criterion = contractProbe?.criterion;

  let result: BaselineProbeResult;
  switch (path) {
    case "state":
      result = probeState(entry.id, entry.expected);
      break;
    case "tool":
      result = await probeTool(entry.id, entry.expected);
      break;
    case "verification":
      result = probeVerification(entry.id, entry.expected);
      break;
    case "reviewer":
      result = probeReviewer(entry.id, entry.expected);
      break;
    case "rollback":
      result = await probeRollback(entry.id, entry.expected);
      break;
    case "resume":
      result = await probeResume(entry.id, entry.expected);
      break;
    default:
      result = probe(entry.id, path, entry.expected, false, "unknown path");
  }

  return { ...result, criterion };
}

export function loadForgeBaselineFixture(): ForgeBaselineFixture {
  const fixture = baselineFixture as ForgeBaselineFixture;
  const validation = validateFixtureAgainstContract(fixture);
  if (!validation.valid) {
    const detail = validation.issues.map(i => `${i.probeId ?? i.path}: ${i.detail}`).join("; ");
    throw new Error(`Forge baseline fixture violates typed contract: ${detail}`);
  }
  return fixture;
}

async function runProbeWithTiming(
  entry: { id: string; expected: BaselineOutcome },
  path: BaselinePath,
  sequenceIndex: number,
): Promise<{ result: BaselineProbeResult; durationMs: number; sequenceIndex: number }> {
  const start = performance.now();
  const result = await runProbe(entry, path);
  const durationMs = performance.now() - start;
  return { result, durationMs, sequenceIndex };
}

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export async function runForgeBaselineProbesWithRecord(): Promise<ForgeBaselineRunRecord> {
  const fixture = loadForgeBaselineFixture();
  const contract = getActiveForgeBaselineContract();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const path of Object.keys(fixture.paths) as BaselinePath[]) {
    for (const entry of fixture.paths[path]) {
      const { result, durationMs } = await runProbeWithTiming(entry, path, sequenceIndex);
      const contractProbe = contract.paths[path].probes.find(p => p.id === entry.id);
      const disposition: ForgeProbeDisposition = contractProbe?.disposition ?? "happy";
      const criterion = contractProbe?.criterion ?? result.criterion ?? "";

      evidence.push(
        buildProbeEvidence(
          result.id,
          result.path,
          result.expected,
          result.actual,
          result.aligned,
          criterion,
          result.detail,
          disposition,
        ),
      );
      telemetry.push(buildProbeTelemetry(result.id, result.path, sequenceIndex, durationMs));
      sequenceIndex++;
    }
  }

  const completedAt = new Date().toISOString();
  const provenance = buildBaselineProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    resolveGitCommit(),
  );

  return buildBaselineRunRecord(provenance, evidence, telemetry);
}

export async function runForgeBaselineProbes(): Promise<BaselineProbeResult[]> {
  const fixture = loadForgeBaselineFixture();
  const results: BaselineProbeResult[] = [];

  for (const path of Object.keys(fixture.paths) as BaselinePath[]) {
    for (const entry of fixture.paths[path]) {
      results.push(await runProbe(entry, path));
    }
  }

  return results;
}

/**
 * Execute baseline probes, validate run record, and optionally detect regression vs prior run.
 * Forge pipeline integration gate (P01-B01-A08).
 */
export async function runForgeBaselineRegressionGate(
  priorRecord?: ForgeBaselineRunRecord,
): Promise<ForgeBaselineRegressionResult> {
  const record = await runForgeBaselineProbesWithRecord();
  const validation = validateBaselineRunRecord(record);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord ? detectBaselineProbeRegression(priorRecord, record) : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const passed = recordValid && !alignmentRegression;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  if (!recordValid) detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);

  return {
    passed,
    record,
    recordValid,
    validationIssues,
    probeRegression,
    detail: detailParts.join(" | "),
  };
}

export function summarizeBaselineMatrix(results: BaselineProbeResult[]): {
  total: number;
  aligned: number;
  mismatches: BaselineProbeResult[];
  byPath: Record<BaselinePath, { pass: number; fail: number; expectedFail: number }>;
} {
  const byPath = {} as Record<BaselinePath, { pass: number; fail: number; expectedFail: number }>;
  const mismatches = results.filter(r => !r.aligned);

  for (const result of results) {
    if (!byPath[result.path]) {
      byPath[result.path] = { pass: 0, fail: 0, expectedFail: 0 };
    }
    if (result.actual === "PASS") byPath[result.path].pass++;
    else byPath[result.path].fail++;
    if (result.expected === "FAIL") byPath[result.path].expectedFail++;
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    byPath,
  };
}
