/**
 * FOREMAN — Edit Engine
 *
 * Surgical file editing that EXCEEDS both OpenClaw and current Foreman.
 *
 * Current Foreman edit_file: exact string match, single replacement, no feedback.
 * OpenClaw edit_file: same — exact match or nothing.
 *
 * This engine adds:
 *
 * 1. MULTI-OCCURRENCE HANDLING: When oldText appears multiple times,
 *    optionally replace a specific occurrence (1st, 2nd, all).
 *    OpenClaw/Foreman: replaces only the FIRST occurrence silently.
 *    This silently corrupts files when the model targets the 2nd occurrence.
 *
 * 2. FUZZY MATCHING: When exact match fails, try normalized whitespace
 *    matching and leading-indent-insensitive matching. Shows the closest
 *    match with a diff so the LLM can correct itself.
 *    OpenClaw/Foreman: just returns "not found".
 *
 * 3. CONTEXT-ANCHORED EDITS: Edit by specifying surrounding context
 *    (lines before/after the target) for disambiguation.
 *    Neither OpenClaw nor Foreman has this.
 *
 * 4. LINE-RANGE REPLACEMENT: Replace lines N-M with new content.
 *    Useful when exact text matching is fragile (binary-ish content).
 *    Neither has this.
 *
 * 5. EDIT VALIDATION: After edit, optionally check that the result
 *    doesn't break syntax (bracket/paren/brace balance).
 *    Neither has this.
 *
 * 6. DRY RUN: Preview what would change without writing to disk.
 *    Neither has this.
 *
 * 7. EDIT HISTORY: Track what was edited, when, and by which thought.
 *    Enables undo and change analysis. Neither has this.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ─── TYPES ───────────────────────────────────────────────────

export interface EditRequest {
  /** File path (must be pre-validated by execution engine) */
  filePath: string;
  /** Exact text to find */
  oldText: string;
  /** Replacement text */
  newText: string;
  /** Which occurrence to replace: 1-indexed, or "all". Default: 1 */
  occurrence?: number | "all";
  /** Don't write — just preview the change */
  dryRun?: boolean;
  /** Context lines above oldText for disambiguation */
  contextBefore?: string;
  /** Context lines below oldText for disambiguation */
  contextAfter?: string;
  /** Thought ID for history tracking */
  thoughtId?: string;
}

export interface LineRangeEditRequest {
  filePath: string;
  startLine: number;
  endLine: number;
  newContent: string;
  dryRun?: boolean;
  thoughtId?: string;
}

export interface EditResult {
  success: boolean;
  /** What happened */
  message: string;
  /** Number of replacements made */
  replacements: number;
  /** File path */
  filePath: string;
  /** Diff preview (unified format) */
  diff?: string;
  /** Closest match if exact match failed */
  closestMatch?: ClosestMatch;
  /** Validation warnings */
  warnings: string[];
  /** Was this a dry run */
  dryRun: boolean;
}

export interface ClosestMatch {
  /** The text that was found (closest to oldText) */
  text: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Line number where it starts */
  line: number;
  /** What differs */
  hint: string;
}

export interface EditHistoryEntry {
  filePath: string;
  timestamp: string;
  thoughtId?: string;
  oldText: string;
  newText: string;
  lineStart: number;
  lineEnd: number;
}

// ─── EDIT ENGINE ─────────────────────────────────────────────

export class EditEngine {
  private history: EditHistoryEntry[] = [];

  /**
   * Surgical edit with multi-occurrence, fuzzy matching, and validation.
   */
  edit(request: EditRequest): EditResult {
    const { filePath, oldText, newText, dryRun = false } = request;
    const occurrence = request.occurrence ?? 1;
    const warnings: string[] = [];

    // Read file
    if (!existsSync(filePath)) {
      return {
        success: false, message: `File not found: ${filePath}`,
        replacements: 0, filePath, warnings, dryRun,
      };
    }
    const content = readFileSync(filePath, "utf-8");

    // Find all occurrences
    const positions = findAllOccurrences(content, oldText);

    // If exact match found
    if (positions.length > 0) {
      return this.applyExactEdit(
        content, filePath, oldText, newText, positions, occurrence, dryRun, warnings, request,
      );
    }

    // Try context-anchored matching
    if (request.contextBefore || request.contextAfter) {
      const contextResult = this.tryContextAnchoredMatch(
        content, filePath, oldText, newText, request, dryRun, warnings,
      );
      if (contextResult) return contextResult;
    }

    // Try fuzzy matching
    const fuzzyResult = findFuzzyMatch(content, oldText);
    if (fuzzyResult) {
      return {
        success: false,
        message: `Exact match not found, but a similar text was found at line ${fuzzyResult.line}`,
        replacements: 0,
        filePath,
        closestMatch: fuzzyResult,
        warnings,
        dryRun,
      };
    }

    return {
      success: false,
      message: `Text not found in ${filePath}. No similar text found either.`,
      replacements: 0,
      filePath,
      warnings,
      dryRun,
    };
  }

