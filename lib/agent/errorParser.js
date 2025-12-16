// Error Parser Module
// Parses raw errors into structured format and generates fix prompts

import { ERROR_TYPES } from "./errorCapture.js";

/**
 * Parse a raw error into a structured format
 * @param {string} rawError - Raw error output
 * @param {string} type - Error type from ERROR_TYPES
 * @returns {Object} - Structured error object
 */
export function parseError(rawError, type = ERROR_TYPES.UNKNOWN) {
  const parsed = {
    type,
    raw: rawError,
    file: null,
    line: null,
    column: null,
    message: "",
    code: null,
    suggestion: "",
    context: [],
  };

  // Extract file, line, column from various patterns
  const fileInfo = extractFileLocation(rawError);
  parsed.file = fileInfo.file;
  parsed.line = fileInfo.line;
  parsed.column = fileInfo.column;

  // Extract main error message
  parsed.message = extractMainMessage(rawError, type);

  // Extract error code if present
  parsed.code = extractErrorCode(rawError);

  // Extract context lines if available
  parsed.context = extractContextLines(rawError);

  return parsed;
}

/**
 * Generate a prompt for the AI to fix an error
 * @param {Object} error - Structured error object
 * @param {Object} files - Current project files (path -> content)
 * @returns {string} - Fix prompt for AI
 */
export function generateFixPrompt(error, files = {}) {
  const parts = [];

  // Header
  parts.push("⚠️ ERROR DETECTED - FIX REQUIRED\n");
  parts.push(
    "The code you generated has an error. Please analyze and fix it.\n"
  );

  // Error details
  parts.push("## Error Details\n");
  parts.push(`**Type:** ${formatErrorType(error.type)}`);
  parts.push(`**Message:** ${error.message || "Unknown error"}`);

  if (error.file) {
    parts.push(`**File:** ${error.file}`);
  }
  if (error.line) {
    parts.push(
      `**Line:** ${error.line}${
        error.column ? `, Column: ${error.column}` : ""
      }`
    );
  }
  if (error.code) {
    parts.push(`**Error Code:** ${error.code}`);
  }

  // Show affected file content if available
  if (error.file && files[error.file]) {
    parts.push("\n## Affected File Content\n");
    const fileContent = files[error.file];
    const lines = fileContent.split("\n");

    // Show context around the error line
    if (error.line) {
      const startLine = Math.max(0, error.line - 5);
      const endLine = Math.min(lines.length, error.line + 5);
      const contextLines = lines.slice(startLine, endLine);

      parts.push("```javascript");
      contextLines.forEach((line, idx) => {
        const lineNum = startLine + idx + 1;
        const marker = lineNum === error.line ? ">>> " : "    ";
        parts.push(`${marker}${lineNum}: ${line}`);
      });
      parts.push("```");
    } else {
      // Show first 50 lines if no specific line
      parts.push("```javascript");
      parts.push(lines.slice(0, 50).join("\n"));
      if (lines.length > 50) parts.push("// ... (truncated)");
      parts.push("```");
    }
  }

  // Show raw error for additional context
  if (error.raw && error.raw.length < 1000) {
    parts.push("\n## Raw Error Output\n");
    parts.push("```");
    parts.push(error.raw);
    parts.push("```");
  }

  // Suggestions
  if (error.suggestions && error.suggestions.length > 0) {
    parts.push("\n## Possible Causes\n");
    error.suggestions.forEach((s) => parts.push(`- ${s}`));
  }

  // Instructions
  parts.push("\n## Instructions\n");
  parts.push("1. Analyze the error carefully");
  parts.push("2. Identify the root cause");
  parts.push(
    '3. Output ONLY the fixed file(s) using `<file path="...">...</file>` tags'
  );
  parts.push("4. Do NOT regenerate files that don't need changes");
  parts.push(
    "5. Do NOT include explanations before the fix - just output the fixed files"
  );
  parts.push(
    "6. After the files, briefly explain what was wrong and how you fixed it"
  );

  // Type-specific instructions
  const typeInstructions = getTypeSpecificInstructions(error.type);
  if (typeInstructions) {
    parts.push(`\n## ${formatErrorType(error.type)} Specific Notes\n`);
    parts.push(typeInstructions);
  }

  return parts.join("\n");
}

/**
 * Generate a compact error summary for logging
 * @param {Object} error - Structured error object
 * @returns {string} - One-line summary
 */
