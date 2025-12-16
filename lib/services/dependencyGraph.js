// File Dependency Graph Module
// Tracks import/export relationships between files for smart context selection

/**
 * Build a dependency graph from project files
 * @param {Object} files - File contents {path: content}
 * @returns {Object} - Dependency graph
 */
export function buildDependencyGraph(files) {
  const graph = {
    nodes: {}, // path -> { imports: [], exports: [], importedBy: [], pairedFiles: [] }
    edges: [], // { from, to, type }
  };

  const filePaths = Object.keys(files);

  // Initialize nodes
  for (const path of filePaths) {
    graph.nodes[path] = {
      path,
      imports: [],
      exports: [],
      importedBy: [],
      pairedFiles: [],
      type: getFileType(path),
    };
  }

  // Parse each file for imports/exports
  for (const path of filePaths) {
    const content = files[path];
    if (!content || typeof content !== "string") continue;

    const node = graph.nodes[path];

    // Parse imports
    const imports = parseImports(content, path, filePaths);
    node.imports = imports;

    // Add edges and reverse references
    for (const imp of imports) {
      graph.edges.push({
        from: path,
        to: imp.resolvedPath,
        type: "import",
        importType: imp.type,
      });

      // Add reverse reference
      if (graph.nodes[imp.resolvedPath]) {
        graph.nodes[imp.resolvedPath].importedBy.push(path);
      }
    }

    // Parse exports
    node.exports = parseExports(content);

    // Find paired files (JSX <-> SCSS)
    node.pairedFiles = findPairedFiles(path, filePaths);
  }

  return graph;
}

/**
 * Parse imports from file content
 * @param {string} content - File content
 * @param {string} currentPath - Current file path
 * @param {Array} allPaths - All file paths in project
 * @returns {Array} - Parsed imports
 */
function parseImports(content, currentPath, allPaths) {
  const imports = [];

  // ES6 imports: import X from 'Y'
  const es6ImportRegex =
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = es6ImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(importPath, currentPath, allPaths);

    imports.push({
      raw: importPath,
      resolvedPath: resolved,
      type: importPath.startsWith(".") ? "relative" : "package",
      isLocal: importPath.startsWith("."),
    });
  }

  // Dynamic imports: import('X')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(importPath, currentPath, allPaths);

    imports.push({
      raw: importPath,
      resolvedPath: resolved,
      type: "dynamic",
      isLocal: importPath.startsWith("."),
    });
  }

  // CommonJS require: require('X')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(importPath, currentPath, allPaths);

    imports.push({
      raw: importPath,
      resolvedPath: resolved,
      type: "require",
      isLocal: importPath.startsWith("."),
    });
  }

  // SCSS imports: @import 'X' or @use 'X'
  if (currentPath.endsWith(".scss") || currentPath.endsWith(".css")) {
    const scssImportRegex = /@(?:import|use)\s+['"]([^'"]+)['"]/g;
    while ((match = scssImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      const resolved = resolveImportPath(importPath, currentPath, allPaths);

      imports.push({
        raw: importPath,
        resolvedPath: resolved,
        type: "scss",
        isLocal: true,
      });
    }
  }

  return imports;
}

/**
 * Resolve an import path to actual file path
 * @param {string} importPath - Import path from code
 * @param {string} currentPath - Current file path
 * @param {Array} allPaths - All file paths in project
 * @returns {string} - Resolved file path
 */
function resolveImportPath(importPath, currentPath, allPaths) {
  // Non-relative imports (packages)
  if (!importPath.startsWith(".")) {
    return importPath; // Return as-is for packages
  }

  // Get directory of current file
  const currentDir = currentPath.split("/").slice(0, -1).join("/");

  // Resolve relative path
  const parts = importPath.split("/");
  const dirParts = currentDir ? currentDir.split("/") : [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      dirParts.pop();
    } else {
      dirParts.push(part);
    }
  }

  let resolved = dirParts.join("/");

  // Try different extensions
  const extensions = [
    ".jsx",
    ".js",
    ".mjs",
    ".scss",
    ".css",
    ".json",
    "/index.jsx",
    "/index.js",
  ];

  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (allPaths.includes(withExt)) {
      return withExt;
    }
  }

  // Check if exact path exists
  if (allPaths.includes(resolved)) {
    return resolved;
  }

  return resolved;
}

/**
 * Parse exports from file content
 * @param {string} content - File content
 * @returns {Array} - Parsed exports
 */
function parseExports(content) {
  const exports = [];

  // Named exports: export const/function/class X
  const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
  let match;

  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push({ name: match[1], type: "named" });
  }

  // Export list: export { X, Y }
  const exportListRegex = /export\s+\{([^}]+)\}/g;
  while ((match = exportListRegex.exec(content)) !== null) {
    const names = match[1].split(",").map((n) => n.trim().split(" ")[0]);
    for (const name of names) {
      if (name) exports.push({ name, type: "named" });
    }
  }

  // Default export
  if (/export\s+default/.test(content)) {
    exports.push({ name: "default", type: "default" });
  }

  // module.exports
  if (/module\.exports\s*=/.test(content)) {
    exports.push({ name: "module.exports", type: "commonjs" });
  }

  return exports;
}

/**
 * Find paired files (JSX <-> SCSS module)
 * @param {string} path - Current file path
 * @param {Array} allPaths - All file paths
 * @returns {Array} - Paired file paths
 */