  /**
   * Replace lines N-M with new content.
   */
  editByLineRange(request: LineRangeEditRequest): EditResult {
    const { filePath, startLine, endLine, newContent, dryRun = false } = request;
    const warnings: string[] = [];

    if (!existsSync(filePath)) {
      return {
        success: false, message: `File not found: ${filePath}`,
        replacements: 0, filePath, warnings, dryRun,
      };
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return {
        success: false,
        message: `Invalid line range ${startLine}-${endLine} (file has ${lines.length} lines)`,
        replacements: 0, filePath, warnings, dryRun,
      };
    }

    const oldText = lines.slice(startLine - 1, endLine).join("\n");
    const newLines = [
      ...lines.slice(0, startLine - 1),
      newContent,
      ...lines.slice(endLine),
    ];
    const newFile = newLines.join("\n");
    const diff = generateDiff(oldText, newContent, startLine);

    // Validate
    const validationWarnings = validateEdit(content, newFile, filePath);
    warnings.push(...validationWarnings);

    if (!dryRun) {
      writeFileSync(filePath, newFile, "utf-8");
      this.recordHistory(filePath, oldText, newContent, startLine, endLine, request.thoughtId);
    }

    return {
      success: true,
      message: dryRun
        ? `Would replace lines ${startLine}-${endLine}`
        : `Replaced lines ${startLine}-${endLine}`,
      replacements: 1,
      filePath,
      diff,
      warnings,
      dryRun,
    };
  }

  /**
   * Get edit history for a file.
   */
  getHistory(filePath?: string): EditHistoryEntry[] {
    if (filePath) {
      return this.history.filter(e => e.filePath === filePath);
    }
    return [...this.history];
  }

