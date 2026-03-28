/**
 * @file Defines the core data models for the Assumption Engine.
 * These models provide the structure for creating, tracking, and logging
 * assumptions made by the Foreman orchestrator.
 */

/**
 * A strongly-typed enumeration of reasons why an assumption might be made.
 * This provides clear, machine-readable justification for an assumption event.
 */
export enum AssumptionReason {
  /**
   * Used when a required piece of user input (e.g., a file path, a confirmation)
   * was not provided, and the system is generating a plausible alternative
   * to avoid blocking.
   */
  UserInputNotProvided = 'UserInputNotProvided',

  /**
   * Used when an external tool or API call fails and a fallback or
   * mock response is synthesized to allow the task to continue.
   */
  ToolOrApiFailure = 'ToolOrApiFailure',

  /**
   * Used when a file that was expected to exist cannot be found, and its
   * content is synthesized based on context to prevent a crash.
   */
  FileNotFound = 'FileNotFound',
}

/**
 * A flexible type for the contextual data that informed an assumption.
 * This is a key-value store that should contain any relevant information
 * used by the Assumption Engine to generate the synthesized data, such as
 * file paths, error messages, or surrounding code.
 */
export type AssumptionContext = Record<string, any>;

/**
 * The core data structure representing a single, immutable assumption event.
 * This interface acts as a self-contained payload, providing all the necessary
 * information to understand what was assumed, why, and what the result was.
 */
export interface Assumption {
  /**
   * A unique identifier for the assumption, following the format 'ASMP-XXX'.
   * This allows for clear traceability in logs.
   */
  id: string;

  /**
   * The specific reason the assumption was necessary.
   */
  reason: AssumptionReason;

  /**
   * The contextual data that the Assumption Engine used to make its decision.
   */
  context: AssumptionContext;

  /**
   * The data that was synthesized as a result of the assumption. This can be
   * a string (e.g., file content), a JSON object, or any other data type.
   */
  synthesizedData: any;
}