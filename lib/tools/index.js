/**
 * Tool Definitions Index
 * Exports all available tools for the AI agent
 * Uses Vercel AI SDK's tool() function with zod schemas
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * Create a toolset with VFS and callbacks injected
 * @param {Object} options
 * @param {Object} options.vfs - Virtual filesystem instance
 * @param {Function} options.onDeploy - Callback when deploy is requested
 * @param {Function} options.onFileWrite - Callback when a file is written
 * @returns {Object} Tools object ready for use with streamText
 */
export function createToolset({ vfs, onDeploy, onFileWrite }) {
  return {
    // Write/create files
    writeFile: tool({
      description: `Write content to a file. Use this to create new files or completely rewrite existing files.
IMPORTANT: Always provide COMPLETE file content - never truncate or use placeholders.
For JSX: include all imports, "use client" if using hooks, component body, and export default.`,
      parameters: z.object({
        path: z
          .string()
          .describe(
            'Relative path from project root (e.g., "app/page.jsx", "components/Header.jsx")'
          ),
        content: z
          .string()
          .describe("Complete file content - must be syntactically valid"),
      }),
      execute: async ({ path, content }) => {
        const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
        try {
          vfs.writeFile(normalizedPath, content);
          if (onFileWrite) onFileWrite(normalizedPath, content);
          console.log(
            `[Tool:writeFile] ✅ ${normalizedPath} (${content.length} bytes)`
          );
          return `Successfully wrote ${normalizedPath}`;
        } catch (error) {
          console.error(`[Tool:writeFile] ❌ ${normalizedPath}:`, error);
          return `Error writing ${normalizedPath}: ${error.message}`;
        }
      },
    }),

    // Edit existing files
    editFile: tool({
      description: `Replace a specific string in an existing file. Use for small, targeted changes.
You MUST know the file's current contents before using this (use viewFile first).
The "old" text must exist exactly once in the file.`,
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
        old: z
          .string()
          .describe(
            "Exact text to find and replace (must appear exactly once)"
          ),
        new: z.string().describe("New text to replace it with"),
      }),
      execute: async ({ path, old: oldText, new: newText }) => {
        const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
        try {
          const content = vfs.readFile(normalizedPath);
          if (!content) {
            return `Error: File ${normalizedPath} not found. Use writeFile to create it.`;
          }

          const occurrences = content.split(oldText).length - 1;
          if (occurrences === 0) {
            return `Error: Text not found in ${normalizedPath}. Use viewFile to see current contents.`;
          }
          if (occurrences > 1) {
            return `Error: Found ${occurrences} occurrences. Provide a more unique string.`;
          }

          const newContent = content.replace(oldText, newText);
          vfs.writeFile(normalizedPath, newContent);
          if (onFileWrite) onFileWrite(normalizedPath, newContent);
          console.log(`[Tool:editFile] ✅ ${normalizedPath}`);
          return `Successfully edited ${normalizedPath}`;
        } catch (error) {
          console.error(`[Tool:editFile] ❌ ${normalizedPath}:`, error);
          return `Error editing ${normalizedPath}: ${error.message}`;
        }
      },
    }),

    // View file contents
    viewFile: tool({
      description: `View the current contents of a file. Use this BEFORE editFile to see what needs to be changed.`,
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
      }),
      execute: async ({ path }) => {
        const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
        try {
          const content = vfs.readFile(normalizedPath);
          if (!content) {
            return `File ${normalizedPath} does not exist.`;
          }
          console.log(`[Tool:viewFile] 👁️ ${normalizedPath}`);
          return content;
        } catch (error) {
          return `Error viewing ${normalizedPath}: ${error.message}`;
        }
      },
    }),

    // Deploy to preview
    deploy: tool({
      description: `Deploy the app to preview. Use this after writing all required files and the app is complete.
If deployment fails with errors, you will receive them and should fix the issues, then deploy again.`,
      parameters: z.object({
        message: z
          .string()
          .optional()
          .describe("Optional description of what was built/changed"),
      }),
      execute: async ({ message }) => {
        console.log(`[Tool:deploy] 🚀 Requested: ${message || "No message"}`);
        if (onDeploy) {
          const result = await onDeploy(message);
          if (result && result.error) {
            return `Deployment failed with error:\n${result.error}\n\nPlease fix the error and deploy again.`;
          }
        }
        return "Deployment initiated. The preview will start building.";
      },
    }),

    // Install npm packages
    installPackage: tool({
      description: `Add an npm package to the project dependencies.
Only use for packages not already in the template (next, react, sass are already included).`,
      parameters: z.object({
        packageName: z.string().describe("Name of the npm package"),
        version: z.string().optional().describe("Specific version (optional)"),
      }),
      execute: async ({ packageName, version }) => {
        try {
          let packageJson;
          const content = vfs.readFile("package.json");

          if (content) {
            packageJson = JSON.parse(content);
          } else {
            packageJson = { name: "app", version: "1.0.0", dependencies: {} };
          }

          if (!packageJson.dependencies) packageJson.dependencies = {};

          if (packageJson.dependencies[packageName]) {
            return `Package ${packageName} is already installed.`;
          }

          packageJson.dependencies[packageName] = version
            ? `^${version}`
            : "latest";

          // Sort dependencies
          packageJson.dependencies = Object.fromEntries(
            Object.entries(packageJson.dependencies).sort()
          );

          vfs.writeFile(
            "package.json",
            JSON.stringify(packageJson, null, 2) + "\n"
          );
          console.log(`[Tool:installPackage] 📦 ${packageName}`);
          return `Added ${packageName} to dependencies.`;
        } catch (error) {
          return `Error installing package: ${error.message}`;
        }
      },
    }),
  };
}
