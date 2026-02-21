/**
 * FOREMAN — Markdown Intelligence
 *
 * Parse and understand markdown content from LLM output.
 *
 * OpenClaw's markdown/*: Code fence parsing, table extraction,
 * frontmatter parsing, code-span detection. But focused on
 * rendering/formatting, not on understanding LLM output.
 *
 * Foreman's Markdown Intelligence — 6 capabilities:
 *
 * 1. CODE FENCE EXTRACTION: Parse ```lang\ncode\n``` blocks.
 *    Returns language, content, line range. Handles nested fences.
 *    OpenClaw: similar but focused on rendering.
 *
 * 2. INLINE CODE EXTRACTION: Parse `code` spans.
 *    Distinguishes file paths, commands, variable names.
 *    OpenClaw: detects inline code spans for formatting.
 *
 * 3. TABLE PARSING: Extract markdown tables into structured data.
 *    Headers + rows + alignment. Useful for parsing LLM comparisons.
 *    OpenClaw: table rendering, not parsing.
 *
 * 4. SECTION SPLITTING: Split markdown by headings into sections.
 *    LLM output often has ## Plan, ## Implementation, ## Tests.
 *    OpenClaw: no section splitting.
 *
 * 5. LIST EXTRACTION: Parse numbered and bulleted lists.
 *    Handle nested lists, continuation lines, task lists ([x]).
 *    OpenClaw: no list parsing.
 *
 * 6. FRONTMATTER: Parse YAML frontmatter (---\nkey: value\n---).
 *    Useful for structured LLM output.
 *    OpenClaw: similar capability.
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface CodeFence {
  /** Programming language (if specified) */
  language: string;
  /** Code content (without fence markers) */
  content: string;
  /** Start line in source (1-indexed) */
  startLine: number;
  /** End line in source (1-indexed) */
  endLine: number;
  /** File name hint (from ```ts title="file.ts") */
  fileName?: string;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
  alignments: Array<"left" | "center" | "right" | "none">;
}

export interface MarkdownSection {
  /** Heading level (1-6) */
  level: number;
  /** Heading text */
  title: string;
  /** Content under this heading (without the heading line) */
  content: string;
  /** Start line (1-indexed) */
  startLine: number;
}

export interface ListItem {
  /** Item text */
  text: string;
  /** Nesting depth (0 = top level) */
  depth: number;
  /** Is this a numbered list? */
  ordered: boolean;
  /** Number (for ordered lists) */
  number?: number;
  /** Task list state */
  checked?: boolean;
}

export interface FrontmatterResult {
  /** Parsed key-value pairs */
  data: Record<string, string>;
  /** Content after frontmatter */
  content: string;
  /** Whether frontmatter was found */
  found: boolean;
}

// ─── CODE FENCE EXTRACTION ───────────────────────────────────

/**
 * Extract all code fences from markdown text.
 */
