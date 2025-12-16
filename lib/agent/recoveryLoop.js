// Recovery Loop Module
// Orchestrates the error detection and auto-fix cycle

import {
  captureInstallErrors,
  captureBuildErrors,
  captureRuntimeErrors,
  ERROR_TYPES,
} from "./errorCapture.js";
import {
  parseError,
  generateFixPrompt,
  generateErrorSummary,
  isFixableError,
} from "./errorParser.js";

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_RUNTIME_WAIT_MS = 3000;

/**
 * Run code generation with automatic error recovery
 * @param {Object} options - Configuration options
 * @param {Function} options.generateFn - Async function that generates code, receives (prompt, isRetry) and returns files object
 * @param {Object} options.sandbox - Sandbox provider instance
 * @param {Object} options.initialFiles - Initial files to start with
 * @param {string} options.userPrompt - Original user prompt
 * @param {number} options.maxIterations - Max fix attempts (default: 3)
 * @param {Function} options.onProgress - Progress callback (optional)
 * @param {Function} options.onError - Error callback (optional)
 * @returns {Object} - Result with success status, files, and metadata
 */
export async function runWithRecovery(options) {
  const {
    generateFn,
    sandbox,
    initialFiles = {},
    userPrompt,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    onProgress,
    onError,
  } = options;

  let iteration = 0;
  let lastError = null;
  let currentFiles = { ...initialFiles };
  let allErrors = [];
  let fixAttempts = [];

  // Helper to report progress
  const progress = (status, data = {}) => {
    const progressData = {
      iteration,
      maxIterations,
      status,
      ...data,
    };
    console.log(`[RecoveryLoop] ${status}`, data);
    onProgress?.(progressData);
  };

  // Helper to report errors
  const reportError = (error, phase) => {
    const summary = generateErrorSummary(error);
    console.error(`[RecoveryLoop] Error in ${phase}: ${summary}`);
    onError?.({ error, phase, iteration });
  };

  while (iteration < maxIterations) {
    iteration++;
    progress("starting_iteration", { isRetry: iteration > 1 });

    try {
      // Step 1: Generate or fix code
      progress("generating", { isRetry: iteration > 1, hasError: !!lastError });

      let generatedFiles;
      if (lastError && iteration > 1) {
        // Generate fix prompt and regenerate
        const fixPrompt = generateFixPrompt(lastError, currentFiles);
        generatedFiles = await generateFn(fixPrompt, true);
        fixAttempts.push({
          iteration,
          error: generateErrorSummary(lastError),
          prompt: fixPrompt.substring(0, 500),
        });
      } else {
        // First generation with original prompt
        generatedFiles = await generateFn(userPrompt, false);
      }

      // Merge generated files with current files
      if (generatedFiles && typeof generatedFiles === "object") {
        currentFiles = { ...currentFiles, ...generatedFiles };
      }

      // Step 2: Write files to sandbox
      progress("writing_files", {
        fileCount: Object.keys(currentFiles).length,
      });
      await sandbox.writeFiles(currentFiles);

      // Step 3: Install dependencies
      progress("installing_dependencies");
      const installError = await captureInstallErrors(sandbox);

      if (installError) {
        lastError = {
          ...installError,
          ...parseError(installError.raw, installError.type),
        };
        allErrors.push(lastError);
        reportError(lastError, "npm_install");

        if (!isFixableError(lastError)) {
          progress("unfixable_error", { error: lastError });
          break;
        }

        progress("error_detected", {
          type: lastError.type,
          willRetry: iteration < maxIterations,
        });
        continue;
      }

      // Step 4: Start dev server
      progress("starting_dev_server");
      try {
        await sandbox.startDevServer();
      } catch (devServerError) {
        // Dev server startup failed - try to get logs
        const logs = await sandbox.getDevLog?.().catch(() => "");
        lastError = parseError(
          devServerError.message + "\n" + logs,
          ERROR_TYPES.COMPILATION
        );
        lastError.suggestions = [
          "Check for syntax errors in your code",
          "Verify all imports are correct",
          "Ensure Next.js configuration is valid",
        ];
        allErrors.push(lastError);
        reportError(lastError, "dev_server_start");

        if (!isFixableError(lastError)) {
          progress("unfixable_error", { error: lastError });
          break;
        }

        progress("error_detected", {
          type: lastError.type,
          willRetry: iteration < maxIterations,
        });
        continue;
      }

      // Step 5: Check for runtime errors (give it time to compile)
      progress("checking_runtime");
      const runtimeError = await captureRuntimeErrors(
        sandbox,
        DEFAULT_RUNTIME_WAIT_MS
      );

      if (runtimeError) {
        lastError = {
          ...runtimeError,
          ...parseError(runtimeError.raw, runtimeError.type),
        };
        allErrors.push(lastError);
        reportError(lastError, "runtime");

        if (!isFixableError(lastError)) {
          progress("unfixable_error", { error: lastError });
          break;
        }

        progress("error_detected", {
          type: lastError.type,
          willRetry: iteration < maxIterations,
        });
        continue;
      }

      // SUCCESS! No errors detected
      progress("success", { iterations: iteration });

      return {
        success: true,
        files: currentFiles,
        iterations: iteration,
        errors: allErrors,
        fixAttempts,
        previewUrl: sandbox.getInfo?.()?.url,
      };
    } catch (unexpectedError) {
      // Unexpected error in the recovery loop itself
      console.error("[RecoveryLoop] Unexpected error:", unexpectedError);
      lastError = parseError(
        unexpectedError.message || String(unexpectedError),
        ERROR_TYPES.UNKNOWN
      );
      allErrors.push(lastError);
      reportError(lastError, "unexpected");

      if (!isFixableError(lastError)) {
        break;
      }
    }
  }

  // Max iterations reached or unfixable error
  progress("failed", {
    iterations: iteration,
    lastError: lastError ? generateErrorSummary(lastError) : null,
  });

  return {
    success: false,
    files: currentFiles,
    iterations: iteration,
    errors: allErrors,
    fixAttempts,
    lastError,
    message: lastError
      ? `Failed after ${iteration} attempts. Last error: ${generateErrorSummary(
          lastError
        )}`
      : `Failed after ${iteration} attempts`,
    previewUrl: sandbox.getInfo?.()?.url,
  };
}

