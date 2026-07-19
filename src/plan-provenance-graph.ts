/**
 * FOREMAN — Plan Provenance Graph (P03-B09-A03)
 *
 * Links vision → blocks with auditable lineage edges for strategist plan provenance.
 */

import type { DecomposeParseResult } from "./parser.js";

export interface PlanProvenanceNode {
  id: string;
  kind: "vision" | "block" | "atom";
  label: string;
}

export interface PlanProvenanceEdge {
  from: string;
  to: string;
  kind: "derives" | "depends" | "lineage";
}

export interface PlanProvenanceGraph {
  version: string;
  nodes: PlanProvenanceNode[];
  edges: PlanProvenanceEdge[];
}

export interface BuildPlanProvenanceGraphInput {
  visionSummary?: string;
  decompose: DecomposeParseResult;
}

/**
 * Build auditable vision→blocks provenance graph from decompose output (P03-B09-A03).
 */
export function buildPlanProvenanceGraph(
  input: BuildPlanProvenanceGraphInput,
): PlanProvenanceGraph {
  const nodes: PlanProvenanceNode[] = [
    {
      id: "vision:0",
      kind: "vision",
      label: (input.visionSummary ?? "vision").slice(0, 120),
    },
  ];
  const edges: PlanProvenanceEdge[] = [];

  for (let i = 0; i < input.decompose.blocks.length; i++) {
    const blockId = `block:${i + 1}`;
    nodes.push({
      id: blockId,
      kind: "block",
      label: input.decompose.blocks[i].slice(0, 120),
    });
    edges.push({ from: "vision:0", to: blockId, kind: "derives" });

    for (const depIdx of input.decompose.blockDeps[i] ?? []) {
      if (depIdx >= 0 && depIdx < input.decompose.blocks.length && depIdx !== i) {
        edges.push({ from: `block:${depIdx + 1}`, to: blockId, kind: "depends" });
      }
    }
  }

  if (input.decompose.planProvenance) {
    for (let i = 0; i < input.decompose.blocks.length; i++) {
      edges.push({ from: "vision:0", to: `block:${i + 1}`, kind: "lineage" });
    }
  }

  return { version: "1.0.0", nodes, edges };
}