export function generateErrorSummary(error) {
  const parts = [];

  parts.push(`[${error.type.toUpperCase()}]`);

  if (error.file) {
    parts.push(error.file);
    if (error.line) {
      parts.push(`:${error.line}`);
    }
  }

  if (error.message) {
    const shortMsg = error.message.substring(0, 100);
    parts.push(`- ${shortMsg}${error.message.length > 100 ? "..." : ""}`);
  }

  return parts.join(" ");
}

/**
 * Check if an error is likely fixable by AI
 * @param {Object} error - Structured error object
 * @returns {boolean} - True if likely fixable
 */
export function isFixableError(error) {
  // Errors that are typically fixable by AI
  const fixableTypes = [
    ERROR_TYPES.SYNTAX,
    ERROR_TYPES.IMPORT,
    ERROR_TYPES.MODULE_NOT_FOUND,
    ERROR_TYPES.TYPE_ERROR,
    ERROR_TYPES.REFERENCE_ERROR,
    ERROR_TYPES.COMPILATION,
    ERROR_TYPES.HYDRATION,
  ];

  if (!fixableTypes.includes(error.type)) {
    return false;
  }

  // Check for unfixable patterns
  const unfixablePatterns = [
    /out of memory/i,
    /heap out of memory/i,
    /ENOMEM/i,
    /network error/i,
    /ECONNREFUSED/i,
    /timeout/i,
    /ETIMEOUT/i,
  ];

  const errorText = `${error.message} ${error.raw}`;
  for (const pattern of unfixablePatterns) {
    if (pattern.test(errorText)) {
      return false;
    }
  }

  return true;
}

/**
 * Determine if errors are related (same root cause)
 * @param {Object} error1 - First error
 * @param {Object} error2 - Second error
 * @returns {boolean} - True if likely related
 */
export function areErrorsRelated(error1, error2) {
  // Same file, same type
  if (error1.file === error2.file && error1.type === error2.type) {
    return true;
  }

  // Same error message
  if (error1.message === error2.message) {
    return true;
  }

  // Module not found for same module
  if (
    error1.type === ERROR_TYPES.MODULE_NOT_FOUND &&
    error2.type === ERROR_TYPES.MODULE_NOT_FOUND
  ) {
    const module1 = extractModuleName(error1.message);
    const module2 = extractModuleName(error2.message);
    if (module1 && module1 === module2) {
      return true;
    }
  }

  return false;
}

// ============ Helper Functions ============

