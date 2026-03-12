/**
 * FOREMAN — Code Extraction Engine
 *
 * Ported from Void (VS Code fork) extractCodeFromResult.ts
 *
 * Provides:
 * 1. SurroundingsRemover — intelligent prefix/suffix stripping
 * 2. extractCodeFromRegular — code fence extraction with language detection
 * 3. extractCodeFromFIM — fill-in-middle code extraction
 * 4. extractSearchReplaceBlocks — ORIGINAL/UPDATED block parsing
 * 5. extractCodeBlocks — generic code block extractor
 *
 * No VSCode dependencies — pure functions.
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface ExtractedCodeBlock {
  language: string;
  content: string;
  filePath?: string;
}

export interface ExtractedSearchReplaceBlock {
  orig: string;
  final: string;
  state: 'writingOriginal' | 'writingFinal' | 'done';
}

// ─── SURROUNDINGS REMOVER ───────────────────────────────────

/**
 * Efficiently strips prefixes and suffixes from a string.
 * Uses index tracking instead of creating new strings — O(1) per operation.
 * Ported from Void's SurroundingsRemover.
 */
export class SurroundingsRemover {
  readonly originalS: string;
  i: number;
  j: number;

  constructor(s: string) {
    this.originalS = s;
    this.i = 0;
    this.j = s.length - 1;
  }

  /** Get the current value (substring between i and j) */
  value(): string {
    return this.originalS.substring(this.i, this.j + 1);
  }

  /** Remove a prefix from the start. Returns true if the entire prefix was found and removed. */
  removePrefix(prefix: string): boolean {
    let offset = 0;
    while (this.i <= this.j && offset <= prefix.length - 1) {
      if (this.originalS.charAt(this.i) !== prefix.charAt(offset)) break;
      offset += 1;
      this.i += 1;
    }
    return offset === prefix.length;
  }

  /** Remove a suffix from the end. Handles partial suffix matches (streaming). */
  removeSuffix(suffix: string): boolean {
    const s = this.value();
    for (let len = Math.min(s.length, suffix.length); len >= 1; len -= 1) {
      if (s.endsWith(suffix.substring(0, len))) {
        this.j -= len;
        return len === suffix.length;
      }
    }
    return false;
  }

  /** Skip forward from current position until a full match of 'until' string is found. */
  removeFromStartUntilFullMatch(until: string, alsoRemoveUntilStr: boolean): boolean {
    const index = this.originalS.indexOf(until, this.i);
    if (index === -1) return false;

    if (alsoRemoveUntilStr) {
      this.i = index + until.length;
    } else {
      this.i = index;
    }
    return true;
  }

  /** Remove a code block wrapper. */
  removeCodeBlock(): boolean {
    const foundCodeBlock = this.removePrefix('```');
    if (!foundCodeBlock) return false;

    this.removeFromStartUntilFullMatch('\n', true); // skip language identifier

    const j = this.j;
    let foundCodeBlockEnd = this.removeSuffix('```');

    if (this.j === j) foundCodeBlockEnd = this.removeSuffix('```\n');

    if (!foundCodeBlockEnd) return false;

    this.removeSuffix('\n'); // remove the newline before ```
    return true;
  }

  /** Get the actual delta and ignored suffix for streaming scenarios */
  deltaInfo(recentlyAddedTextLen: number): readonly [string, string] {
    const recentlyAddedIdx = this.originalS.length - recentlyAddedTextLen;
    const actualDelta = this.originalS.substring(Math.max(this.i, recentlyAddedIdx), this.j + 1);
    const ignoredSuffix = this.originalS.substring(Math.max(this.j + 1, recentlyAddedIdx), Infinity);
    return [actualDelta, ignoredSuffix] as const;
  }
}

// ─── CODE EXTRACTION ────────────────────────────────────────

/**
 * Extract code from a regular LLM response.
 * Strips code fences and returns [fullCode, delta, ignoredSuffix].
 *
 * Ported from Void's extractCodeFromRegular.
 */
