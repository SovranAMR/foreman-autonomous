/**
 * FOREMAN — Error Handling
 *
 * OpenClaw errors.ts + failover-error.ts'den adapte.
 *
 * Merkezi hata yönetimi:
 * - Hata sınıflandırma (classifyLLMError retry.ts'de)
 * - Hata formatlama (kullanıcı-güzel mesajlar)
 * - Typed error sınıfları
 * - Safe JSON extraction (bozuk JSON'dan kurtul)
 */

// ─── ERROR CLASSES ───────────────────────────────────────────

/** Pipeline bir thought'ta durdu */
export class BlockedError extends Error {
  constructor(
    public readonly thoughtId: string,
    public readonly phase: string,
    public readonly reason: string,
  ) {
    super(`Blocked at ${phase} (${thoughtId}): ${reason}`);
    this.name = "BlockedError";
  }
}

/** Bütçe aşıldı */
export class BudgetExceededError extends Error {
  constructor(
    public readonly budgetType: "thought" | "chain" | "session",
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`${budgetType} token budget exceeded: ${used}/${limit}`);
    this.name = "BudgetExceededError";
  }
}

/** Provider bulunamadı */
export class NoProviderError extends Error {
  constructor(public readonly model: string) {
    super(`No provider found for model: ${model}`);
    this.name = "NoProviderError";
  }
}

/** Parse başarısız */
export class ParseFailedError extends Error {
  constructor(
    public readonly phase: string,
    public readonly missing: string[],
    public readonly rawText: string,
  ) {
    super(`Parse failed for ${phase}: missing ${missing.join(", ")}`);
    this.name = "ParseFailedError";
  }
}

/** State geçişi geçersiz */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Validation başarısız */
export class ValidationError extends Error {
  constructor(
    public readonly thoughtId: string,
    public readonly errors: string[],
  ) {
    super(`Validation failed for ${thoughtId}: ${errors.join("; ")}`);
    this.name = "ValidationError";
  }
}

// ─── ERROR FORMATTING ────────────────────────────────────────

/**
 * Herhangi bir hatayı okunabilir mesaja dönüştür.
 * OpenClaw formatErrorMessage'dan adapte.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || "Error";
  }
  if (typeof err === "string") {
    return err;
  }
  if (typeof err === "number" || typeof err === "boolean") {
    return String(err);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return Object.prototype.toString.call(err);
  }
}

/**
 * Hata'dan errno code'u çıkar.
 */
export function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") return code;
  if (typeof code === "number") return String(code);
  return undefined;
}

/**
 * Hata'dan HTTP status code'u çıkar.
 */
export function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const status = (err as any).status ?? (err as any).statusCode ?? (err as any).response?.status;
  return typeof status === "number" ? status : undefined;
}

// ─── SAFE JSON ───────────────────────────────────────────────

/**
 * JSON parse et, bozuksa null dön (throw etme).
 */
export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * JSON parse et, bozuksa default değer dön.
 */
export function safeJsonParseOr<T>(text: string, defaultValue: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return defaultValue;
  }
}

// ─── SAFE FILE OPS ───────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

/**
 * JSON dosyası oku — yoksa veya bozuksa undefined dön.
 * OpenClaw json-file.ts'den adapte.
 */
export function loadJsonFile<T = unknown>(path: string): T | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * JSON dosyası yaz — dizin yoksa oluştur, izinleri ayarla.
 * OpenClaw json-file.ts'den adapte.
 */
export function saveJsonFile(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows'da chmod çalışmayabilir
  }
}