  /**
   * Undo the last edit to a file.
   */
  undo(filePath: string): EditResult {
    const fileHistory = this.history.filter(e => e.filePath === filePath);
    if (fileHistory.length === 0) {
      return {
        success: false, message: `No edit history for ${filePath}`,
        replacements: 0, filePath, warnings: [], dryRun: false,
      };
    }

    const lastEdit = fileHistory[fileHistory.length - 1];

    // Apply reverse edit
    const result = this.edit({
      filePath,
      oldText: lastEdit.newText,
      newText: lastEdit.oldText,
    });

    if (result.success) {
      // Remove the undone entry AND the undo entry
      this.history = this.history.filter(e => e !== lastEdit);
      this.history.pop(); // remove the undo edit itself
    }

    return result;
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private applyExactEdit(
    content: string,
    filePath: string,
    oldText: string,
    newText: string,
    positions: number[],
    occurrence: number | "all",
    dryRun: boolean,
    warnings: string[],
    request: EditRequest,
  ): EditResult {
    // Warn about multiple occurrences
    if (positions.length > 1 && occurrence !== "all") {
      warnings.push(
        `Text found ${positions.length} times. Replacing occurrence #${occurrence}. ` +
        `Use occurrence="all" to replace all, or specify a number.`,
      );
    }

    let newContent: string;
    let replacements: number;

    if (occurrence === "all") {
      newContent = content.replaceAll(oldText, newText);
      replacements = positions.length;
    } else {
      if (occurrence > positions.length) {
        return {
          success: false,
          message: `Occurrence #${occurrence} not found (only ${positions.length} occurrences exist)`,
          replacements: 0, filePath, warnings, dryRun,
        };
      }
      newContent = replaceNthOccurrence(content, oldText, newText, occurrence);
      replacements = 1;
    }

    // Find line number for diff
    const lineNum = content.substring(0, positions[0]).split("\n").length;
    const diff = generateDiff(oldText, newText, lineNum);

    // Validate
    const validationWarnings = validateEdit(content, newContent, filePath);
    warnings.push(...validationWarnings);

    if (!dryRun) {
      writeFileSync(filePath, newContent, "utf-8");

      const endLine = lineNum + oldText.split("\n").length - 1;
      this.recordHistory(filePath, oldText, newText, lineNum, endLine, request.thoughtId);
    }

    return {
      success: true,
      message: dryRun
        ? `Would replace ${replacements} occurrence(s)`
        : `Replaced ${replacements} occurrence(s)`,
      replacements,
      filePath,
      diff,
      warnings,
      dryRun,
    };
  }

  private tryContextAnchoredMatch(
    content: string,
    filePath: string,
    oldText: string,
    newText: string,
    request: EditRequest,
    dryRun: boolean,
    warnings: string[],
  ): EditResult | null {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      // Check context before
      if (request.contextBefore) {
        const ctxLines = request.contextBefore.split("\n");
        const ctxStart = i - ctxLines.length;
        if (ctxStart < 0) continue;

        const fileCtx = lines.slice(ctxStart, i).join("\n");
        if (normalizeWhitespace(fileCtx) !== normalizeWhitespace(request.contextBefore)) {
          continue;
        }
      }

      // Check if oldText starts at line i (with whitespace normalization)
      const oldLines = oldText.split("\n");
      const candidateEnd = i + oldLines.length;
      if (candidateEnd > lines.length) continue;

      const candidate = lines.slice(i, candidateEnd).join("\n");
      if (normalizeWhitespace(candidate) !== normalizeWhitespace(oldText)) {
        continue;
      }

      // Check context after
      if (request.contextAfter) {
        const ctxLines = request.contextAfter.split("\n");
        const afterStart = candidateEnd;
        const afterEnd = afterStart + ctxLines.length;
        if (afterEnd > lines.length) continue;

        const fileCtx = lines.slice(afterStart, afterEnd).join("\n");
        if (normalizeWhitespace(fileCtx) !== normalizeWhitespace(request.contextAfter)) {
          continue;
        }
      }

      // Found via context anchoring — use the ACTUAL text from the file
      const actualOldText = candidate;
      const newContent = content.replace(actualOldText, newText);
      const diff = generateDiff(actualOldText, newText, i + 1);

      const validationWarnings = validateEdit(content, newContent, filePath);
      warnings.push(...validationWarnings);
      warnings.push("Matched via context anchoring (whitespace-normalized)");

      if (!dryRun) {
        writeFileSync(filePath, newContent, "utf-8");
        this.recordHistory(filePath, actualOldText, newText, i + 1, candidateEnd, request.thoughtId);
      }

      return {
        success: true,
        message: dryRun
          ? `Would replace via context-anchored match at line ${i + 1}`
          : `Replaced via context-anchored match at line ${i + 1}`,
        replacements: 1,
        filePath,
        diff,
        warnings,
        dryRun,
      };
    }

    return null;
  }

  private recordHistory(
    filePath: string,
    oldText: string,
    newText: string,
    lineStart: number,
    lineEnd: number,
    thoughtId?: string,
  ): void {
    this.history.push({
      filePath,
      timestamp: new Date().toISOString(),
      thoughtId,
      oldText,
      newText,
      lineStart,
      lineEnd,
    });

    // Keep last 100 edits per session
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }
}

// ─── STRING UTILITIES ────────────────────────────────────────

/**
 * Find all positions of a substring in a string.
 */
export function findAllOccurrences(content: string, search: string): number[] {
  const positions: number[] = [];
  let pos = 0;
  while (true) {
    const idx = content.indexOf(search, pos);
    if (idx === -1) break;
    positions.push(idx);
    pos = idx + 1;
  }
  return positions;
}

/**
 * Replace the Nth occurrence (1-indexed) of a substring.
 */
export function replaceNthOccurrence(
  content: string,
  search: string,
  replacement: string,
  n: number,
): string {
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = content.indexOf(search, pos);
    if (idx === -1) break;
    count++;
    if (count === n) {
      return content.substring(0, idx) + replacement + content.substring(idx + search.length);
    }
    pos = idx + 1;
  }
  return content; // should not reach here if validation passed
}

/**
 * Normalize whitespace for fuzzy comparison.
 * Collapses runs of spaces/tabs to single space, trims each line.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map(line => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .trim();
}

/**
 * Find the closest fuzzy match for a search string in content.
 *
 * Strategy:
 * 1. Normalize whitespace and compare (catches indentation differences)
 * 2. Try line-by-line sliding window matching
 */