export function extractCodeFromRegular(
  text: string,
  recentlyAddedTextLen: number = 0,
): [string, string, string] {
  const pm = new SurroundingsRemover(text);
  pm.removeCodeBlock();

  const s = pm.value();
  const [delta, ignoredSuffix] = pm.deltaInfo(recentlyAddedTextLen);

  return [s, delta, ignoredSuffix];
}

/**
 * Extract code from a Fill-In-Middle (FIM) response.
 * Handles FIM-specific tags like midTag, end-of-generation tokens, etc.
 *
 * Ported from Void's extractCodeFromFIM.
 */
export function extractCodeFromFIM(
  text: string,
  recentlyAddedTextLen: number = 0,
  midTag: string = '<MID>',
): [string, string, string] {
  const pm = new SurroundingsRemover(text);

  // Try removing code block wrapper
  pm.removeCodeBlock();

  // Try removing MID tag prefix
  const val = pm.value();
  const escapedMidTag = midTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const midTagRegex = new RegExp(`^${escapedMidTag}\\s*`);
  const midMatch = val.match(midTagRegex);
  if (midMatch) {
    pm.i += midMatch[0].length;
  }

  // Remove common end-of-generation tokens
  const endTokens = ['<END>', '</s>', '<|endoftext|>', '<|end|>', '<|im_end|>', '<|eot_id|>'];
  for (const token of endTokens) {
    pm.removeSuffix(token);
  }

  const s = pm.value();
  const [delta, ignoredSuffix] = pm.deltaInfo(recentlyAddedTextLen);

  return [s, delta, ignoredSuffix];
}

// ─── SEARCH/REPLACE BLOCK EXTRACTION ────────────────────────

// Markers for ORIGINAL/UPDATED blocks (Void's SEARCH/REPLACE format)
const ORIGINAL = '<<<<<<< ORIGINAL';
const DIVIDER = '=======';
const FINAL = '>>>>>>> UPDATED';

/**
 * Extract SEARCH/REPLACE blocks from LLM output.
 * Handles streaming — returns partial blocks with state indicator.
 *
 * Format:
 * ```
 * <<<<<<< ORIGINAL
 * old code here
 * =======
 * new code here
 * >>>>>>> UPDATED
 * ```
 *
 * Ported from Void's extractSearchReplaceBlocks.
 */
export function extractSearchReplaceBlocks(text: string): ExtractedSearchReplaceBlock[] {
  const blocks: ExtractedSearchReplaceBlock[] = [];

  // Pre-check: any markers at all?
  const usingORIGINAL = ORIGINAL;
  const usingDIVIDER = DIVIDER;
  const usingFINAL = FINAL;

  let i = 0;
  while (i < text.length) {
    // Find start of ORIGINAL block
    const originalStart = text.indexOf(usingORIGINAL, i);
    if (originalStart === -1) break;

    let origContentStart = originalStart + usingORIGINAL.length;
    // Skip newline after ORIGINAL marker
    if (text[origContentStart] === '\n') origContentStart++;

    // Find divider
    const dividerStart = text.indexOf(usingDIVIDER, origContentStart);
    if (dividerStart === -1) {
      // Still writing original — no divider yet
      let origStr = text.substring(origContentStart);
      // Remove trailing newline
      if (origStr.endsWith('\n')) origStr = origStr.slice(0, -1);

      blocks.push({ orig: origStr, final: '', state: 'writingOriginal' });
      break;
    }

    // Extract original content
    let origStr = text.substring(origContentStart, dividerStart);
    if (origStr.endsWith('\n')) origStr = origStr.slice(0, -1);

    let finalContentStart = dividerStart + usingDIVIDER.length;
    if (text[finalContentStart] === '\n') finalContentStart++;

    // Find UPDATED marker
    const finalStart = text.indexOf(usingFINAL, finalContentStart);
    if (finalStart === -1) {
      // Still writing final — no UPDATED marker yet
      let finalStr = text.substring(finalContentStart);
      if (finalStr.endsWith('\n')) finalStr = finalStr.slice(0, -1);

      // Check if we're still at/before the divider line
      const partialFinal = text.substring(finalContentStart).trimEnd();
      if (partialFinal.startsWith('>>>>>>>') && !partialFinal.includes(usingFINAL)) {
        // Partial UPDATED marker — still writing final
        blocks.push({ orig: origStr, final: '', state: 'writingFinal' });
      } else {
        blocks.push({ orig: origStr, final: finalStr, state: 'writingFinal' });
      }
      break;
    }

    // Complete block found
    let finalStr = text.substring(finalContentStart, finalStart);
    if (finalStr.endsWith('\n')) finalStr = finalStr.slice(0, -1);

    blocks.push({ orig: origStr, final: finalStr, state: 'done' });

    i = finalStart + usingFINAL.length;
  }

  return blocks;
}

