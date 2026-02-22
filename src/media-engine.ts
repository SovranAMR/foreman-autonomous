/**
 * FOREMAN — Media Engine
 *
 * File processing, MIME detection, image/audio handling.
 * Transplanted from OpenClaw's media pipeline, adapted for Foreman.
 *
 * Capabilities:
 * - MIME type detection (by extension + magic bytes)
 * - Image processing (resize, format conversion via sharp if available)
 * - Audio extraction/metadata
 * - File download from URLs
 * - Base64 encode/decode
 * - Media file validation
 * - Attachment handling for messaging
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { createHash } from "node:crypto";

// ─── TYPES ───────────────────────────────────────────────────

export interface MediaFile {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  hash: string;
  category: MediaCategory;
}

export type MediaCategory = "image" | "audio" | "video" | "document" | "code" | "data" | "unknown";

export interface DownloadResult {
  path: string;
  mimeType: string;
  size: number;
  filename: string;
  success: boolean;
  error?: string;
}

export interface ImageInfo {
  width?: number;
  height?: number;
  format: string;
  size: number;
}

// ─── MIME DETECTION ──────────────────────────────────────────

const EXTENSION_MIME_MAP: Record<string, string> = {
  // Images
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".bmp": "image/bmp", ".tiff": "image/tiff",
  // Audio
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".opus": "audio/opus", ".wma": "audio/x-ms-wma",
  // Video
  ".mp4": "video/mp4", ".webm": "video/webm", ".avi": "video/x-msvideo",
  ".mov": "video/quicktime", ".mkv": "video/x-matroska",
  // Documents
  ".pdf": "application/pdf", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Code
  ".ts": "text/typescript", ".js": "text/javascript", ".py": "text/x-python",
  ".rs": "text/x-rust", ".go": "text/x-go", ".java": "text/x-java",
  ".c": "text/x-c", ".cpp": "text/x-c++", ".h": "text/x-c",
  ".rb": "text/x-ruby", ".php": "text/x-php", ".swift": "text/x-swift",
  ".kt": "text/x-kotlin", ".cs": "text/x-csharp",
  // Data
  ".json": "application/json", ".xml": "application/xml",
  ".yaml": "application/x-yaml", ".yml": "application/x-yaml",
  ".csv": "text/csv", ".tsv": "text/tab-separated-values",
  ".sql": "application/sql", ".db": "application/x-sqlite3",
  // Text
  ".txt": "text/plain", ".md": "text/markdown", ".html": "text/html",
  ".css": "text/css", ".log": "text/plain",
  // Archives
  ".zip": "application/zip", ".gz": "application/gzip",
  ".tar": "application/x-tar", ".7z": "application/x-7z-compressed",
  ".rar": "application/x-rar-compressed",
};

/** Magic bytes for common file types */
const MAGIC_BYTES: Array<{ bytes: number[]; mimeType: string }> = [
  { bytes: [0xFF, 0xD8, 0xFF], mimeType: "image/jpeg" },
  { bytes: [0x89, 0x50, 0x4E, 0x47], mimeType: "image/png" },
  { bytes: [0x47, 0x49, 0x46, 0x38], mimeType: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: "image/webp" }, // RIFF (could also be WAV)
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: "application/pdf" },
  { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: "application/zip" },
  { bytes: [0x1F, 0x8B], mimeType: "application/gzip" },
  { bytes: [0x49, 0x44, 0x33], mimeType: "audio/mpeg" }, // ID3 tag
  { bytes: [0xFF, 0xFB], mimeType: "audio/mpeg" }, // MP3 sync
  { bytes: [0x4F, 0x67, 0x67, 0x53], mimeType: "audio/ogg" }, // OggS
  { bytes: [0x66, 0x4C, 0x61, 0x43], mimeType: "audio/flac" }, // fLaC
];

/**
 * Detect MIME type by extension.
 */
