// Diff Module - Main Exports
// Provides diff-based editing capabilities for surgical code changes

export {
  EDIT_FORMATS,
  parseEdits,
  detectEditFormat,
  parseSearchReplaceBlocks,
  parseUnifiedDiff,
  parsePatchFormat,
  parseFileBlocks,
  validateEdits,
  groupEditsByFile,
} from "./diffParser.js";

export { applyEdits, rollback, getEditSummary } from "./diffApplier.js";

// Default configuration
export const DIFF_CONFIG = {
  preferredFormat: "search_replace", // Most reliable for LLMs
  fuzzyMatchEnabled: true,
  fuzzyThreshold: 0.8,
  maxRetries: 2,
  createBackups: true,
};

/**
 * High-level function to process AI response and apply edits
 * @param {string} response - Raw AI response
 * @param {Object} files - Current file contents
 * @param {Object} options - Processing options
 * @returns {Object} - Result with updated files
 */
export async function processAndApplyEdits(response, files, options = {}) {
  const { parseEdits: parse } = await import("./diffParser.js");
  const { applyEdits: apply, getEditSummary } = await import(
    "./diffApplier.js"
  );

  // Parse edits from response
  const parsed = parse(response);

  if (parsed.edits.length === 0) {
    return {
      success: false,
      error: "No edits found in response",
      files,
    };
  }

  // Apply edits
  const result = apply(parsed.edits, files, {
    fuzzyMatch: options.fuzzyMatch ?? DIFF_CONFIG.fuzzyMatchEnabled,
    fuzzyThreshold: options.fuzzyThreshold ?? DIFF_CONFIG.fuzzyThreshold,
    preserveOnError: options.preserveOnError ?? true,
    createBackup: options.createBackup ?? DIFF_CONFIG.createBackups,
  });

  return {
    ...result,
    format: parsed.format,
    summary: getEditSummary(result),
  };
}
