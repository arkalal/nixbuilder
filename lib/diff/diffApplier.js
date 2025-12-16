// Diff Applier Module
// Applies parsed diff operations to files with fuzzy matching and rollback support

import { EDIT_FORMATS } from "./diffParser.js";

/**
 * Apply edits to files
 * @param {Array} edits - Parsed edit operations
 * @param {Object} files - Current file contents {path: content}
 * @param {Object} options - Apply options
 * @returns {Object} - Result with updated files and any errors
 */
export function applyEdits(edits, files, options = {}) {
  const {
    fuzzyMatch = true,
    fuzzyThreshold = 0.8,
    preserveOnError = true,
    createBackup = true,
  } = options;

  const result = {
    success: true,
    updatedFiles: { ...files },
    backup: createBackup ? { ...files } : null,
    applied: [],
    failed: [],
    warnings: [],
  };

  for (const edit of edits) {
    try {
      const applyResult = applySingleEdit(edit, result.updatedFiles, {
        fuzzyMatch,
        fuzzyThreshold,
      });

      if (applyResult.success) {
        result.updatedFiles[edit.filePath] = applyResult.content;
        result.applied.push({
          filePath: edit.filePath,
          type: edit.type,
          ...applyResult.metadata,
        });
      } else {
        result.failed.push({
          filePath: edit.filePath,
          type: edit.type,
          error: applyResult.error,
        });

        if (!preserveOnError) {
          result.success = false;
          break;
        }
      }

      if (applyResult.warnings) {
        result.warnings.push(...applyResult.warnings);
      }
    } catch (error) {
      result.failed.push({
        filePath: edit.filePath,
        type: edit.type,
        error: error.message,
      });

      if (!preserveOnError) {
        result.success = false;
        break;
      }
    }
  }

  // If any failed, mark overall as partial success
  if (result.failed.length > 0 && result.applied.length > 0) {
    result.success = "partial";
  } else if (result.failed.length > 0) {
    result.success = false;
  }

  return result;
}

/**
 * Apply a single edit operation
 * @param {Object} edit - Edit operation
 * @param {Object} files - Current file contents
 * @param {Object} options - Apply options
 * @returns {Object} - Result with new content or error
 */
function applySingleEdit(edit, files, options) {
  const currentContent = files[edit.filePath] || "";

  switch (edit.type) {
    case "search_replace":
      return applySearchReplace(edit, currentContent, options);

    case "unified_diff":
      return applyUnifiedDiff(edit, currentContent, options);

    case "patch":
      return applyPatch(edit, currentContent, options);

    case "full_file":
      return {
        success: true,
        content: edit.content,
        metadata: { method: "full_replace" },
      };

    default:
      return {
        success: false,
        error: `Unknown edit type: ${edit.type}`,
      };
  }
}

/**
 * Apply search/replace edit
 * @param {Object} edit - Search/replace edit
 * @param {string} content - Current file content
 * @param {Object} options - Apply options
 * @returns {Object} - Result
 */
function applySearchReplace(edit, content, options) {
  const { fuzzyMatch, fuzzyThreshold } = options;

  // Handle new file creation
  if (edit.isNewFile || !content) {
    return {
      success: true,
      content: edit.replace,
      metadata: { method: "new_file" },
    };
  }

  // Handle file deletion
  if (edit.isDelete) {
    return {
      success: true,
      content: null, // Signal to delete
      metadata: { method: "delete" },
    };
  }

  // Try exact match first
  if (content.includes(edit.search)) {
    const newContent = content.replace(edit.search, edit.replace);
    return {
      success: true,
      content: newContent,
      metadata: { method: "exact_match" },
    };
  }

  // Try fuzzy match if enabled
  if (fuzzyMatch) {
    const fuzzyResult = fuzzySearchReplace(
      content,
      edit.search,
      edit.replace,
      fuzzyThreshold
    );

    if (fuzzyResult.found) {
      return {
        success: true,
        content: fuzzyResult.content,
        metadata: {
          method: "fuzzy_match",
          similarity: fuzzyResult.similarity,
        },
        warnings: [
          `Fuzzy match used for ${edit.filePath} (${Math.round(
            fuzzyResult.similarity * 100
          )}% similarity)`,
        ],
      };
    }
  }

  // No match found
  return {
    success: false,
    error: `Could not find matching content in ${edit.filePath}`,
  };
}

