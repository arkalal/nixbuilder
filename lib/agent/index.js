// Agent Module - Main Exports
// Provides error recovery and agentic capabilities for the AI app builder

// Error Capture
export {
  ERROR_TYPES,
  captureInstallErrors,
  captureBuildErrors,
  captureRuntimeErrors,
  checkDevServerHealth,
} from "./errorCapture.js";

// Error Parser
export {
  parseError,
  generateFixPrompt,
  generateErrorSummary,
  isFixableError,
  areErrorsRelated,
} from "./errorParser.js";

// Recovery Loop
export {
  runWithRecovery,
  quickValidate,
  suggestFixStrategy,
  createRecoveryContext,
} from "./recoveryLoop.js";

// Default configuration
export const AGENT_CONFIG = {
  maxRecoveryIterations: 3,
  runtimeCheckWaitMs: 3000,
  enableAutoRecovery: true,
};

/**
 * Create an agent context for a generation session
 * @param {Object} options - Configuration options
 * @returns {Object} - Agent context object
 */
export function createAgentContext(options = {}) {
  return {
    errors: [],
    fixAttempts: [],
    iteration: 0,
    maxIterations: options.maxIterations || AGENT_CONFIG.maxRecoveryIterations,
    startTime: Date.now(),
    files: options.initialFiles || {},
    userPrompt: options.userPrompt || "",
    autoRecovery: options.autoRecovery ?? AGENT_CONFIG.enableAutoRecovery,
  };
}

/**
 * Log agent activity for debugging
 * @param {string} action - Action being performed
 * @param {Object} data - Additional data to log
 */
export function logAgentActivity(action, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[Agent ${timestamp}] ${action}`, JSON.stringify(data, null, 2));
}