export function findFuzzyMatch(content: string, search: string): ClosestMatch | null {
  const searchNorm = normalizeWhitespace(search);
  const searchLines = search.split("\n");
  const contentLines = content.split("\n");

  let bestScore = 0;
  let bestMatch: ClosestMatch | null = null;

  // Sliding window: try each position in the file
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const candidate = contentLines.slice(i, i + searchLines.length).join("\n");
    const candidateNorm = normalizeWhitespace(candidate);

    if (candidateNorm === searchNorm) {
      // Exact match after normalization — it's a whitespace difference
      return {
        text: candidate,
        similarity: 0.95,
        line: i + 1,
        hint: "Whitespace/indentation differs. The actual text in the file is shown above.",
      };
    }

    // Line-by-line similarity
    const score = lineByLineSimilarity(searchLines, contentLines.slice(i, i + searchLines.length));
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      const diffLines = findDifferingLines(searchLines, contentLines.slice(i, i + searchLines.length));
      bestMatch = {
        text: candidate,
        similarity: score,
        line: i + 1,
        hint: diffLines.length > 0
          ? `Lines differ: ${diffLines.join(", ")}. Check exact content at those lines.`
          : "Minor differences detected.",
      };
    }
  }

  return bestMatch;
}

/**
 * Compare two arrays of lines and return similarity (0-1).
 */
function lineByLineSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const len = Math.max(a.length, b.length);
  let matching = 0;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (normalizeWhitespace(a[i]) === normalizeWhitespace(b[i])) {
      matching++;
    }
  }

  return matching / len;
}

/**
 * Find which lines differ between two arrays.
 */
function findDifferingLines(a: string[], b: string[]): number[] {
  const diffs: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const lineA = a[i] ?? "";
    const lineB = b[i] ?? "";
    if (normalizeWhitespace(lineA) !== normalizeWhitespace(lineB)) {
      diffs.push(i + 1);
    }
  }
  return diffs;
}

// ─── VOID-STYLE TEXT SEARCH (whitespace-insensitive) ─────────

/**
 * Remove all whitespace except newlines from a string.
 * Ported from Void's findTextInFileContents helper.
 */
function removeWhitespaceExceptNewlines(s: string): string {
  return s.replace(/[^\S\n]/g, '');
}

/**
 * Count number of newlines in a string (= number of lines - 1).
 */
function numLinesOfStr(s: string): number {
  let count = 1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') count++;
  }
  return count;
}

/**
 * Find text in file contents with whitespace-insensitive fallback.
 * Returns [startLine, endLine] (1-indexed) or a status string.
 *
 * Strategy (ported from Void's editCodeService.ts):
 * 1. Try exact indexOf match first
 * 2. If not found, strip all whitespace (except newlines) and retry
 * 3. If found after stripping, verify the match is unique
 * 4. Optionally start searching from a specific line
 *
 * This is critical for LLM-generated edits where whitespace often differs.
 */
export function findTextInFileContents(
  text: string,
  fileContents: string,
  opts?: {
    startingAtLine?: number;
    canFallbackToRemoveWhitespace?: boolean;
  },
): readonly [number, number] | 'Not found' | 'Not unique' {
  const canFallbackToRemoveWhitespace = opts?.canFallbackToRemoveWhitespace ?? true;

  const returnAns = (fc: string, idx: number): readonly [number, number] => {
    const startLine = numLinesOfStr(fc.substring(0, idx));
    const numLines = numLinesOfStr(text);
    const endLine = startLine + numLines - 1;
    return [startLine, endLine] as const;
  };

  const startingAtLineIdx = (fc: string): number =>
    opts?.startingAtLine !== undefined
      ? fc.split('\n').slice(0, opts.startingAtLine).join('\n').length
      : 0;

  // 1. Try exact match
  let idx = fileContents.indexOf(text, startingAtLineIdx(fileContents));
  if (idx !== -1) {
    return returnAns(fileContents, idx);
  }

  if (!canFallbackToRemoveWhitespace) {
    return 'Not found' as const;
  }

  // 2. Try whitespace-insensitive match
  const strippedText = removeWhitespaceExceptNewlines(text);
  const strippedContents = removeWhitespaceExceptNewlines(fileContents);
  idx = strippedContents.indexOf(strippedText, startingAtLineIdx(strippedContents));

  if (idx === -1) return 'Not found' as const;

  // 3. Verify uniqueness
  const lastIdx = strippedContents.lastIndexOf(strippedText);
  if (lastIdx !== idx) return 'Not unique' as const;

  return returnAns(strippedContents, idx);
}