/**
 * Fuzzy search and replace
 * @param {string} content - File content
 * @param {string} search - Search pattern
 * @param {string} replace - Replacement
 * @param {number} threshold - Minimum similarity threshold
 * @returns {Object} - Result with new content or not found
 */
function fuzzySearchReplace(content, search, replace, threshold) {
  const searchLines = search.split("\n");
  const contentLines = content.split("\n");

  // Normalize whitespace for comparison
  const normalizeWs = (s) => s.replace(/\s+/g, " ").trim();
  const normalizedSearch = searchLines.map(normalizeWs);

  // Sliding window search
  let bestMatch = null;
  let bestSimilarity = 0;
  let bestStartLine = -1;

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const windowLines = contentLines.slice(i, i + searchLines.length);
    const normalizedWindow = windowLines.map(normalizeWs);

    // Calculate similarity
    let matchingLines = 0;
    for (let j = 0; j < searchLines.length; j++) {
      if (normalizedSearch[j] === normalizedWindow[j]) {
        matchingLines++;
      } else {
        // Check Levenshtein-based similarity for non-exact matches
        const lineSim = calculateLineSimilarity(
          normalizedSearch[j],
          normalizedWindow[j]
        );
        if (lineSim > 0.8) {
          matchingLines += lineSim;
        }
      }
    }

    const similarity = matchingLines / searchLines.length;

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = windowLines;
      bestStartLine = i;
    }
  }

  if (bestSimilarity >= threshold && bestStartLine >= 0) {
    // Apply replacement
    const before = contentLines.slice(0, bestStartLine);
    const after = contentLines.slice(bestStartLine + searchLines.length);
    const replaceLines = replace.split("\n");

    const newContent = [...before, ...replaceLines, ...after].join("\n");

    return {
      found: true,
      content: newContent,
      similarity: bestSimilarity,
    };
  }

  return { found: false };
}

/**
 * Calculate similarity between two lines
 * @param {string} a - First line
 * @param {string} b - Second line
 * @returns {number} - Similarity score 0-1
 */
function calculateLineSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  // Simple character-based similarity
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++;
    }
  }

  return matches / longer.length;
}

/**
 * Apply unified diff
 * @param {Object} edit - Unified diff edit
 * @param {string} content - Current file content
 * @param {Object} options - Apply options
 * @returns {Object} - Result
 */
function applyUnifiedDiff(edit, content, options) {
  // Handle new file
  if (edit.isNewFile) {
    const newLines = [];
    for (const hunk of edit.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add" || line.type === "context") {
          newLines.push(line.content);
        }
      }
    }
    return {
      success: true,
      content: newLines.join("\n"),
      metadata: { method: "new_file" },
    };
  }

  // Handle delete
  if (edit.isDelete) {
    return {
      success: true,
      content: null,
      metadata: { method: "delete" },
    };
  }

  const contentLines = content.split("\n");
  let result = [...contentLines];
  let offset = 0; // Track line number shifts from previous hunks

  for (const hunk of edit.hunks) {
    const startLine = hunk.oldStart - 1 + offset; // Convert to 0-indexed

    // Find the actual position using context matching
    const actualStart = findHunkPosition(
      result,
      hunk,
      startLine,
      options.fuzzyMatch
    );

    if (actualStart === -1) {
      return {
        success: false,
        error: `Could not find hunk position at line ${hunk.oldStart}`,
      };
    }

    // Apply the hunk
    const newLines = [];
    let removeCount = 0;

    for (const line of hunk.lines) {
      if (line.type === "add") {
        newLines.push(line.content);
      } else if (line.type === "remove") {
        removeCount++;
      } else if (line.type === "context") {
        newLines.push(line.content);
      }
    }

    // Replace the lines
    result.splice(actualStart, hunk.oldCount, ...newLines);

    // Update offset for next hunk
    offset += newLines.length - hunk.oldCount;
  }

  return {
    success: true,
    content: result.join("\n"),
    metadata: { method: "unified_diff", hunksApplied: edit.hunks.length },
  };
}

