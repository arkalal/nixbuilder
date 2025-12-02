/**
 * JSX/JavaScript Syntax Validator and Auto-Fixer
 * Uses acorn parser to properly validate and fix incomplete code
 */

import * as acorn from "acorn";
import jsx from "acorn-jsx";

// Create JSX parser
const Parser = acorn.Parser.extend(jsx());

/**
 * Validate if JavaScript/JSX code is syntactically valid
 * @param {string} code - The code to validate
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateJSX(code) {
  try {
    Parser.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Count braces/brackets properly, ignoring those inside strings and comments
 * @param {string} code
 * @returns {{ openBraces: number, closeBraces: number, openParens: number, closeParens: number }}
 */
function countBracketsProperlyImpl(code) {
  let openBraces = 0;
  let closeBraces = 0;
  let openParens = 0;
  let closeParens = 0;

  let inString = false;
  let stringChar = "";
  let inTemplate = false;
  let inComment = false;
  let commentType = ""; // 'line' or 'block'

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1];
    const prevChar = code[i - 1];

    // Handle comments
    if (!inString && !inTemplate) {
      if (!inComment && char === "/" && nextChar === "/") {
        inComment = true;
        commentType = "line";
        continue;
      }
      if (!inComment && char === "/" && nextChar === "*") {
        inComment = true;
        commentType = "block";
        continue;
      }
      if (inComment && commentType === "line" && char === "\n") {
        inComment = false;
        continue;
      }
      if (
        inComment &&
        commentType === "block" &&
        char === "*" &&
        nextChar === "/"
      ) {
        inComment = false;
        i++; // Skip the /
        continue;
      }
    }

    if (inComment) continue;

    // Handle strings
    if (!inTemplate && (char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    // Handle template literals
    if (char === "`" && prevChar !== "\\") {
      inTemplate = !inTemplate;
      continue;
    }

    if (inString || inTemplate) continue;

    // Count brackets
    if (char === "{") openBraces++;
    if (char === "}") closeBraces++;
    if (char === "(") openParens++;
    if (char === ")") closeParens++;
  }

  return { openBraces, closeBraces, openParens, closeParens };
}

/**
 * Auto-fix incomplete JSX/JavaScript code
 * @param {string} code - The code to fix
 * @param {string} filePath - The file path for logging
 * @returns {string} - Fixed code
 */
export function autoFixJSX(code, filePath) {
  // First, check if already valid
  const { valid } = validateJSX(code);
  if (valid) {
    return code;
  }

  console.log(`[JSX Validator] Attempting to fix: ${filePath}`);

  let fixed = code.trim();
  const counts = countBracketsProperlyImpl(fixed);

  // Fix unbalanced parentheses first
  if (counts.openParens > counts.closeParens) {
    const missing = counts.openParens - counts.closeParens;
    console.log(
      `[JSX Validator] Adding ${missing} missing closing parenthesis`
    );
    fixed = fixed + ")".repeat(missing);
  }

  // Fix unbalanced braces
  if (counts.openBraces > counts.closeBraces) {
    const missing = counts.openBraces - counts.closeBraces;
    console.log(`[JSX Validator] Adding ${missing} missing closing braces`);
    fixed = fixed + "\n" + "}".repeat(missing);
  }

  // Check for missing export default
  const hasExport = /export\s+(default|{)/.test(fixed);
  const isComponent = /^(function|const|let|var)\s+[A-Z]\w*\s*(=|\()/.test(
    fixed
  );

  if (!hasExport && isComponent) {
    // Extract component name
    const match = fixed.match(/^(?:function|const|let|var)\s+([A-Z]\w*)/);
    if (match) {
      const componentName = match[1];
      if (!fixed.includes(`export default ${componentName}`)) {
        console.log(`[JSX Validator] Adding export default ${componentName}`);
        fixed = fixed + `\n\nexport default ${componentName};\n`;
      }
    }
  }

  // Also check for export default after "use client" or imports
  if (!hasExport) {
    const componentMatch = fixed.match(
      /(?:^|\n)(?:function|const|let|var)\s+([A-Z]\w*)/
    );
    if (componentMatch) {
      const componentName = componentMatch[1];
      if (!fixed.includes(`export default ${componentName}`)) {
        console.log(`[JSX Validator] Adding export default ${componentName}`);
        fixed = fixed + `\n\nexport default ${componentName};\n`;
      }
    }
  }

  // Re-validate
  const { valid: isNowValid, error } = validateJSX(fixed);

  if (isNowValid) {
    console.log(`[JSX Validator] ✅ Successfully fixed: ${filePath}`);
    return fixed;
  } else {
    console.log(
      `[JSX Validator] ⚠️ Could not fully fix: ${filePath} - ${error}`
    );
    // Return the partially fixed version anyway
    return fixed;
  }
}

/**
 * Validate and fix JSX file content
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {string} - Validated/fixed content
 */
export function validateAndFixJSXFile(content, filePath) {
  // Only process JS/JSX files
  if (!filePath.endsWith(".js") && !filePath.endsWith(".jsx")) {
    return content;
  }

  // Skip node_modules or test files
  if (filePath.includes("node_modules") || filePath.includes(".test.")) {
    return content;
  }

  return autoFixJSX(content, filePath);
}
