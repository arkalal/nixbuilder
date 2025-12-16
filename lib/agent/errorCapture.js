// Error Capture Module
// Captures various error types from the sandbox environment

export const ERROR_TYPES = {
  NPM_INSTALL: "npm_install",
  COMPILATION: "compilation",
  RUNTIME: "runtime",
  HYDRATION: "hydration",
  IMPORT: "import",
  SYNTAX: "syntax",
  MODULE_NOT_FOUND: "module_not_found",
  TYPE_ERROR: "type_error",
  REFERENCE_ERROR: "reference_error",
  UNKNOWN: "unknown",
};

/**
 * Capture npm install errors from sandbox
 * @param {Object} sandbox - Sandbox provider instance
 * @returns {Object|null} - Error object or null if no error
 */
export async function captureInstallErrors(sandbox) {
  try {
    const result = await sandbox.installDependencies();

    if (result.exitCode !== 0) {
      const combinedOutput = `${result.stdout || ""}\n${
        result.stderr || ""
      }`.trim();

      return {
        type: ERROR_TYPES.NPM_INSTALL,
        message: extractNpmErrorMessage(combinedOutput),
        raw: combinedOutput,
        exitCode: result.exitCode,
        packages: parseFailedPackages(combinedOutput),
        suggestions: generateNpmFixSuggestions(combinedOutput),
      };
    }

    return null;
  } catch (error) {
    return {
      type: ERROR_TYPES.NPM_INSTALL,
      message: error.message,
      raw: error.stack || error.message,
      exitCode: -1,
      packages: [],
      suggestions: ["Check if package.json is valid JSON"],
    };
  }
}

/**
 * Capture build/compilation errors from Next.js
 * @param {Object} sandbox - Sandbox provider instance
 * @returns {Object|null} - Error object or null if no error
 */
export async function captureBuildErrors(sandbox) {
  try {
    // Run next build to check for compilation errors
    const result = await sandbox.runShell(["npm", "run", "build"]);

    if (result.exitCode !== 0) {
      const combinedOutput = `${result.stdout || ""}\n${
        result.stderr || ""
      }`.trim();

      const errorType = classifyBuildError(combinedOutput);
      const fileInfo = extractFileInfo(combinedOutput);

      return {
        type: errorType,
        message: extractBuildErrorMessage(combinedOutput),
        raw: combinedOutput,
        exitCode: result.exitCode,
        file: fileInfo.file,
        line: fileInfo.line,
        column: fileInfo.column,
        suggestions: generateBuildFixSuggestions(combinedOutput, errorType),
      };
    }

    return null;
  } catch (error) {
    return {
      type: ERROR_TYPES.COMPILATION,
      message: error.message,
      raw: error.stack || error.message,
      exitCode: -1,
      file: null,
      line: null,
      column: null,
      suggestions: [],
    };
  }
}

/**
 * Capture runtime errors from dev server logs
 * @param {Object} sandbox - Sandbox provider instance
 * @param {number} waitMs - Milliseconds to wait for errors to appear
 * @returns {Object|null} - Error object or null if no error
 */
