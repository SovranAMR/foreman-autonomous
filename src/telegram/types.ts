/**
 * Telegram Platform Types
 * Canonical input format ensuring zero platform drift between Telegram and terminal interfaces.
 * 
 * EMOTION TARGET: Surgical precision in data contracts—every field is deterministic,
 * every type is a sealed vault of information.
 */

import { Context } from 'grammy';

/**
 * Canonical input format for all orchestrator invocations.
 * Platform-agnostic structure ensuring Telegram and terminal inputs are indistinguishable
 * to the downstream 4-layer pipeline (Visioner → Strategist → Researcher → Worker).
 */
export interface AdaptedInput {
  /** Deterministic session identifier (SHA-256 hash of userId:chatId, truncated to 16 chars) */
  sessionId: string;
  
  /** Extracted text content (message text or caption for media) */
  text: string;
  
  /** Deterministic user identifier (SHA-256 hash of userId, truncated to 8 chars) */
  userHash: string;
  
  /** Array of attachment metadata with deterministic hashing */
  attachments: Array<{
    /** Platform file identifier */
    id: string;
    /** Media type classification (document, photo, etc.) */
    type: string;
    /** Deterministic hash of file ID for audit trails */
    hash: string;
  }>;
}

/**
 * Abstract adapter contract for transforming platform-specific contexts
 * into canonical orchestrator input.
 * 
 * Implements the Adapter Pattern to ensure seamless identity between platforms.
 */
export abstract class TelegramChainAdapter {
  /**
   * Transform platform context into canonical input format.
   * Must guarantee: identical user+chat combinations produce identical sessionId values.
   * 
   * @param ctx - grammy Context object containing Telegram update data
   * @returns Canonical AdaptedInput for orchestrator consumption
   */
  abstract adapt(ctx: Context): AdaptedInput;
}