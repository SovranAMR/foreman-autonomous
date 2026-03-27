// Edit to: src/orchestration/engine.ts
// Appending the EngineStatus enum definition.

export enum EngineStatus {
  IDLE,
  AWAITING_INPUT,
  GENERATING_ASSUMPTION,
  PROCESSING,
  DONE,
}