/**
 * Find the actual position of a hunk in the file
 * @param {Array} lines - File lines
 * @param {Object} hunk - Hunk to find
 * @param {number} expectedStart - Expected start line
 * @param {boolean} fuzzy - Use fuzzy matching
 * @returns {number} - Actual start line or -1 if not found
 */
function findHunkPosition(lines, hunk, expectedStart, fuzzy) {
  // Get context lines from hunk
  const contextLines = hunk.lines
    .filter((l) => l.type === "context" || l.type === "remove")
    .map((l) => l.content);

  if (contextLines.length === 0) {
    return expectedStart;
  }

  // Try exact position first
  if (matchesAtPosition(lines, contextLines, expectedStart)) {
    return expectedStart;
  }

  if (!fuzzy) {
    return -1;
  }

  // Search nearby (+/- 50 lines)
  const searchRadius = 50;
  for (let delta = 1; delta <= searchRadius; delta++) {
    if (
      expectedStart - delta >= 0 &&
      matchesAtPosition(lines, contextLines, expectedStart - delta)
    ) {
      return expectedStart - delta;
    }
    if (
      expectedStart + delta < lines.length &&
      matchesAtPosition(lines, contextLines, expectedStart + delta)
    ) {
      return expectedStart + delta;
    }
  }

  return -1;
}

/**
 * Check if context matches at a position
 * @param {Array} lines - File lines
 * @param {Array} contextLines - Expected context lines
 * @param {number} position - Position to check
 * @returns {boolean} - Whether it matches
 */
function matchesAtPosition(lines, contextLines, position) {
  if (position + contextLines.length > lines.length) {
    return false;
  }

  for (let i = 0; i < contextLines.length; i++) {
    const fileLine = lines[position + i] || "";
    const contextLine = contextLines[i];

    // Normalize whitespace for comparison
    if (fileLine.trim() !== contextLine.trim()) {
      return false;
    }
  }

  return true;
}

/**
 * Apply patch format
 * @param {Object} edit - Patch edit
 * @param {string} content - Current file content
 * @param {Object} options - Apply options
 * @returns {Object} - Result
 */
function applyPatch(edit, content, options) {
  // Handle new file
  if (edit.isNewFile) {
    const newLines = [];
    for (const change of edit.changes) {
      for (const line of change.lines) {
        if (line.type === "add") {
          newLines.push(line.content);
        }
      }
    }
    return {
      success: true,
      content: newLines.join("\n"),
      metadata: { method: "new_file" },
    };
  }

  // Handle delete
  if (edit.isDelete) {
    return {
      success: true,
      content: null,
      metadata: { method: "delete" },
    };
  }

  let result = content;

  for (const change of edit.changes) {
    // Use context to find the location
    if (change.context) {
      // Find the context in the file
      const contextIndex = result.indexOf(change.context);
      if (contextIndex === -1 && !options.fuzzyMatch) {
        return {
          success: false,
          error: `Could not find context: ${change.context}`,
        };
      }
    }

    // Apply line changes
    for (const line of change.lines) {
      if (line.type === "remove") {
        result = result.replace(line.content + "\n", "");
        result = result.replace(line.content, ""); // Last line without newline
      } else if (line.type === "add") {
        // This is simplified - real implementation would need position tracking
      }
    }
  }

  return {
    success: true,
    content: result,
    metadata: { method: "patch" },
  };
}

/**
 * Rollback applied edits
 * @param {Object} result - Apply result with backup
 * @returns {Object} - Original files
 */
export function rollback(result) {
  if (!result.backup) {
    throw new Error("No backup available for rollback");
  }
  return result.backup;
}

/**
 * Get a summary of applied edits
 * @param {Object} result - Apply result
 * @returns {string} - Human-readable summary
 */
export function getEditSummary(result) {
  const lines = [];

  if (result.applied.length > 0) {
    lines.push(`✅ Applied ${result.applied.length} edit(s):`);
    for (const edit of result.applied) {
      lines.push(`  - ${edit.filePath} (${edit.method})`);
    }
  }

  if (result.failed.length > 0) {
    lines.push(`❌ Failed ${result.failed.length} edit(s):`);
    for (const edit of result.failed) {
      lines.push(`  - ${edit.filePath}: ${edit.error}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`⚠️ Warnings:`);
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}
