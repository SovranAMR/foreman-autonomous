import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type AtomStatus = "todo" | "in_progress" | "done" | "failed";

/**
 * FOREMAN — Artifact Engine
 * Manages the generation and real-time updates of task.md, implementation_plan.md, and walkthrough.md
 * directly in the project root. This provides Antigravity-like visibility without wasting LLM tokens.
 */
export class ArtifactEngine {
  constructor(private readonly projectRoot: string) {}

  /**
   * Generates the initial implementation plan based on the Vision and Strategist's blocks.
   */
  writeImplementationPlan(goal: string, vision: string, blocks: string[]): string {
    const file = join(this.projectRoot, "implementation_plan.md");
    let content = `# Implementation Plan\n\n`;
    content += `## Goal\n${goal}\n\n`;
    content += `## Vision\n${vision}\n\n`;
    content += `## Proposed Changes (Blocks)\n`;
    
    blocks.forEach((b, i) => {
      content += `### Block ${i + 1}\n${b}\n\n`;
    });
    
    content += `## Verification Plan\nAutomated tests and manual visual inspection.\n`;
    
    writeFileSync(file, content, "utf-8");
    return file;
  }

  /**
   * Initializes the Task checklist with blocks. Atoms will be injected progressively.
   */
  initTaskMd(blocks: string[]): string {
    const file = join(this.projectRoot, "task.md");
    let content = `# Foreman Task Tracker\n\n`;
    
    blocks.forEach((b, bi) => {
      const title = b.split('\n')[0].replace(/^Block \d+:\s*/i, '').slice(0, 100);
      content += `## Block ${bi + 1}: ${title}\n`;
      content += `_Pending atomization..._\n\n`;
    });
    
    writeFileSync(file, content, "utf-8");
    return file;
  }

  /**
   * Injects the parsed atoms into the corresponding block in task.md.
   */
  addAtomsToBlock(blockIndex: number, atoms: string[]): void {
    const file = join(this.projectRoot, "task.md");
    if (!existsSync(file)) return;

    let content = readFileSync(file, "utf-8");
    const lines = content.split('\n');
    
    let targetBlockStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(new RegExp(`^## Block ${blockIndex + 1}:`))) {
            targetBlockStart = i;
            break;
        }
    }

    if (targetBlockStart !== -1) {
        let insertIndex = targetBlockStart + 1;
        
        // Find the "Pending atomization..." line
        let removedPending = false;
        let p = insertIndex;
        while (p < lines.length && !lines[p].startsWith('## Block ')) {
            if (lines[p].includes("_Pending atomization..._")) {
                lines.splice(p, 1);
                removedPending = true;
                insertIndex = p; // Insert exactly where it was
                break;
            }
            p++;
        }
        
        // If not found, just insert after header
        if (!removedPending) insertIndex = targetBlockStart + 1;

        const atomsList = atoms.map((a, ai) => {
            const singleLineAtom = a.trim().replace(/\n/g, ' ').slice(0, 150);
            return `- [ ] **Atom ${ai + 1}**: ${singleLineAtom}`;
        }).join('\n');
        
        lines.splice(insertIndex, 0, atomsList);
        writeFileSync(file, lines.join('\n'), "utf-8");
    }
  }

  /**
   * Updates the status of an atom in task.md without requiring LLM generation.
   */
  updateAtomStatus(blockIndex: number, atomIndex: number, status: AtomStatus): void {
    const file = join(this.projectRoot, "task.md");
    if (!existsSync(file)) return;

    let content = readFileSync(file, "utf-8");
    const lines = content.split('\n');
    
    let currentBlock = -1;
    let currentAtom = -1;
    let targetLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^## Block (\d+):/)) {
            const match = line.match(/^## Block (\d+):/);
            if (match) currentBlock = parseInt(match[1], 10) - 1;
            currentAtom = -1;
        } else if (line.trim().startsWith('- [') && currentBlock === blockIndex) {
            currentAtom++;
            if (currentAtom === atomIndex) {
                targetLine = i;
                break;
            }
        }
    }

    if (targetLine !== -1) {
        let checkbox = '[ ]';
        if (status === 'in_progress') checkbox = '[/]';
        else if (status === 'done') checkbox = '[x]';
        else if (status === 'failed') checkbox = '[!]';

        lines[targetLine] = lines[targetLine].replace(/- \[[^\]]+\]/, `- ${checkbox}`);
        writeFileSync(file, lines.join('\n'), "utf-8");
    }
  }

  /**
   * Generates the final walkthrough summary artifact.
   */
  writeWalkthrough(task: string, report: string): string {
    const file = join(this.projectRoot, "walkthrough.md");
    const content = `# Walkthrough\n\n## Original Task\n${task}\n\n## Final Report\n${report}\n`;
    writeFileSync(file, content, "utf-8");
    return file;
  }
}