// ─── GENERIC CODE BLOCK EXTRACTION ──────────────────────────

/**
 * Extract all code blocks from markdown/LLM text.
 * Handles language detection, file path hints, and nested blocks.
 */
export function extractCodeBlocks(text: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  const lines = text.split('\n');

  let insideBlock = false;
  let currentBlock: string[] = [];
  let currentLang = '';
  let currentFilePath: string | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```') && !insideBlock) {
      // Opening code fence
      insideBlock = true;
      currentBlock = [];

      // Extract language from ```language or ```language:filepath
      const fenceContent = trimmed.slice(3).trim();
      if (fenceContent.includes(':')) {
        const [lang, ...pathParts] = fenceContent.split(':');
        currentLang = lang.trim();
        currentFilePath = pathParts.join(':').trim() || undefined;
      } else {
        currentLang = fenceContent;
        currentFilePath = undefined;
      }

      // Check if previous line is a file path hint (e.g., "// src/foo.ts" or "File: src/foo.ts")
      if (!currentFilePath && i > 0) {
        const prevLine = lines[i - 1].trim();
        const filePathMatch = prevLine.match(/^(?:\/\/|#|File:|Path:)\s*(.+\.\w+)\s*$/);
        if (filePathMatch) {
          currentFilePath = filePathMatch[1];
        }
      }

      continue;
    }

    if (trimmed.startsWith('```') && insideBlock) {
      // Closing code fence
      insideBlock = false;
      if (currentBlock.length > 0) {
        blocks.push({
          language: currentLang || detectLanguage(currentBlock.join('\n')),
          content: currentBlock.join('\n'),
          filePath: currentFilePath,
        });
      }
      currentBlock = [];
      currentLang = '';
      currentFilePath = undefined;
      continue;
    }

    if (insideBlock) {
      currentBlock.push(line);
    }
  }

  // Handle unclosed code block (streaming)
  if (insideBlock && currentBlock.length > 0) {
    blocks.push({
      language: currentLang || detectLanguage(currentBlock.join('\n')),
      content: currentBlock.join('\n'),
      filePath: currentFilePath,
    });
  }

  return blocks;
}

// ─── LANGUAGE DETECTION ─────────────────────────────────────

/**
 * Simple heuristic-based language detection from code content.
 */
function detectLanguage(code: string): string {
  const firstLine = code.split('\n')[0].trim();

  // Shebang detection
  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) return 'python';
    if (firstLine.includes('node') || firstLine.includes('deno') || firstLine.includes('bun')) return 'javascript';
    if (firstLine.includes('bash') || firstLine.includes('sh')) return 'bash';
    if (firstLine.includes('ruby')) return 'ruby';
  }

  // Content-based detection
  if (code.includes('import ') && (code.includes(': string') || code.includes(': number') || code.includes('interface '))) return 'typescript';
  if (code.includes('import ') && code.includes('from ')) return 'javascript';
  if (code.includes('def ') && code.includes(':') && !code.includes('{')) return 'python';
  if (code.includes('fn ') && code.includes('->') && code.includes('let ')) return 'rust';
  if (code.includes('func ') && code.includes('package ')) return 'go';
  if (code.includes('<html') || code.includes('<!DOCTYPE')) return 'html';
  if (code.includes('selector:') && code.includes('template:')) return 'typescript';
  if (/^{[\s\n]/.test(code) || /^\[[\s\n]/.test(code)) return 'json';

  return '';
}