/**
 * Quick validation - run without full recovery loop
 * Just check if current files have obvious errors
 * @param {Object} sandbox - Sandbox instance
 * @param {Object} files - Files to validate
 * @returns {Object} - Validation result with any errors found
 */
export async function quickValidate(sandbox, files) {
  const errors = [];

  try {
    // Write files
    await sandbox.writeFiles(files);

    // Check npm install
    const installError = await captureInstallErrors(sandbox);
    if (installError) {
      errors.push({
        phase: "npm_install",
        ...installError,
        ...parseError(installError.raw, installError.type),
      });
    }

    // Only continue if install succeeded
    if (errors.length === 0) {
      // Try to start dev server
      try {
        await sandbox.startDevServer();

        // Quick runtime check
        const runtimeError = await captureRuntimeErrors(sandbox, 2000);
        if (runtimeError) {
          errors.push({
            phase: "runtime",
            ...runtimeError,
            ...parseError(runtimeError.raw, runtimeError.type),
          });
        }
      } catch (devError) {
        errors.push({
          phase: "dev_server",
          type: ERROR_TYPES.COMPILATION,
          message: devError.message,
          raw: devError.message,
        });
      }
    }
  } catch (error) {
    errors.push({
      phase: "validation",
      type: ERROR_TYPES.UNKNOWN,
      message: error.message,
      raw: error.message,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    errorSummaries: errors.map(generateErrorSummary),
  };
}

/**
 * Analyze an error and suggest the best fix strategy
 * @param {Object} error - Error object
 * @param {Object} files - Current project files
 * @returns {Object} - Fix strategy recommendation
 */
export function suggestFixStrategy(error, files) {
  const strategy = {
    action: "regenerate", // regenerate, modify, add_dependency, manual
    targetFiles: [],
    confidence: "medium",
    explanation: "",
  };

  switch (error.type) {
    case ERROR_TYPES.MODULE_NOT_FOUND: {
      // Check if it's a missing npm package or local file
      const moduleName = error.message.match(/['"]([^'"]+)['"]/)?.[1];

      if (moduleName?.startsWith(".") || moduleName?.startsWith("/")) {
        // Local file - needs to be created
        strategy.action = "regenerate";
        strategy.targetFiles = [error.file];
        strategy.explanation = `Local file ${moduleName} is missing. Regenerating imports.`;
        strategy.confidence = "high";
      } else if (moduleName && !moduleName.includes("/")) {
        // npm package - needs to be added
        strategy.action = "add_dependency";
        strategy.targetFiles = ["package.json"];
        strategy.explanation = `Package ${moduleName} needs to be added to dependencies.`;
        strategy.confidence = "high";
      } else {
        strategy.action = "regenerate";
        strategy.targetFiles = [error.file].filter(Boolean);
        strategy.confidence = "medium";
      }
      break;
    }

    case ERROR_TYPES.SYNTAX:
    case ERROR_TYPES.TYPE_ERROR:
    case ERROR_TYPES.REFERENCE_ERROR:
      strategy.action = "regenerate";
      strategy.targetFiles = [error.file].filter(Boolean);
      strategy.confidence = "high";
      strategy.explanation = `Syntax/logic error in ${
        error.file || "file"
      }. Regenerating with fix.`;
      break;

    case ERROR_TYPES.HYDRATION:
      strategy.action = "regenerate";
      strategy.targetFiles = [error.file].filter(Boolean);
      strategy.confidence = "medium";
      strategy.explanation =
        "Hydration mismatch - need to ensure SSR compatibility.";
      break;

    case ERROR_TYPES.NPM_INSTALL:
      if (error.packages?.length > 0) {
        strategy.action = "modify";
        strategy.targetFiles = ["package.json"];
        strategy.confidence = "high";
        strategy.explanation = `Fix dependency issues: ${error.packages
          .map((p) => p.name)
          .join(", ")}`;
      } else {
        strategy.action = "regenerate";
        strategy.targetFiles = ["package.json"];
        strategy.confidence = "medium";
      }
      break;

    default:
      strategy.action = "regenerate";
      strategy.targetFiles = error.file ? [error.file] : [];
      strategy.confidence = "low";
      strategy.explanation = "Unknown error - attempting general regeneration.";
  }

  return strategy;
}

/**
 * Create a recovery context object to pass to the AI
 * This provides structured information about what went wrong
 * @param {Array} errors - Array of error objects
 * @param {Array} fixAttempts - Array of previous fix attempts
 * @param {number} iteration - Current iteration number
 * @returns {string} - Formatted context string
 */
export function createRecoveryContext(errors, fixAttempts, iteration) {
  const parts = [];

  parts.push(`## Recovery Context (Attempt ${iteration})\n`);

  if (fixAttempts.length > 0) {
    parts.push("### Previous Fix Attempts:");
    fixAttempts.forEach((attempt, idx) => {
      parts.push(`${idx + 1}. Attempt ${attempt.iteration}: ${attempt.error}`);
    });
    parts.push("");
  }

  if (errors.length > 1) {
    parts.push("### Error History:");
    errors.forEach((error, idx) => {
      parts.push(`${idx + 1}. ${generateErrorSummary(error)}`);
    });
    parts.push("");
  }

  parts.push("### Important:");
  parts.push("- Previous fixes did not resolve the issue");
  parts.push("- Try a different approach than before");
  parts.push("- Double-check all imports and dependencies");
  parts.push("- Ensure all files are complete and syntactically valid");

  return parts.join("\n");
}
