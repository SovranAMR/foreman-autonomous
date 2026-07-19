/**
 * FOREMAN — Orchestrator Seam Probe Harness (P01-B09-A01)
 *
 * Static probes for orchestrator seam baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import orchestratorSeamBaseline from "./fixtures/forge-orchestrator-seam-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B08ToB09Handoff,
  getActiveEvidenceArtifactContract,
  summarizeEvidenceArtifactContractCoverage,
} from "./forge-evidence-artifact.js";
import {
  ORCHESTRATOR_FORGE_REGRESSION_METHODS,
  ORCHESTRATOR_FORGE_GUARD_METHODS,
  ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS,
  EXPECTED_ORCHESTRATOR_FORGE_GUARD_METHOD_COUNT,
  getActiveOrchestratorSeamContract,
  validateOrchestratorSeamBaseline,
  summarizeOrchestratorSeamMatrix,
  listOrchestratorSeamProbesByExpected,
  listOrchestratorSeamKnownGaps,
  FORGE_ORCHESTRATOR_SEAM_VERSION,
  ORCHESTRATOR_SEAM_CATEGORIES,
  type OrchestratorSeamBaseline,
  type OrchestratorSeamCategory,
  type OrchestratorSeamProbeResult,
} from "./forge-orchestrator-seam.js";

export type { OrchestratorSeamBaseline, OrchestratorSeamProbeResult } from "./forge-orchestrator-seam.js";
export {
  validateOrchestratorSeamBaseline,
  summarizeOrchestratorSeamMatrix,
  listOrchestratorSeamProbesByExpected,
  listOrchestratorSeamKnownGaps,
  buildDefaultOrchestratorSeamSourceEvidenceArtifact,
  getActiveOrchestratorSeamContract,
  getOrchestratorSeamCategoryContract,
  listOrchestratorSeamContractProbeIds,
  listOrchestratorSeamProbesByDisposition,
  listOrchestratorSeamContractProbesByCategory,
  summarizeOrchestratorSeamContractCoverage,
  validateOrchestratorSeamContractCoverage,
  validateOrchestratorSeamBaselineAgainstContract,
  FORGE_ORCHESTRATOR_SEAM_VERSION,
  ORCHESTRATOR_SEAM_CATEGORIES,
  ORCHESTRATOR_FORGE_REGRESSION_METHODS,
  ORCHESTRATOR_FORGE_GUARD_METHODS,
  ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS,
  EXPECTED_ORCHESTRATOR_FORGE_GUARD_METHOD_COUNT,
} from "./forge-orchestrator-seam.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): OrchestratorSeamProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function productionOrchestratorSeamSource(): string {
  return readSrc("forge-orchestrator-seam.ts") + readSrc("forge-orchestrator-seam.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionOrchestratorSeamSource());
}

function countOrchestratorMethods(methodNames: readonly string[]): number {
  const src = orchestratorSource();
  return methodNames.filter(name => new RegExp(`\\basync ${name}\\(`).test(src)).length;
}

function probeSeamVersioning(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: OrchestratorSeamBaseline,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(
        id,
        category,
        expected,
        ok,
        `version=${fixture.version}`,
        "Orchestrator seam baseline declares semver version field",
      );
    }
    case "oseam.atom_tagged": {
      const ok = fixture.atom === "P01-B09-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `atom=${fixture.atom}`,
        "Orchestrator seam baseline declares P01-B09-A01 atom id",
      );
    }
    case "oseam.harness_version_exported": {
      const ok = FORGE_ORCHESTRATOR_SEAM_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_ORCHESTRATOR_SEAM_VERSION}`,
        "FORGE_ORCHESTRATOR_SEAM_VERSION exported for orchestrator seam harness",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown seam_versioning probe");
  }
}

function probeMethodInventory(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.regression_methods_inventory": {
      const found = countOrchestratorMethods(ORCHESTRATOR_FORGE_REGRESSION_METHODS);
      const ok = found === ORCHESTRATOR_FORGE_REGRESSION_METHODS.length;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${ORCHESTRATOR_FORGE_REGRESSION_METHODS.length}`,
        "Orchestrator exposes eight verifyForge*Regression methods for sealed blocks",
      );
    }
    case "oseam.guard_methods_inventory": {
      const found = countOrchestratorMethods(ORCHESTRATOR_FORGE_GUARD_METHODS);
      const ok = found === EXPECTED_ORCHESTRATOR_FORGE_GUARD_METHOD_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${EXPECTED_ORCHESTRATOR_FORGE_GUARD_METHOD_COUNT}`,
        "Orchestrator exposes eight verifyForge*Guard methods including evidence artifact guard",
      );
    }
    case "oseam.block_gate_methods_inventory": {
      const found = countOrchestratorMethods(ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS);
      const ok = found === ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS.length;
      return probe(
        id,
        category,
        expected,
        ok,
        `found=${found}/${ORCHESTRATOR_FORGE_BLOCK_GATE_METHODS.length}`,
        "Orchestrator exposes eight verifyForge*BlockGate methods for sealed blocks",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown method_inventory probe");
  }
}

function probeLazyImportSeam(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
): OrchestratorSeamProbeResult {
  const src = orchestratorSource();
  switch (id) {
    case "oseam.dynamic_import_wiring": {
      const verifyForgeSection = src.slice(src.indexOf("verifyForgeBaselineRegression"));
      const dynamicImports = (verifyForgeSection.match(/await import\(/g) ?? []).length;
      const ok = dynamicImports >= ORCHESTRATOR_FORGE_REGRESSION_METHODS.length;
      return probe(
        id,
        category,
        expected,
        ok,
        `dynamicImports=${dynamicImports}`,
        "verifyForge methods lazy-load forge harness modules via dynamic import",
      );
    }
    case "oseam.verification_event_emit": {
      const verifySection = src.slice(src.indexOf("verifyForgeBaselineRegression"));
      const emitCount = (verifySection.match(/type: "verification"/g) ?? []).length;
      const ok = emitCount >= ORCHESTRATOR_FORGE_REGRESSION_METHODS.length;
      return probe(
        id,
        category,
        expected,
        ok,
        `verificationEvents=${emitCount}`,
        "verifyForge methods emit orchestrator verification events on completion",
      );
    }
    case "oseam.unified_lazy_import_registry": {
      const ok =
        hasProductionExport("getForgeModuleImportRegistry") ||
        hasProductionExport("resolveForgeHarnessImport");
      return probe(
        id,
        category,
        expected,
        ok,
        `registry=${ok}`,
        "Central forge module import registry routes lazy imports for all verifyForge seams",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown lazy_import_seam probe");
  }
}

function probeCompositionSeam(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
): OrchestratorSeamProbeResult {
  const src = orchestratorSource();
  switch (id) {
    case "oseam.readonly_subsystem_fields": {
      const ok =
        /\breadonly resume:/.test(src) &&
        /\breadonly observer:/.test(src) &&
        /\breadonly artifactEngine:/.test(src);
      return probe(
        id,
        category,
        expected,
        ok,
        `compositionFields=${ok}`,
        "Orchestrator exposes readonly resume, observer and artifactEngine composition fields",
      );
    }
    case "oseam.pipeline_phases_export": {
      const ok = /export const FORGE_PIPELINE_PHASES/.test(src);
      return probe(
        id,
        category,
        expected,
        ok,
        `phasesExport=${ok}`,
        "Orchestrator exports FORGE_PIPELINE_PHASES canonical phase registry",
      );
    }
    case "oseam.extracted_seam_interface": {
      const seamSrc = productionOrchestratorSeamSource() + src;
      const ok =
        /\binterface IOrchestratorForgeSeam\b/.test(seamSrc) ||
        /\binterface OrchestratorForgeSeam\b/.test(seamSrc);
      return probe(
        id,
        category,
        expected,
        ok,
        `seamInterface=${ok}`,
        "Dedicated IOrchestratorForgeSeam interface segregates forge verification from pipeline run",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown composition_seam probe");
  }
}

function probeBaselineLink(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.b08_handoff_entry": {
      const handoff = getForgeP01B08ToB09Handoff();
      const ok =
        handoff.targetBlock.blockId === "P01-B09" &&
        handoff.targetBlock.entryAtom === "P01-B09-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `entryAtom=${handoff.targetBlock.entryAtom}`,
        "FORGE_P01_B08_TO_B09_HANDOFF_V1 targets P01-B09-A01 entry atom",
      );
    }
    case "oseam.b08_sealed_probe_count": {
      const handoff = getForgeP01B08ToB09Handoff();
      const coverage = summarizeEvidenceArtifactContractCoverage(getActiveEvidenceArtifactContract());
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActiveEvidenceArtifactContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B08 handoff probeCount matches active evidence artifact contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: OrchestratorSeamBaseline,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.source_evidence_artifact_ref": {
      const ok =
        fixture.sourceEvidenceArtifact.atom === "P01-B08-A10" &&
        fixture.sourceEvidenceArtifact.probeCount === 25 &&
        fixture.sourceEvidenceArtifact.evidenceArtifactCategories === 11;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceEvidenceArtifact.atom}, probes=${fixture.sourceEvidenceArtifact.probeCount}`,
        "Baseline fixture references sealed sourceEvidenceArtifact artifacts from B08-A10",
      );
    }
    case "oseam.probe_runner_exported": {
      const ok = readSrc("forge-orchestrator-seam.probe.ts").includes(
        "export function runOrchestratorSeamProbes",
      );
      return probe(
        id,
        category,
        expected,
        ok,
        `probeRunner=${ok}`,
        "runOrchestratorSeamProbes executes contract-wired probe matrix",
      );
    }
    case "oseam.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}`,
        "Baseline fixture documents at least one measurable FAIL orchestrator seam gap",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: OrchestratorSeamBaseline,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateOrchestratorSeamBaseline(invalid).valid === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `rejectsInvalidVersion=${ok}`,
        "validateOrchestratorSeamBaseline rejects unexpected fixture version",
      );
    }
    case "oseam.min_category_probes": {
      const stripped = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const result = validateOrchestratorSeamBaseline(stripped);
      const ok = result.valid === false && result.issues.some(i => i.kind === "underflow");
      return probe(
        id,
        category,
        expected,
        ok,
        `underflowDetected=${ok}`,
        "validateOrchestratorSeamBaseline enforces per-category minimum probe counts",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.recovery_seam_state_reset": {
      const ok =
        hasProductionExport("resetOrchestratorSeamState") ||
        hasProductionExport("recoveryOrchestratorSeamReset");
      return probe(
        id,
        category,
        expected,
        ok,
        `seamReset=${ok}`,
        "Orchestrator seam harness resets verification state on pipeline recovery transition",
      );
    }
    case "oseam.recovery_missing_handoff_fallback": {
      const ok =
        hasProductionExport("loadOrchestratorSeamHandoffFallback") ||
        hasProductionExport("recoverOrchestratorSeamBaseline");
      return probe(
        id,
        category,
        expected,
        ok,
        `handoffFallback=${ok}`,
        "Recovery loader falls back when B08 handoff artifact is missing or invalid",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
): OrchestratorSeamProbeResult {
  switch (id) {
    case "oseam.nogo_seam_inventory_drift": {
      const ok =
        hasProductionExport("verifyOrchestratorSeamInventoryDrift") ||
        hasProductionExport("nogoOrchestratorSeamDriftGate");
      return probe(
        id,
        category,
        expected,
        ok,
        `inventoryDriftGate=${ok}`,
        "NO-GO gate halts eval when orchestrator forge method inventory drifts from baseline",
      );
    }
    case "oseam.nogo_verification_method_mismatch": {
      const ok =
        hasProductionExport("nogoVerificationMethodMismatch") ||
        hasProductionExport("rejectForgeVerificationMethodMismatch");
      return probe(
        id,
        category,
        expected,
        ok,
        `methodMismatchGate=${ok}`,
        "NO-GO gate rejects run when verifyForge method signatures mismatch sealed inventory",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: OrchestratorSeamCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: OrchestratorSeamBaseline,
): OrchestratorSeamProbeResult {
  switch (category) {
    case "seam_versioning":
      return probeSeamVersioning(id, category, expected, fixture);
    case "method_inventory":
      return probeMethodInventory(id, category, expected);
    case "lazy_import_seam":
      return probeLazyImportSeam(id, category, expected);
    case "composition_seam":
      return probeCompositionSeam(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadOrchestratorSeamBaseline(): OrchestratorSeamBaseline {
  return orchestratorSeamBaseline as OrchestratorSeamBaseline;
}

export function runOrchestratorSeamProbes(
  fixture: OrchestratorSeamBaseline = loadOrchestratorSeamBaseline(),
): OrchestratorSeamProbeResult[] {
  const contract = getActiveOrchestratorSeamContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
