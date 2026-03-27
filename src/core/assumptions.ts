/**
 * Represents a core assumption made by the system.
 * This is a key-value pair where the key is the assumption's ID
 * and the value is its description.
 */
export interface CoreAssumption {
  id: string;
  description: string;
}

/**
 * A list of foundational assumptions the AI operates under.
 * These can be configured or overridden as needed.
 */
export const foundationalAssumptions: CoreAssumption[] = [
  {
    id: 'workspace_access',
    description: 'The AI has full read/write access to the current workspace directory.',
  },
  {
    id: 'internet_access',
    description: 'The AI has access to the public internet for fetching information and packages.',
  },
  {
    id: 'file_system_state',
    description: 'The file system state is consistent and not being modified by external processes during an operation.',
  },
  {
    id: 'tool_availability',
    description: 'All declared tools (bash, git, fs) are available and functioning correctly in the environment.',
  },
  {
    id: 'shell_is_posix',
    description: 'The shell environment is POSIX-compliant (e.g., bash, zsh).',
  },
  {
    id: 'api_endpoints_stable',
    description: 'External API endpoints (e.g., git provider, package registry) are stable and available.',
  },
];