function extractFileLocation(rawError) {
  const result = { file: null, line: null, column: null };

  // Patterns in order of specificity
  const patterns = [
    // Next.js style: ./app/page.jsx:10:5
    /\.\/([^\s:]+):(\d+):(\d+)/,
    // Stack trace: at Component (/path/file.js:10:5)
    /at\s+(?:[^\s]+\s+)?\(?([^\s:()]+):(\d+):(\d+)\)?/,
    // Webpack style: Module build failed ./file.js
    /Module.*failed.*\.\/([^\s:]+)/,
    // ESLint style: /path/file.js line 10
    /([^\s:]+\.(?:js|jsx|ts|tsx|mjs))\s+line\s+(\d+)/i,
    // Generic: file.js:10
    /([^\s:]+\.(?:js|jsx|ts|tsx|mjs)):(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = rawError.match(pattern);
    if (match) {
      // Clean up file path
      let file = match[1];
      // Remove absolute path prefix, keep relative
      file = file.replace(/^.*\/app\//, "app/");
      file = file.replace(/^.*\/src\//, "src/");
      file = file.replace(/^.*\/components\//, "components/");
      file = file.replace(/^.*\/lib\//, "lib/");

      result.file = file;
      result.line = match[2] ? parseInt(match[2], 10) : null;
      result.column = match[3] ? parseInt(match[3], 10) : null;
      break;
    }
  }

  return result;
}

function extractMainMessage(rawError, type) {
  // Type-specific extraction
  switch (type) {
    case ERROR_TYPES.NPM_INSTALL: {
      // npm ERR! message
      const npmMatch = rawError.match(/npm ERR!\s+(.+?)(?:\n|$)/);
      if (npmMatch) return npmMatch[1];
      break;
    }

    case ERROR_TYPES.MODULE_NOT_FOUND: {
      const modMatch = rawError.match(
        /(?:Module not found|Cannot find module)[:\s]*['"]?([^'"}\n]+)/i
      );
      if (modMatch) return `Cannot find module '${modMatch[1].trim()}'`;
      break;
    }

    case ERROR_TYPES.SYNTAX: {
      const synMatch = rawError.match(/SyntaxError:\s*(.+?)(?:\n|$)/i);
      if (synMatch) return synMatch[1];
      break;
    }

    case ERROR_TYPES.TYPE_ERROR: {
      const typeMatch = rawError.match(/TypeError:\s*(.+?)(?:\n|$)/i);
      if (typeMatch) return typeMatch[1];
      break;
    }

    case ERROR_TYPES.REFERENCE_ERROR: {
      const refMatch = rawError.match(/ReferenceError:\s*(.+?)(?:\n|$)/i);
      if (refMatch) return refMatch[1];
      break;
    }
  }

  // Generic extraction
  const genericPatterns = [
    /Error:\s*(.+?)(?:\n\s*at|\n\n|$)/is,
    /error[:\s]+(.+?)(?:\n|$)/i,
    /failed[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of genericPatterns) {
    const match = rawError.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 300);
    }
  }

  // Fallback: first meaningful line
  const lines = rawError.split("\n").filter((l) => l.trim().length > 0);
  return lines[0]?.substring(0, 200) || "Unknown error";
}

function extractErrorCode(rawError) {
  // Common error codes
  const patterns = [
    /\b(E[A-Z]+)\b/, // ENOENT, ERESOLVE, etc.
    /error code[:\s]*(\w+)/i,
    /\[(\w+-\d+)\]/, // [ERR-123]
  ];

  for (const pattern of patterns) {
    const match = rawError.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function extractContextLines(rawError) {
  const context = [];

  // Look for code snippets in error output
  // Pattern: line numbers with > or | markers
  const codeBlockPattern = /^\s*(\d+)\s*[|>]\s*(.*)$/gm;
  let match;
  while ((match = codeBlockPattern.exec(rawError))) {
    context.push({
      line: parseInt(match[1], 10),
      content: match[2],
    });
  }

  return context;
}

function extractModuleName(message) {
  const patterns = [
    /Cannot find module ['"]([^'"]+)['"]/,
    /Module not found[:\s]*['"]?([^\s'"]+)/i,
    /Can't resolve ['"]([^'"]+)['"]/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function formatErrorType(type) {
  const typeNames = {
    [ERROR_TYPES.NPM_INSTALL]: "NPM Install Error",
    [ERROR_TYPES.COMPILATION]: "Compilation Error",
    [ERROR_TYPES.RUNTIME]: "Runtime Error",
    [ERROR_TYPES.HYDRATION]: "Hydration Error",
    [ERROR_TYPES.IMPORT]: "Import Error",
    [ERROR_TYPES.SYNTAX]: "Syntax Error",
    [ERROR_TYPES.MODULE_NOT_FOUND]: "Module Not Found",
    [ERROR_TYPES.TYPE_ERROR]: "Type Error",
    [ERROR_TYPES.REFERENCE_ERROR]: "Reference Error",
    [ERROR_TYPES.UNKNOWN]: "Unknown Error",
  };

  return typeNames[type] || type;
}

function getTypeSpecificInstructions(type) {
  switch (type) {
    case ERROR_TYPES.MODULE_NOT_FOUND:
      return `- Check if the import path is correct (relative vs absolute)
- Verify the file extension (.js, .jsx, .mjs)
- If it's an npm package, add it to package.json dependencies
- If it's a local file, ensure the file exists at the specified path`;

    case ERROR_TYPES.SYNTAX:
      return `- Look for missing brackets, parentheses, or braces
- Check for unclosed strings or template literals
- Verify JSX tags are properly closed
- Ensure there are no stray characters`;

    case ERROR_TYPES.HYDRATION:
      return `- Ensure server and client render identical content
- Wrap browser-only code in useEffect or check typeof window !== 'undefined'
- Avoid dynamic content like Date.now() during initial render
- Use suppressHydrationWarning only as a last resort`;

    case ERROR_TYPES.IMPORT:
      return `- Verify the export name matches exactly (case-sensitive)
- Check if using default vs named import correctly
- Ensure the source file actually exports the requested item`;

    case ERROR_TYPES.NPM_INSTALL:
      return `- Check if the package name is spelled correctly
- Verify the package exists on npm
- If peer dependency issues, ensure compatible versions
- Add missing packages to dependencies in package.json`;

    default:
      return null;
  }
}