export async function captureRuntimeErrors(sandbox, waitMs = 3000) {
  try {
    // Wait for dev server to potentially generate errors
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Get dev server logs
    const logs = await sandbox.getDevLog();

    if (!logs) return null;

    // Check for common runtime error patterns
    const runtimeErrorPatterns = [
      /Error:\s*(.+?)(?:\n|$)/i,
      /TypeError:\s*(.+?)(?:\n|$)/i,
      /ReferenceError:\s*(.+?)(?:\n|$)/i,
      /SyntaxError:\s*(.+?)(?:\n|$)/i,
      /Unhandled Runtime Error/i,
      /Internal Server Error/i,
      /Module not found/i,
      /Cannot find module/i,
      /Hydration failed/i,
      /Text content does not match/i,
    ];

    for (const pattern of runtimeErrorPatterns) {
      const match = logs.match(pattern);
      if (match) {
        const errorType = classifyRuntimeError(logs);
        const fileInfo = extractFileInfo(logs);

        return {
          type: errorType,
          message: match[1] || match[0],
          raw: logs,
          file: fileInfo.file,
          line: fileInfo.line,
          column: fileInfo.column,
          suggestions: generateRuntimeFixSuggestions(logs, errorType),
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[ErrorCapture] Failed to capture runtime errors:", error);
    return null;
  }
}

/**
 * Quick health check - verify dev server is responding
 * @param {Object} sandbox - Sandbox provider instance
 * @returns {boolean} - True if healthy
 */
export async function checkDevServerHealth(sandbox) {
  try {
    const info = sandbox.getInfo();
    if (info.state !== "running") return false;

    // Simple port check via sandbox
    const result = await sandbox.runShell([
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      `http://localhost:${sandbox.devPort || 3000}`,
    ]);

    const statusCode = parseInt(result.stdout?.trim() || "0", 10);
    return statusCode >= 200 && statusCode < 500;
  } catch {
    return false;
  }
}

// ============ Helper Functions ============

function extractNpmErrorMessage(output) {
  // Look for npm ERR! lines
  const errLines = output
    .split("\n")
    .filter((line) => line.includes("npm ERR!") || line.includes("npm error"));

  if (errLines.length > 0) {
    // Get the most meaningful error line
    const meaningful = errLines.find(
      (line) =>
        line.includes("404") ||
        line.includes("ERESOLVE") ||
        line.includes("peer dep") ||
        line.includes("not found") ||
        line.includes("No matching version")
    );
    return meaningful || errLines[0];
  }

  // Fallback to first error-like line
  const firstError = output
    .split("\n")
    .find(
      (line) =>
        line.toLowerCase().includes("error") ||
        line.toLowerCase().includes("failed")
    );

  return firstError || "npm install failed";
}

function parseFailedPackages(output) {
  const packages = [];

  // Pattern: npm ERR! 404 Not Found - GET https://registry.npmjs.org/package-name
  const notFoundPattern = /404.*registry\.npmjs\.org\/([^\s/]+)/g;
  let match;
  while ((match = notFoundPattern.exec(output))) {
    packages.push({ name: match[1], reason: "not_found" });
  }

  // Pattern: npm ERR! Could not resolve dependency: package@version
  const resolvePattern = /Could not resolve dependency[:\s]+([^\s@]+)/g;
  while ((match = resolvePattern.exec(output))) {
    if (!packages.find((p) => p.name === match[1])) {
      packages.push({ name: match[1], reason: "resolve_failed" });
    }
  }

  // Pattern: peer dep issues
  const peerPattern =
    /peer dep[^:]*:\s*([^\s@]+)|requires a peer of ([^\s@]+)/gi;
  while ((match = peerPattern.exec(output))) {
    const pkg = match[1] || match[2];
    if (pkg && !packages.find((p) => p.name === pkg)) {
      packages.push({ name: pkg, reason: "peer_dependency" });
    }
  }

  return packages;
}

function generateNpmFixSuggestions(output) {
  const suggestions = [];

  if (output.includes("404") || output.includes("not found")) {
    suggestions.push("Check if the package name is spelled correctly");
    suggestions.push("The package may not exist on npm registry");
  }

  if (output.includes("ERESOLVE") || output.includes("peer dep")) {
    suggestions.push("Try using --legacy-peer-deps flag");
    suggestions.push("Check for conflicting dependency versions");
  }

  if (output.includes("ENOENT") || output.includes("package.json")) {
    suggestions.push("Ensure package.json exists and is valid JSON");
  }

  return suggestions;
}

function classifyBuildError(output) {
  const lowerOutput = output.toLowerCase();

  if (
    lowerOutput.includes("module not found") ||
    lowerOutput.includes("cannot find module")
  ) {
    return ERROR_TYPES.MODULE_NOT_FOUND;
  }
  if (
    lowerOutput.includes("syntaxerror") ||
    lowerOutput.includes("unexpected")
  ) {
    return ERROR_TYPES.SYNTAX;
  }
  if (lowerOutput.includes("typeerror")) {
    return ERROR_TYPES.TYPE_ERROR;
  }
  if (lowerOutput.includes("referenceerror")) {
    return ERROR_TYPES.REFERENCE_ERROR;
  }
  if (lowerOutput.includes("import") && lowerOutput.includes("error")) {
    return ERROR_TYPES.IMPORT;
  }

  return ERROR_TYPES.COMPILATION;
}

function classifyRuntimeError(output) {
  const lowerOutput = output.toLowerCase();

  if (lowerOutput.includes("hydration")) {
    return ERROR_TYPES.HYDRATION;
  }
  if (lowerOutput.includes("typeerror")) {
    return ERROR_TYPES.TYPE_ERROR;
  }
  if (lowerOutput.includes("referenceerror")) {
    return ERROR_TYPES.REFERENCE_ERROR;
  }
  if (
    lowerOutput.includes("module not found") ||
    lowerOutput.includes("cannot find module")
  ) {
    return ERROR_TYPES.MODULE_NOT_FOUND;
  }

  return ERROR_TYPES.RUNTIME;
}

function extractFileInfo(output) {
  const result = { file: null, line: null, column: null };

  // Pattern 1: ./path/to/file.js:line:column
  const pattern1 = /\.\/([^\s:]+):(\d+):(\d+)/;
  let match = output.match(pattern1);
  if (match) {
    result.file = match[1];
    result.line = parseInt(match[2], 10);
    result.column = parseInt(match[3], 10);
    return result;
  }

  // Pattern 2: at /path/to/file.js:line:column
  const pattern2 = /at\s+(?:[^\s]+\s+\()?([^\s:()]+):(\d+):(\d+)/;
  match = output.match(pattern2);
  if (match) {
    result.file = match[1].replace(/^.*\/app\//, "");
    result.line = parseInt(match[2], 10);
    result.column = parseInt(match[3], 10);
    return result;
  }

  // Pattern 3: File: path/to/file.js
  const pattern3 = /File:\s*([^\s\n]+)/i;
  match = output.match(pattern3);
  if (match) {
    result.file = match[1];
  }

  // Pattern 4: in file.jsx (line X, column Y)
  const pattern4 = /in\s+([^\s(]+)\s*\((?:line\s+)?(\d+)/i;
  match = output.match(pattern4);
  if (match) {
    result.file = match[1];
    result.line = parseInt(match[2], 10);
  }

  return result;
}

function extractBuildErrorMessage(output) {
  // Look for the main error message in Next.js build output
  const patterns = [
    /Error:\s*(.+?)(?:\n\s*at|\n\n|$)/is,
    /failed to compile[.\s]*(.+?)(?:\n\n|$)/is,
    /Module not found:\s*(.+?)(?:\n|$)/i,
    /SyntaxError:\s*(.+?)(?:\n|$)/i,
    /TypeError:\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 500);
    }
  }

  // Fallback: first line with "error"
  const errorLine = output.split("\n").find((line) => /error/i.test(line));
  return errorLine?.trim() || "Build failed";
}

function generateBuildFixSuggestions(output, errorType) {
  const suggestions = [];

  switch (errorType) {
    case ERROR_TYPES.MODULE_NOT_FOUND:
      suggestions.push("Check if the import path is correct");
      suggestions.push("Ensure the module is installed in package.json");
      suggestions.push("Verify the file extension matches (.js, .jsx, etc.)");
      break;

    case ERROR_TYPES.SYNTAX:
      suggestions.push(
        "Check for missing brackets, parentheses, or semicolons"
      );
      suggestions.push("Ensure JSX is properly closed");
      suggestions.push("Check for invalid JavaScript syntax");
      break;

    case ERROR_TYPES.IMPORT:
      suggestions.push("Verify the export exists in the source file");
      suggestions.push("Check if using default vs named imports correctly");
      suggestions.push("Ensure the import path is correct");
      break;

    case ERROR_TYPES.TYPE_ERROR:
      suggestions.push("Check if the variable/function is defined");
      suggestions.push("Verify the correct method is being called");
      break;

    default:
      suggestions.push("Review the error message for specific details");
  }

  // Add context-specific suggestions
  if (output.includes("'use client'")) {
    suggestions.push(
      "Ensure 'use client' directive is at the top of the file if using hooks"
    );
  }

  if (output.includes("useState") || output.includes("useEffect")) {
    suggestions.push("React hooks require 'use client' directive in Next.js");
  }

  return suggestions;
}

function generateRuntimeFixSuggestions(output, errorType) {
  const suggestions = [];

  switch (errorType) {
    case ERROR_TYPES.HYDRATION:
      suggestions.push("Ensure server and client render the same content");
      suggestions.push(
        "Wrap browser-only code in useEffect or check typeof window"
      );
      suggestions.push("Avoid using Date.now() or Math.random() during render");
      break;

    case ERROR_TYPES.TYPE_ERROR:
      suggestions.push(
        "Check if the variable is defined before accessing properties"
      );
      suggestions.push("Verify the function exists before calling it");
      suggestions.push(
        "Use optional chaining (?.) for potentially undefined values"
      );
      break;

    case ERROR_TYPES.REFERENCE_ERROR:
      suggestions.push("Ensure the variable/function is defined in scope");
      suggestions.push("Check for typos in variable names");
      suggestions.push("Verify imports are correct");
      break;

    default:
      suggestions.push("Check the browser console for more details");
  }

  return suggestions;
}
