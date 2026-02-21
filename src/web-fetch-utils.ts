/**
 * FOREMAN — Web Fetch Utilities
 *
 * HTML → Markdown conversion, Readability extraction, text truncation.
 * Transplanted from OpenClaw's content extraction pipeline.
 *
 * Three extraction tiers:
 *   1. Readability (best quality — uses @mozilla/readability + linkedom)
 *   2. Regex-based HTML→Markdown (fallback — no dependencies)
 *   3. Raw strip tags (last resort)
 *
 * Design decisions:
 *   - Readability is dynamically imported (optional dep)
 *   - Entities are decoded before stripping tags
 *   - Whitespace is normalized post-extraction
 *   - Truncation is character-based (not token-based — simpler, predictable)
 */

// ─── TYPES ───────────────────────────────────────────────────

export type ExtractMode = "markdown" | "text";

// ─── ENTITY DECODING ─────────────────────────────────────────

/**
 * Decode HTML entities to their character equivalents.
 * Handles named entities + numeric (decimal & hex).
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gi, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)));
}

// ─── TAG STRIPPING ───────────────────────────────────────────

/**
 * Strip all HTML tags and decode entities.
 */
function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ""));
}

// ─── WHITESPACE NORMALIZATION ────────────────────────────────

/**
 * Normalize whitespace:
 *   - Remove \r
 *   - Collapse trailing spaces on lines
 *   - Max 2 consecutive newlines
 *   - Max 1 consecutive space
 *   - Trim
 */
function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ─── HTML → MARKDOWN ─────────────────────────────────────────

/**
 * Convert HTML to Markdown using regex-based extraction.
 * Not perfect — but good enough for content extraction.
 *
 * Handles: headings, links, lists, breaks, script/style removal.
 */
export function htmlToMarkdown(html: string): { text: string; title?: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(stripTags(titleMatch[1])) : undefined;

  // Remove script, style, noscript
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Links → [label](href)
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const label = normalizeWhitespace(stripTags(body));
    if (!label) return href;
    return `[${label}](${href})`;
  });

  // Headings → # heading
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => {
    const prefix = "#".repeat(Math.max(1, Math.min(6, Number.parseInt(level, 10))));
    const label = normalizeWhitespace(stripTags(body));
    return `\n${prefix} ${label}\n`;
  });

  // List items → - item
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => {
    const label = normalizeWhitespace(stripTags(body));
    return label ? `\n- ${label}` : "";
  });

  // Breaks and block element closings → newline
  text = text
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|table|tr|ul|ol)>/gi, "\n");

  // Strip remaining tags
  text = stripTags(text);

  // Normalize
  text = normalizeWhitespace(text);

  return { text, title };
}

// ─── MARKDOWN → TEXT ─────────────────────────────────────────

/**
 * Convert Markdown to plain text.
 * Strips: images, links (keep label), code fences, inline code, headings, list markers.
 */
export function markdownToText(markdown: string): string {
  let text = markdown;

  // Images
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "");

  // Links → keep label
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");

  // Code fences → keep content
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[^\n]*\n?/g, "").replace(/```/g, ""),
  );

  // Inline code → keep content
  text = text.replace(/`([^`]+)`/g, "$1");

  // Heading markers
  text = text.replace(/^#{1,6}\s+/gm, "");

  // List markers
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");

  return normalizeWhitespace(text);
}

// ─── TEXT TRUNCATION ─────────────────────────────────────────

/**
 * Truncate text to maxChars.
 * Returns whether truncation occurred.
 */
export function truncateText(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxChars), truncated: true };
}

// ─── READABILITY EXTRACTION ──────────────────────────────────

/**
 * Extract readable content from HTML using Mozilla Readability.
 *
 * Falls back to regex-based htmlToMarkdown if:
 *   - Readability/linkedom not installed
 *   - Readability returns no content
 *
 * Readability + linkedom are optional dependencies.
 * Foreman doesn't force users to install them — but when available, quality is far superior.
 */
export async function extractReadableContent(params: {
  html: string;
  url: string;
  extractMode: ExtractMode;
}): Promise<{ text: string; title?: string } | null> {
  const fallback = (): { text: string; title?: string } => {
    const rendered = htmlToMarkdown(params.html);
    if (params.extractMode === "text") {
      const text = markdownToText(rendered.text) || normalizeWhitespace(stripTags(params.html));
      return { text, title: rendered.title };
    }
    return rendered;
  };

  try {
    const [{ Readability }, { parseHTML }] = await Promise.all([
      import("@mozilla/readability"),
      import("linkedom"),
    ]);

    const { document } = parseHTML(params.html);

    try {
      (document as { baseURI?: string }).baseURI = params.url;
    } catch {
      // Best-effort base URI for relative links
    }

    const reader = new Readability(document, { charThreshold: 0 });
    const parsed = reader.parse();

    if (!parsed?.content) {
      return fallback();
    }

    const title = parsed.title || undefined;

    if (params.extractMode === "text") {
      const text = normalizeWhitespace(parsed.textContent ?? "");
      return text ? { text, title } : fallback();
    }

    const rendered = htmlToMarkdown(parsed.content);
    return { text: rendered.text, title: title ?? rendered.title };
  } catch {
    // Readability or linkedom not available — use fallback
    return fallback();
  }
}
