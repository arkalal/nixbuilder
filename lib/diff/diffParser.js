// Diff Parser Module
// Parses AI-generated edit instructions into structured diff objects

/**
 * Edit format types supported
 */
export const EDIT_FORMATS = {
  SEARCH_REPLACE: "search_replace", // <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
  UNIFIED_DIFF: "unified_diff", // Standard unified diff format
  FILE_BLOCK: "file_block", // <file path="...">content</file> (current format)
  PATCH: "patch", // *** Begin Patch format
};

/**
 * Parse AI response to extract edit operations
 * Supports multiple formats and auto-detects the format used
 * @param {string} response - Raw AI response text
 * @returns {Object} - Parsed edits with format and operations
 */
export function parseEdits(response) {
  // Detect format
  const format = detectEditFormat(response);

  switch (format) {
    case EDIT_FORMATS.SEARCH_REPLACE:
      return {
        format,
        edits: parseSearchReplaceBlocks(response),
      };
    case EDIT_FORMATS.UNIFIED_DIFF:
      return {
        format,
        edits: parseUnifiedDiff(response),
      };
    case EDIT_FORMATS.PATCH:
      return {
        format,
        edits: parsePatchFormat(response),
      };
    case EDIT_FORMATS.FILE_BLOCK:
    default:
      return {
        format: EDIT_FORMATS.FILE_BLOCK,
        edits: parseFileBlocks(response),
      };
  }
}

/**
 * Detect which edit format is used in the response
 * @param {string} response - Raw AI response
 * @returns {string} - Detected format type
 */
export function detectEditFormat(response) {
  // Check for search/replace blocks
  if (
    response.includes("<<<<<<< SEARCH") &&
    response.includes(">>>>>>> REPLACE")
  ) {
    return EDIT_FORMATS.SEARCH_REPLACE;
  }

  // Check for unified diff
  if (
    response.includes("--- ") &&
    response.includes("+++ ") &&
    response.includes("@@ ")
  ) {
    return EDIT_FORMATS.UNIFIED_DIFF;
  }

  // Check for patch format
  if (
    response.includes("*** Begin Patch") ||
    response.includes("*** Update File:")
  ) {
    return EDIT_FORMATS.PATCH;
  }

  // Default to file block format
  return EDIT_FORMATS.FILE_BLOCK;
}

/**
 * Parse search/replace block format (Aider-style)
 * Format:
 * path/to/file.js
 * <<<<<<< SEARCH
 * old code
 * =======
 * new code
 * >>>>>>> REPLACE
 *
 * @param {string} response - AI response
 * @returns {Array} - Array of edit operations
 */
export function parseSearchReplaceBlocks(response) {
  const edits = [];

  // Regex to match search/replace blocks with file path
  const blockRegex =
    /([^\n]+)\n<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

  let match;
  while ((match = blockRegex.exec(response)) !== null) {
    const filePath = match[1].trim();
    const searchContent = match[2];
    const replaceContent = match[3];

    // Skip if file path looks invalid
    if (!filePath || filePath.startsWith("<") || filePath.startsWith("#")) {
      continue;
    }

    edits.push({
      type: "search_replace",
      filePath: normalizeFilePath(filePath),
      search: searchContent,
      replace: replaceContent,
      isNewFile: searchContent.trim() === "",
      isDelete: replaceContent.trim() === "" && searchContent.trim() !== "",
    });
  }

  return edits;
}

/**
 * Parse unified diff format
 * @param {string} response - AI response
 * @returns {Array} - Array of edit operations
 */
export function parseUnifiedDiff(response) {
  const edits = [];

  // Match diff blocks
  const diffBlockRegex =
    /--- ([^\n]+)\n\+\+\+ ([^\n]+)\n((?:@@ [^\n]+\n(?:[+ -].*\n?)*)+)/g;

  let match;
  while ((match = diffBlockRegex.exec(response)) !== null) {
    const oldFile = match[1].trim();
    const newFile = match[2].trim();
    const hunks = match[3];

    // Parse hunks
    const hunkRegex =
      /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)\n([\s\S]*?)(?=@@|$)/g;
    const parsedHunks = [];

    let hunkMatch;
    while ((hunkMatch = hunkRegex.exec(hunks)) !== null) {
      const oldStart = parseInt(hunkMatch[1], 10);
      const oldCount = parseInt(hunkMatch[2] || "1", 10);
      const newStart = parseInt(hunkMatch[3], 10);
      const newCount = parseInt(hunkMatch[4] || "1", 10);
      const context = hunkMatch[5] || "";
      const lines = hunkMatch[6];

      parsedHunks.push({
        oldStart,
        oldCount,
        newStart,
        newCount,
        context: context.trim(),
        lines: parseHunkLines(lines),
      });
    }

    edits.push({
      type: "unified_diff",
      filePath: normalizeFilePath(newFile !== "/dev/null" ? newFile : oldFile),
      oldFile: normalizeFilePath(oldFile),
      newFile: normalizeFilePath(newFile),
      hunks: parsedHunks,
      isNewFile: oldFile === "/dev/null",
      isDelete: newFile === "/dev/null",
    });
  }

  return edits;
}