export function mimeFromExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MIME_MAP[ext] ?? "application/octet-stream";
}

/**
 * Detect MIME type by magic bytes (file header).
 */
export function mimeFromMagicBytes(buffer: Buffer): string | null {
  for (const { bytes, mimeType } of MAGIC_BYTES) {
    if (buffer.length >= bytes.length) {
      let match = true;
      for (let i = 0; i < bytes.length; i++) {
        if (buffer[i] !== bytes[i]) { match = false; break; }
      }
      if (match) return mimeType;
    }
  }
  return null;
}

/**
 * Detect MIME type using both extension and magic bytes.
 * Magic bytes take priority when available.
 */
export function detectMimeType(filePath: string): string {
  // Try magic bytes first
  try {
    if (existsSync(filePath)) {
      const buffer = Buffer.alloc(16);
      const fd = readFileSync(filePath);
      fd.copy(buffer, 0, 0, Math.min(16, fd.length));
      const magic = mimeFromMagicBytes(buffer);
      if (magic) return magic;
    }
  } catch { /* fall through */ }

  // Fall back to extension
  return mimeFromExtension(filePath);
}

/**
 * Categorize a MIME type.
 */
export function categorizeMedia(mimeType: string): MediaCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("text/x-") || mimeType === "text/typescript" || mimeType === "text/javascript") return "code";
  if (mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("yaml") || mimeType.includes("csv") || mimeType.includes("sql")) return "data";
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("sheet") || mimeType.includes("presentation")) return "document";
  if (mimeType.startsWith("text/")) return "document";
  return "unknown";
}

// ─── FILE OPERATIONS ─────────────────────────────────────────

/**
 * Analyze a local file and return its media info.
 */
export function analyzeFile(filePath: string): MediaFile | null {
  try {
    if (!existsSync(filePath)) return null;

    const stat = statSync(filePath);
    const content = readFileSync(filePath);
    const mimeType = detectMimeType(filePath);

    return {
      path: filePath,
      filename: basename(filePath),
      mimeType,
      size: stat.size,
      hash: createHash("sha256").update(content).digest("hex").slice(0, 16),
      category: categorizeMedia(mimeType),
    };
  } catch {
    return null;
  }
}

/**
 * Download a file from URL.
 */
