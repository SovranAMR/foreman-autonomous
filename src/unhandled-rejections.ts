/**
 * FOREMAN — Unhandled Rejection Protection
 *
 * Prevents the Foreman process from crashing due to unhandled promise rejections.
 *
 * Inspired by OpenClaw's src/infra/unhandled-rejections.ts:
 * - Classifies errors into fatal, config, transient network, and abort
 * - Only crashes on truly fatal errors (OOM, script timeout)
 * - Suppresses transient network errors (ECONNRESET, ETIMEDOUT, etc.)
 * - Suppresses AbortErrors (intentional cancellation during shutdown)
 * - Logs everything for debugging
 *
 * Foreman adaptation:
 * - Simpler classification (no OpenClaw-specific config errors)
 * - Process exit is optional (Foreman may want to continue on errors)
 * - Custom handler registration for engine-specific error handling
 */

import process from "node:process";

// ─── TYPES ───────────────────────────────────────────────────

type UnhandledRejectionHandler = (reason: unknown) => boolean;

// ─── ERROR CLASSIFICATION ────────────────────────────────────

/** Errors that should crash the process — unrecoverable */
const FATAL_ERROR_CODES = new Set([
  "ERR_OUT_OF_MEMORY",
  "ERR_SCRIPT_EXECUTION_TIMEOUT",
  "ERR_WORKER_OUT_OF_MEMORY",
  "ERR_WORKER_UNCAUGHT_EXCEPTION",
  "ERR_WORKER_INITIALIZATION_FAILED",
]);

/** Network errors that are transient — should NOT crash */
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_DNS_RESOLVE_FAILED",
  "UND_ERR_CONNECT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

// ─── HELPERS ─────────────────────────────────────────────────

const handlers = new Set<UnhandledRejectionHandler>();

function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getErrorCause(err: unknown): unknown {
  if (!err || typeof err !== "object") return undefined;
  return (err as { cause?: unknown }).cause;
}

function extractErrorCodeWithCause(err: unknown): string | undefined {
  const direct = extractErrorCode(err);
  if (direct) return direct;
  return extractErrorCode(getErrorCause(err));
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

// ─── ERROR TYPE CHECKS ──────────────────────────────────────

/**
 * Check if an error is an AbortError (intentional cancellation).
 * These are expected during graceful shutdown.
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError") return true;
  const message = "message" in err && typeof err.message === "string" ? err.message : "";
  return message === "This operation was aborted";
}

/**
 * Check if an error is fatal and should crash the process.
 */
export function isFatalError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err);
  return code !== undefined && FATAL_ERROR_CODES.has(code);
}

/**
 * Check if an error is a transient network error.
 * These are temporary connectivity issues that resolve on their own.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;

  const code = extractErrorCodeWithCause(err);
  if (code && TRANSIENT_NETWORK_CODES.has(code)) return true;

  // "fetch failed" TypeError from undici (Node's native fetch)
  if (err instanceof TypeError && err.message === "fetch failed") {
    const cause = getErrorCause(err);
    if (cause) return isTransientNetworkError(cause);
    return true;
  }

  // Check the cause chain recursively
  const cause = getErrorCause(err);
  if (cause && cause !== err) return isTransientNetworkError(cause);

  // AggregateError may wrap multiple causes
  if (err instanceof AggregateError && err.errors?.length) {
    return err.errors.some((e) => isTransientNetworkError(e));
  }

  return false;
}

// ─── PUBLIC API ──────────────────────────────────────────────

/**
 * Register a custom handler for unhandled rejections.
 * Return true from the handler to suppress the rejection.
 * Returns a cleanup function to unregister.
 */
export function registerUnhandledRejectionHandler(handler: UnhandledRejectionHandler): () => void {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

/**
 * Install the unhandled rejection handler on the process.
 * Call once at startup.
 *
 * @param exitOnFatal If true, exit(1) on fatal errors. Default true.
 */
export function installUnhandledRejectionHandler(exitOnFatal: boolean = true): void {
  process.on("unhandledRejection", (reason, _promise) => {
    // Check custom handlers first
    for (const handler of handlers) {
      try {
        if (handler(reason)) return;
      } catch (err) {
        console.error(
          "[foreman] Unhandled rejection handler failed:",
          err instanceof Error ? (err.stack ?? err.message) : err,
        );
      }
    }

    // AbortError — intentional cancellation, suppress with warning
    if (isAbortError(reason)) {
      console.warn("[foreman] Suppressed AbortError:", formatError(reason));
      return;
    }

    // Fatal error — must crash
    if (isFatalError(reason)) {
      console.error("[foreman] FATAL unhandled rejection:", formatError(reason));
      if (exitOnFatal) process.exit(1);
      return;
    }

    // Transient network error — suppress with warning
    if (isTransientNetworkError(reason)) {
      console.warn(
        "[foreman] Transient network error (continuing):",
        formatError(reason),
      );
      return;
    }

    // Unknown error — log but don't crash by default
    // Foreman is a long-running coding agent; crashing loses work
    console.error("[foreman] Unhandled promise rejection:", formatError(reason));
    if (exitOnFatal) {
      // In strict mode, crash on unknown errors too
      // But give a grace period for cleanup
      setTimeout(() => process.exit(1), 1000);
    }
  });
}

/**
 * Install uncaught exception handler.
 * Logs the error and exits.
 */
export function installUncaughtExceptionHandler(): void {
  process.on("uncaughtException", (err) => {
    console.error("[foreman] Uncaught exception:", formatError(err));
    // Give pending writes time to flush
    setTimeout(() => process.exit(1), 500);
  });
}
