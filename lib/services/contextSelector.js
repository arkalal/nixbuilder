// AI-Powered Context Selection Module
// Intelligently selects relevant files for each request

import {
  buildDependencyGraph,
  getRelatedFiles,
  assessEditImpact,
} from "./dependencyGraph.js";

// Files to always include if they exist
const ALWAYS_INCLUDE = ["package.json", "app/layout.jsx", "app/globals.scss"];

// Files to never include in context (too large or not useful)
const NEVER_INCLUDE = ["package-lock.json", "node_modules", ".git", ".next"];

// Max files to include in context
const MAX_CONTEXT_FILES = 10;

// Max total characters for context (to prevent token overflow)
const MAX_CONTEXT_CHARS = 50000;

/**
 * Select relevant files for context based on user message
 * @param {string} message - User's message
 * @param {Object} files - All project files {path: content}
 * @param {Object} options - Selection options
 * @returns {Object} - Selected files and metadata
 */
export function selectContextFiles(message, files, options = {}) {
  const {
    maxFiles = MAX_CONTEXT_FILES,
    maxChars = MAX_CONTEXT_CHARS,
    includeGraph = true,
  } = options;

  const filePaths = Object.keys(files).filter(
    (p) => !NEVER_INCLUDE.some((n) => p.includes(n))
  );

  // Build dependency graph for relationship analysis
  const graph = includeGraph ? buildDependencyGraph(files) : null;

  // Score each file based on relevance
  const scored = filePaths.map((path) => ({
    path,
    score: calculateRelevanceScore(path, message, files[path], graph),
    size: (files[path] || "").length,
  }));

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Select files within limits
  const selected = [];
  let totalChars = 0;

  // Always include essential files first
  for (const path of ALWAYS_INCLUDE) {
    if (files[path] && totalChars + files[path].length < maxChars) {
      selected.push(path);
      totalChars += files[path].length;
    }
  }

  // Add scored files
  for (const item of scored) {
    if (selected.length >= maxFiles) break;
    if (totalChars + item.size > maxChars) continue;
    if (selected.includes(item.path)) continue;

    selected.push(item.path);
    totalChars += item.size;

    // Also add paired files (JSX <-> SCSS)
    if (graph) {
      const related = getRelatedFiles(graph, item.path);
      for (const paired of related.paired) {
        if (
          !selected.includes(paired) &&
          selected.length < maxFiles &&
          totalChars + (files[paired] || "").length < maxChars
        ) {
          selected.push(paired);
          totalChars += (files[paired] || "").length;
        }
      }
    }
  }

  return {
    selected,
    totalFiles: selected.length,
    totalChars,
    allFiles: filePaths,
    scores: scored.slice(0, 20), // Top 20 for debugging
  };
}

/**
 * Calculate relevance score for a file
 * @param {string} path - File path
 * @param {string} message - User message
 * @param {string} content - File content
 * @param {Object} graph - Dependency graph
 * @returns {number} - Relevance score
 */
function calculateRelevanceScore(path, message, content, graph) {
  let score = 0;
  const messageLower = message.toLowerCase();
  const pathLower = path.toLowerCase();

  // 1. File name mentioned in message (highest weight)
  const fileName = path
    .split("/")
    .pop()
    .replace(/\.(jsx|js|scss|css|json)$/, "");
  if (messageLower.includes(fileName.toLowerCase())) {
    score += 100;
  }

  // 2. Path segment mentioned
  const pathSegments = path.split("/");
  for (const segment of pathSegments) {
    if (messageLower.includes(segment.toLowerCase()) && segment.length > 2) {
      score += 30;
    }
  }

  // 3. Keywords in message match file purpose
  const keywords = extractKeywords(message);
  for (const keyword of keywords) {
    if (pathLower.includes(keyword)) {
      score += 20;
    }
    if (content && content.toLowerCase().includes(keyword)) {
      score += 5;
    }
  }

  // 4. File type relevance
  if (messageLower.includes("style") || messageLower.includes("css")) {
    if (path.endsWith(".scss") || path.endsWith(".css")) {
      score += 50;
    }
  }

  if (messageLower.includes("component")) {
    if (path.includes("components/")) {
      score += 40;
    }
  }

  if (messageLower.includes("page") || messageLower.includes("route")) {
    if (path.includes("app/") && path.endsWith(".jsx")) {
      score += 40;
    }
  }

  if (messageLower.includes("api") || messageLower.includes("backend")) {
    if (path.includes("/api/")) {
      score += 50;
    }
  }

  if (messageLower.includes("auth") || messageLower.includes("login")) {
    if (
      path.includes("auth") ||
      path.includes("login") ||
      path.includes("signup")
    ) {
      score += 60;
    }
  }

  // 5. Entry points get bonus
  if (path === "app/page.jsx" || path === "app/layout.jsx") {
    score += 25;
  }

  // 6. Recently referenced components in content
  if (content && graph) {
    const node = graph.nodes[path];
    if (node && node.importedBy.length > 0) {
      score += node.importedBy.length * 5; // More widely used = more important
    }
  }

  // 7. Config files get base score
  if (
    path === "package.json" ||
    path === "next.config.mjs" ||
    path === "jsconfig.json"
  ) {
    score += 15;
  }

  return score;
}