export async function downloadFile(
  url: string,
  destDir: string,
  filename?: string,
): Promise<DownloadResult> {
  try {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      return {
        path: "",
        mimeType: "",
        size: 0,
        filename: "",
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    // Determine filename
    const finalFilename = filename
      ?? extractFilenameFromUrl(url)
      ?? `download_${Date.now()}${extensionFromMime(contentType)}`;

    const destPath = join(destDir, finalFilename);
    writeFileSync(destPath, buffer);

    return {
      path: destPath,
      mimeType: contentType.split(";")[0].trim(),
      size: buffer.length,
      filename: finalFilename,
      success: true,
    };
  } catch (err) {
    return {
      path: "",
      mimeType: "",
      size: 0,
      filename: "",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Extract filename from URL path */
function extractFilenameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const name = basename(pathname);
    return name && name !== "/" ? name : null;
  } catch {
    return null;
  }
}

/** Get file extension from MIME type */
function extensionFromMime(mimeType: string): string {
  const mime = mimeType.split(";")[0].trim();
  for (const [ext, m] of Object.entries(EXTENSION_MIME_MAP)) {
    if (m === mime) return ext;
  }
  return "";
}

// ─── BASE64 ──────────────────────────────────────────────────

/**
 * Encode file to base64 data URL.
 */
export function fileToDataUrl(filePath: string): string | null {
  try {
    const buffer = readFileSync(filePath);
    const mimeType = detectMimeType(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Decode base64 data URL to file.
 */
export function dataUrlToFile(dataUrl: string, destPath: string): boolean {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return false;

    const buffer = Buffer.from(match[2], "base64");
    const dir = dirname(destPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

// ─── VALIDATION ──────────────────────────────────────────────

/**
 * Validate media file for messaging (size limits, format support).
 */
export function validateForMessaging(
  filePath: string,
  channel: "telegram" | "whatsapp" = "telegram",
): { valid: boolean; error?: string } {
  const file = analyzeFile(filePath);
  if (!file) return { valid: false, error: "File not found or unreadable" };

  const limits = channel === "telegram"
    ? { photo: 10 * 1024 * 1024, document: 50 * 1024 * 1024, audio: 50 * 1024 * 1024 }
    : { photo: 16 * 1024 * 1024, document: 100 * 1024 * 1024, audio: 16 * 1024 * 1024 };

  if (file.category === "image" && file.size > limits.photo) {
    return { valid: false, error: `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${limits.photo / 1024 / 1024}MB)` };
  }
  if (file.category === "audio" && file.size > limits.audio) {
    return { valid: false, error: `Audio too large: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
  }
  if (file.size > limits.document) {
    return { valid: false, error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
  }

  return { valid: true };
}

/**
 * Get human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

// ─── IMAGE HELPERS ───────────────────────────────────────────

/**
 * Get basic image info (dimensions require sharp — optional dep).
 */
export async function getImageInfo(filePath: string): Promise<ImageInfo | null> {
  try {
    const stat = statSync(filePath);
    const ext = extname(filePath).toLowerCase().replace(".", "");

    // Try sharp for dimensions
    try {
      const sharp = await import("sharp");
      const meta = await sharp.default(filePath).metadata();
      return {
        width: meta.width,
        height: meta.height,
        format: meta.format ?? ext,
        size: stat.size,
      };
    } catch {
      // sharp not available — return basic info
      return {
        format: ext,
        size: stat.size,
      };
    }
  } catch {
    return null;
  }
}

/**
 * Resize an image (requires sharp).
 */
export async function resizeImage(
  inputPath: string,
  outputPath: string,
  maxWidth: number,
  maxHeight?: number,
): Promise<boolean> {
  try {
    const sharp = await import("sharp");
    await sharp.default(inputPath)
      .resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true })
      .toFile(outputPath);
    return true;
  } catch {
    return false;
  }
}

// ─── MEDIA ENGINE ────────────────────────────────────────────

export class MediaEngine {
  private downloadDir: string;

  constructor(projectRoot: string) {
    this.downloadDir = join(projectRoot, ".foreman", "media");
    if (!existsSync(this.downloadDir)) {
      mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /** Analyze a file */
  analyze(filePath: string): MediaFile | null {
    return analyzeFile(filePath);
  }

  /** Detect MIME type */
  detectMime(filePath: string): string {
    return detectMimeType(filePath);
  }

  /** Download a URL to local storage */
  async download(url: string, filename?: string): Promise<DownloadResult> {
    return downloadFile(url, this.downloadDir, filename);
  }

  /** Convert file to base64 data URL */
  toDataUrl(filePath: string): string | null {
    return fileToDataUrl(filePath);
  }

  /** Save base64 data URL to file */
  fromDataUrl(dataUrl: string, filename: string): string | null {
    const destPath = join(this.downloadDir, filename);
    return dataUrlToFile(dataUrl, destPath) ? destPath : null;
  }

  /** Validate file for messaging channel */
  validate(filePath: string, channel: "telegram" | "whatsapp" = "telegram"): { valid: boolean; error?: string } {
    return validateForMessaging(filePath, channel);
  }

  /** Get image info (dimensions if sharp available) */
  async imageInfo(filePath: string): Promise<ImageInfo | null> {
    return getImageInfo(filePath);
  }

  /** Resize image */
  async resize(input: string, output: string, maxWidth: number): Promise<boolean> {
    return resizeImage(input, output, maxWidth);
  }

  /** Get download directory path */
  getDownloadDir(): string {
    return this.downloadDir;
  }
}