function findPairedFiles(path, allPaths) {
  const paired = [];

  // JSX/JS -> SCSS
  if (path.endsWith(".jsx") || path.endsWith(".js")) {
    // Same directory: Component.jsx -> Component.module.scss
    const scssPath = path.replace(/\.(jsx|js)$/, ".module.scss");
    if (allPaths.includes(scssPath)) {
      paired.push(scssPath);
    }

    // Component folder: ComponentName/ComponentName.jsx -> ComponentName/ComponentName.module.scss
    const fileName = path
      .split("/")
      .pop()
      .replace(/\.(jsx|js)$/, "");
    const dirPath = path.split("/").slice(0, -1).join("/");
    const folderScssPath = `${dirPath}/${fileName}.module.scss`;
    if (allPaths.includes(folderScssPath) && !paired.includes(folderScssPath)) {
      paired.push(folderScssPath);
    }
  }

  // SCSS -> JSX/JS
  if (path.endsWith(".module.scss")) {
    const jsxPath = path.replace(".module.scss", ".jsx");
    const jsPath = path.replace(".module.scss", ".js");

    if (allPaths.includes(jsxPath)) {
      paired.push(jsxPath);
    }
    if (allPaths.includes(jsPath)) {
      paired.push(jsPath);
    }
  }

  return paired;
}

/**
 * Get file type from path
 * @param {string} path - File path
 * @returns {string} - File type
 */
function getFileType(path) {
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "javascript";
  if (path.endsWith(".scss")) return "scss";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "other";
}

/**
 * Get files that depend on a given file (importedBy + reverse dependencies)
 * @param {Object} graph - Dependency graph
 * @param {string} path - File path
 * @param {number} depth - Max depth to search
 * @returns {Array} - Dependent file paths
 */
export function getDependentFiles(graph, path, depth = 2) {
  const node = graph.nodes[path];
  if (!node) return [];

  const dependents = new Set();
  const visited = new Set();

  function traverse(currentPath, currentDepth) {
    if (currentDepth > depth || visited.has(currentPath)) return;
    visited.add(currentPath);

    const currentNode = graph.nodes[currentPath];
    if (!currentNode) return;

    for (const dep of currentNode.importedBy) {
      dependents.add(dep);
      traverse(dep, currentDepth + 1);
    }
  }

  traverse(path, 0);
  return Array.from(dependents);
}

/**
 * Get files that a given file depends on (imports)
 * @param {Object} graph - Dependency graph
 * @param {string} path - File path
 * @param {number} depth - Max depth to search
 * @returns {Array} - Dependency file paths
 */
export function getDependencies(graph, path, depth = 2) {
  const node = graph.nodes[path];
  if (!node) return [];

  const dependencies = new Set();
  const visited = new Set();

  function traverse(currentPath, currentDepth) {
    if (currentDepth > depth || visited.has(currentPath)) return;
    visited.add(currentPath);

    const currentNode = graph.nodes[currentPath];
    if (!currentNode) return;

    for (const imp of currentNode.imports) {
      if (imp.isLocal && graph.nodes[imp.resolvedPath]) {
        dependencies.add(imp.resolvedPath);
        traverse(imp.resolvedPath, currentDepth + 1);
      }
    }
  }

  traverse(path, 0);
  return Array.from(dependencies);
}

/**
 * Get related files (dependencies, dependents, paired)
 * @param {Object} graph - Dependency graph
 * @param {string} path - File path
 * @returns {Object} - Related files grouped by relationship
 */
export function getRelatedFiles(graph, path) {
  const node = graph.nodes[path];
  if (!node) return { imports: [], importedBy: [], paired: [] };

  return {
    imports: node.imports.filter((i) => i.isLocal).map((i) => i.resolvedPath),
    importedBy: node.importedBy,
    paired: node.pairedFiles,
    all: [
      ...new Set([
        ...node.imports.filter((i) => i.isLocal).map((i) => i.resolvedPath),
        ...node.importedBy,
        ...node.pairedFiles,
      ]),
    ],
  };
}

/**
 * Find heavily imported files (potential shared utilities)
 * @param {Object} graph - Dependency graph
 * @param {number} threshold - Minimum import count
 * @returns {Array} - Heavily imported file paths with counts
 */
export function findHeavilyImportedFiles(graph, threshold = 3) {
  const results = [];

  for (const [path, node] of Object.entries(graph.nodes)) {
    if (node.importedBy.length >= threshold) {
      results.push({
        path,
        importCount: node.importedBy.length,
        importedBy: node.importedBy,
      });
    }
  }

  return results.sort((a, b) => b.importCount - a.importCount);
}

/**
 * Check if editing a file might have wide impact
 * @param {Object} graph - Dependency graph
 * @param {string} path - File to check
 * @returns {Object} - Impact assessment
 */
export function assessEditImpact(graph, path) {
  const node = graph.nodes[path];
  if (!node) {
    return { exists: false };
  }

  const dependentCount = node.importedBy.length;
  const allDependents = getDependentFiles(graph, path, 3);

  return {
    exists: true,
    directDependents: dependentCount,
    totalAffected: allDependents.length,
    isHighImpact: dependentCount >= 3 || allDependents.length >= 5,
    affectedFiles: allDependents,
    recommendation:
      dependentCount >= 5
        ? "High impact - changes may break multiple files"
        : dependentCount >= 2
        ? "Medium impact - verify dependent files after changes"
        : "Low impact - safe to modify",
  };
}