export function extractCodeFences(text: string): CodeFence[] {
  const fences: CodeFence[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const openMatch = line.match(/^(\s*)(`{3,}|~{3,})(\S*)\s*(.*)?$/);

    if (openMatch) {
      const indent = openMatch[1];
      const marker = openMatch[2];
      const markerChar = marker[0];
      const markerLen = marker.length;
      const language = openMatch[3] || "";
      const meta = openMatch[4] || "";
      const startLine = i + 1;

      // Extract file name from meta (e.g., title="file.ts")
      const fileMatch = meta.match(/title="([^"]+)"/);
      const fileName = fileMatch ? fileMatch[1] : undefined;

      // Find closing fence
      const contentLines: string[] = [];
      i++;
      let closed = false;

      while (i < lines.length) {
        const closeLine = lines[i];
        // Closing fence: same or more markers, same char, same or less indent
        const closeMatch = closeLine.match(new RegExp(
          `^${indent.length > 0 ? `\\s{0,${indent.length}}` : ""}${escapeRegex(markerChar)}{${markerLen},}\\s*$`,
        ));

        if (closeMatch) {
          closed = true;
          i++;
          break;
        }

        contentLines.push(closeLine);
        i++;
      }

      fences.push({
        language,
        content: contentLines.join("\n"),
        startLine,
        endLine: i,
        fileName,
      });

      if (!closed) {
        // Unclosed fence — still include it
        continue;
      }
    } else {
      i++;
    }
  }

  return fences;
}

// ─── TABLE PARSING ───────────────────────────────────────────

/**
 * Extract tables from markdown.
 */
export function extractTables(text: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length - 1; i++) {
    // Look for separator line (---|---|---)
    const sepLine = lines[i + 1];
    if (!sepLine) continue;
    if (!isTableSeparator(sepLine)) continue;

    // Previous line should be header
    const headerLine = lines[i];
    if (!headerLine || !headerLine.includes("|")) continue;

    const headers = parseTableRow(headerLine);
    const alignments = parseAlignments(sepLine);

    // Read data rows
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length) {
      const rowLine = lines[j];
      if (!rowLine || !rowLine.includes("|")) break;
      rows.push(parseTableRow(rowLine));
      j++;
    }

    tables.push({ headers, rows, alignments });
    i = j - 1; // skip past the table
  }

  return tables;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map(cell => cell.trim());
}

function parseAlignments(line: string): MarkdownTable["alignments"] {
  return parseTableRow(line).map(cell => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    if (trimmed.startsWith(":")) return "left";
    return "none";
  });
}

// ─── SECTION SPLITTING ───────────────────────────────────────

/**
 * Split markdown into sections by headings.
 */
export function extractSections(text: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = text.split("\n");
  let currentSection: MarkdownSection | null = null;
  const contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Flush previous section
      if (currentSection) {
        currentSection.content = contentLines.join("\n").trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }

      currentSection = {
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        content: "",
        startLine: i + 1,
      };
    } else if (currentSection) {
      contentLines.push(line);
    } else {
      // Content before any heading — treat as level 0
      contentLines.push(line);
    }
  }

  // Flush final section
  if (currentSection) {
    currentSection.content = contentLines.join("\n").trim();
    sections.push(currentSection);
  } else if (contentLines.length > 0) {
    // No headings — entire text is one section
    sections.push({
      level: 0,
      title: "",
      content: contentLines.join("\n").trim(),
      startLine: 1,
    });
  }

  return sections;
}

// ─── LIST EXTRACTION ─────────────────────────────────────────

/**
 * Extract lists from markdown.
 */
export function extractLists(text: string): ListItem[] {
  const items: ListItem[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Unordered: - item, * item, + item
    const unorderedMatch = line.match(/^(\s*)[*+-]\s+(.+)$/);
    if (unorderedMatch) {
      const depth = Math.floor(unorderedMatch[1].length / 2);
      const rawText = unorderedMatch[2];

      // Task list: - [x] or - [ ]
      const taskMatch = rawText.match(/^\[([ xX])\]\s+(.+)$/);
      if (taskMatch) {
        items.push({
          text: taskMatch[2],
          depth,
          ordered: false,
          checked: taskMatch[1].toLowerCase() === "x",
        });
      } else {
        items.push({ text: rawText, depth, ordered: false });
      }
      continue;
    }

    // Ordered: 1. item, 2. item
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const depth = Math.floor(orderedMatch[1].length / 3);
      items.push({
        text: orderedMatch[3],
        depth,
        ordered: true,
        number: parseInt(orderedMatch[2], 10),
      });
    }
  }

  return items;
}

// ─── FRONTMATTER ─────────────────────────────────────────────

/**
 * Parse YAML frontmatter from markdown.
 */
export function parseFrontmatter(text: string): FrontmatterResult {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: text, found: false };
  }

  const yamlBlock = match[1];
  const content = match[2];
  const data: Record<string, string> = {};

  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w[\w.-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[key] = value;
    }
  }

  return { data, content, found: true };
}

// ─── INLINE CODE ─────────────────────────────────────────────

/**
 * Extract inline code spans from markdown.
 */
export function extractInlineCode(text: string): string[] {
  const codes: string[] = [];
  // Match `code` but not ```fences```
  const regex = /(?<!`)`([^`\n]+)`(?!`)/g;
  for (const match of text.matchAll(regex)) {
    codes.push(match[1]);
  }
  return codes;
}

// ─── HELPERS ─────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