/**
 * Extract relevant keywords from user message
 * @param {string} message - User message
 * @returns {Array} - Keywords
 */
function extractKeywords(message) {
  // Common words to ignore
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "and",
    "but",
    "if",
    "or",
    "because",
    "until",
    "while",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "it",
    "its",
    "they",
    "them",
    "their",
    "what",
    "which",
    "who",
    "whom",
    "make",
    "add",
    "create",
    "update",
    "change",
    "fix",
    "modify",
    "please",
    "want",
    "need",
    "like",
    "also",
    "new",
    "file",
  ]);

  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Get context string for AI prompt
 * @param {Object} files - All project files
 * @param {Array} selectedPaths - Selected file paths
 * @returns {string} - Formatted context string
 */
export function formatContext(files, selectedPaths) {
  const parts = [];

  parts.push(`CONTEXT FILES (${selectedPaths.length} files):`);
  parts.push("=".repeat(50));

  for (const path of selectedPaths) {
    const content = files[path];
    if (!content) continue;

    parts.push(`\n--- ${path} ---`);
    parts.push(content);
  }

  return parts.join("\n");
}

/**
 * Get files that should be checked after an edit
 * @param {Object} graph - Dependency graph
 * @param {Array} editedPaths - Paths of edited files
 * @returns {Array} - Paths to verify
 */
export function getFilesToVerify(graph, editedPaths) {
  const toVerify = new Set();

  for (const path of editedPaths) {
    // Add the file itself
    toVerify.add(path);

    // Add files that import this file
    const node = graph.nodes[path];
    if (node) {
      for (const importer of node.importedBy) {
        toVerify.add(importer);
      }

      // Add paired files
      for (const paired of node.pairedFiles) {
        toVerify.add(paired);
      }
    }
  }

  return Array.from(toVerify);
}

/**
 * Suggest files that might need attention based on edit
 * @param {Object} graph - Dependency graph
 * @param {string} editedPath - Path being edited
 * @param {string} editDescription - Description of the edit
 * @returns {Object} - Suggestions
 */
export function suggestRelatedEdits(graph, editedPath, editDescription) {
  const suggestions = [];
  const impact = assessEditImpact(graph, editedPath);

  // Check if editing a widely-used file
  if (impact.isHighImpact) {
    suggestions.push({
      type: "warning",
      message: `This file is imported by ${impact.directDependents} other files. Changes may have wide impact.`,
      affectedFiles: impact.affectedFiles.slice(0, 5),
    });
  }

  // Check for paired files
  const node = graph.nodes[editedPath];
  if (node && node.pairedFiles.length > 0) {
    suggestions.push({
      type: "reminder",
      message: `This file has paired style/component files that may need updates.`,
      files: node.pairedFiles,
    });
  }

  // Check if editing styles might affect multiple components
  if (editedPath.endsWith(".scss") || editedPath.endsWith(".css")) {
    if (editedPath.includes("globals") || editedPath.includes("variables")) {
      suggestions.push({
        type: "warning",
        message: "Editing global styles may affect the entire application.",
      });
    }
  }

  return {
    impact,
    suggestions,
    shouldProceed: !impact.isHighImpact || suggestions.length === 0,
  };
}