/**
 * Parse hunk lines into add/remove/context operations
 * @param {string} lines - Hunk content
 * @returns {Array} - Parsed line operations
 */
function parseHunkLines(lines) {
  const result = [];
  const lineArray = lines.split("\n");

  for (const line of lineArray) {
    if (!line) continue;

    const prefix = line[0];
    const content = line.substring(1);

    if (prefix === "+") {
      result.push({ type: "add", content });
    } else if (prefix === "-") {
      result.push({ type: "remove", content });
    } else if (prefix === " ") {
      result.push({ type: "context", content });
    }
  }

  return result;
}

/**
 * Parse OpenAI patch format
 * @param {string} response - AI response
 * @returns {Array} - Array of edit operations
 */
export function parsePatchFormat(response) {
  const edits = [];

  // Extract patch blocks
  const patchRegex =
    /\*\*\* (?:Begin Patch|Update File): ([^\n]+)\n([\s\S]*?)(?=\*\*\* (?:End Patch|Update File)|$)/g;

  let match;
  while ((match = patchRegex.exec(response)) !== null) {
    const filePath = match[1].trim();
    const patchContent = match[2];

    // Parse the patch content for changes
    const changes = [];
    const lines = patchContent.split("\n");

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Look for context line starting with @@
      if (line.startsWith("@@")) {
        const contextMatch = line.match(/@@ (.+)/);
        const context = contextMatch ? contextMatch[1] : "";

        // Collect changes until next @@ or end
        const changeLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("@@")) {
          changeLines.push(lines[i]);
          i++;
        }

        changes.push({
          context,
          lines: changeLines.map((l) => {
            if (l.startsWith("-"))
              return { type: "remove", content: l.substring(1) };
            if (l.startsWith("+"))
              return { type: "add", content: l.substring(1) };
            return { type: "context", content: l };
          }),
        });
      } else {
        i++;
      }
    }

    edits.push({
      type: "patch",
      filePath: normalizeFilePath(filePath),
      changes,
      isNewFile: patchContent.includes("*** New File"),
      isDelete: patchContent.includes("*** Delete File"),
    });
  }

  return edits;
}

/**
 * Parse file block format (current NixBuilder format)
 * <file path="path/to/file.jsx">content</file>
 * @param {string} response - AI response
 * @returns {Array} - Array of edit operations
 */
export function parseFileBlocks(response) {
  const edits = [];
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;

  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();

    edits.push({
      type: "full_file",
      filePath: normalizeFilePath(filePath),
      content,
      isNewFile: true, // Assume new/full replacement
      isDelete: false,
    });
  }

  return edits;
}

/**
 * Normalize file path
 * @param {string} path - File path
 * @returns {string} - Normalized path
 */
function normalizeFilePath(path) {
  // Remove common prefixes
  let normalized = path
    .replace(/^a\//, "")
    .replace(/^b\//, "")
    .replace(/^\/home\/project\//, "")
    .replace(/^\.\//, "")
    .trim();

  return normalized;
}

/**
 * Validate parsed edits
 * @param {Array} edits - Parsed edit operations
 * @returns {Object} - Validation result
 */
export function validateEdits(edits) {
  const errors = [];
  const warnings = [];

  for (const edit of edits) {
    // Check for empty file path
    if (!edit.filePath) {
      errors.push({
        edit,
        message: "Edit missing file path",
      });
      continue;
    }

    // Check for suspicious file paths
    if (edit.filePath.includes("..") || edit.filePath.startsWith("/")) {
      warnings.push({
        edit,
        message: `Suspicious file path: ${edit.filePath}`,
      });
    }

    // For search/replace, check if search content is provided
    if (edit.type === "search_replace" && !edit.search && !edit.isNewFile) {
      errors.push({
        edit,
        message: "Search/replace edit missing search content",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Group edits by file path
 * @param {Array} edits - Parsed edit operations
 * @returns {Object} - Edits grouped by file path
 */
export function groupEditsByFile(edits) {
  const grouped = {};

  for (const edit of edits) {
    if (!grouped[edit.filePath]) {
      grouped[edit.filePath] = [];
    }
    grouped[edit.filePath].push(edit);
  }

  return grouped;
}