// ─── DIFF GENERATION ─────────────────────────────────────────

/**
 * Generate a simple unified-style diff for preview.
 */
export function generateDiff(oldText: string, newText: string, startLine: number): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const parts: string[] = [];
  parts.push(`@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`);

  for (const line of oldLines) {
    parts.push(`- ${line}`);
  }
  for (const line of newLines) {
    parts.push(`+ ${line}`);
  }

  return parts.join("\n");
}

// ─── EDIT VALIDATION ─────────────────────────────────────────

/**
 * Validate that an edit doesn't break bracket/paren/brace balance.
 *
 * This catches common LLM mistakes:
 * - Deleting an opening brace without the closing one
 * - Adding a function without proper closure
 * - Unbalanced parentheses in expressions
 */
export function validateEdit(
  oldContent: string,
  newContent: string,
  filePath: string,
): string[] {
  const warnings: string[] = [];

  // Only validate source files
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext || !["ts", "tsx", "js", "jsx", "json", "css", "scss"].includes(ext)) {
    return warnings;
  }

  const oldBalance = countBrackets(oldContent);
  const newBalance = countBrackets(newContent);

  if (newBalance.parens !== 0 && oldBalance.parens === 0) {
    warnings.push(`⚠️ Unbalanced parentheses after edit (${newBalance.parens > 0 ? "missing )" : "extra )"})`);
  }
  if (newBalance.braces !== 0 && oldBalance.braces === 0) {
    warnings.push(`⚠️ Unbalanced braces after edit (${newBalance.braces > 0 ? "missing }" : "extra }"})`);
  }
  if (newBalance.brackets !== 0 && oldBalance.brackets === 0) {
    warnings.push(`⚠️ Unbalanced brackets after edit (${newBalance.brackets > 0 ? "missing ]" : "extra ]"})`);
  }

  // Check if balance changed significantly
  const parenDelta = Math.abs(newBalance.parens - oldBalance.parens);
  const braceDelta = Math.abs(newBalance.braces - oldBalance.braces);
  const bracketDelta = Math.abs(newBalance.brackets - oldBalance.brackets);

  if (parenDelta > 2) {
    warnings.push(`⚠️ Parenthesis balance shifted by ${parenDelta} — verify the edit`);
  }
  if (braceDelta > 2) {
    warnings.push(`⚠️ Brace balance shifted by ${braceDelta} — verify the edit`);
  }
  if (bracketDelta > 2) {
    warnings.push(`⚠️ Bracket balance shifted by ${bracketDelta} — verify the edit`);
  }

  return warnings;
}

interface BracketCount {
  parens: number;   // ()
  braces: number;   // {}
  brackets: number; // []
}

function countBrackets(content: string): BracketCount {
  // Strip strings and comments to avoid counting brackets inside them
  const stripped = stripStringsAndComments(content);

  let parens = 0;
  let braces = 0;
  let brackets = 0;

  for (const char of stripped) {
    switch (char) {
      case "(": parens++; break;
      case ")": parens--; break;
      case "{": braces++; break;
      case "}": braces--; break;
      case "[": brackets++; break;
      case "]": brackets--; break;
    }
  }

  return { parens, braces, brackets };
}

/**
 * Strip string literals and comments from source code.
 * Simple but effective — handles most TypeScript/JavaScript cases.
 */
function stripStringsAndComments(code: string): string {
  let result = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const char = code[i];
    const next = i + 1 < len ? code[i + 1] : "";

    // Single-line comment
    if (char === "/" && next === "/") {
      while (i < len && code[i] !== "\n") i++;
      continue;
    }

    // Multi-line comment
    if (char === "/" && next === "*") {
      i += 2;
      while (i < len - 1 && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Template literal
    if (char === "`") {
      i++;
      while (i < len && code[i] !== "`") {
        if (code[i] === "\\") i++; // skip escaped
        i++;
      }
      i++;
      continue;
    }

    // String literals
    if (char === '"' || char === "'") {
      const quote = char;
      i++;
      while (i < len && code[i] !== quote) {
        if (code[i] === "\\") i++; // skip escaped
        i++;
      }
      i++;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}
