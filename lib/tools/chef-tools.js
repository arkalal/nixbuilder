/**
 * Chef-style Tools
 * NO writeFile tool - files come from <boltArtifact> tags
 * Tools: view, edit, deploy, installPackage
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * Create Chef-style toolset
 * @param {Object} context - Context with vfs, callbacks
 */
export function createChefTools(context = {}) {
  const { vfs, onDeploy } = context;

  return {
    /**
     * View tool - Read file contents
     */
    view: tool({
      description: `Read the contents of a file. Use this to see current file state before making edits.`,
      parameters: z.object({
        filePath: z.string().describe("Path to the file to read"),
      }),
      execute: async ({ filePath }) => {
        try {
          const normalizedPath = filePath.startsWith("/")
            ? filePath.slice(1)
            : filePath;

          if (!vfs) {
            return `Error: VFS not available`;
          }

          const content = vfs.readFile(normalizedPath);
          if (content === null || content === undefined) {
            return `Error: File not found: ${normalizedPath}`;
          }

          console.log(`[Tool:view] Read ${normalizedPath}`);
          return content;
        } catch (error) {
          return `Error reading file: ${error.message}`;
        }
      },
    }),

    /**
     * Edit tool - Make small targeted edits to existing files
     */
    edit: tool({
      description: `Make small, targeted edits to an existing file. The text to replace must appear exactly once in the file and be less than 1024 characters. Use view tool first to see current content.`,
      parameters: z.object({
        filePath: z.string().describe("Path to the file to edit"),
        oldText: z
          .string()
          .describe("Exact text to find and replace (must be unique in file)"),
        newText: z.string().describe("New text to replace with"),
      }),
      execute: async ({ filePath, oldText, newText }) => {
        try {
          const normalizedPath = filePath.startsWith("/")
            ? filePath.slice(1)
            : filePath;

          if (!vfs) {
            return `Error: VFS not available`;
          }

          const content = vfs.readFile(normalizedPath);
          if (content === null || content === undefined) {
            return `Error: File not found: ${normalizedPath}`;
          }

          // Check that oldText exists exactly once
          const occurrences = content.split(oldText).length - 1;
          if (occurrences === 0) {
            return `Error: Text to replace not found in file. Use view tool to see current content.`;
          }
          if (occurrences > 1) {
            return `Error: Text to replace appears ${occurrences} times. It must appear exactly once.`;
          }

          // Check length limits
          if (oldText.length > 1024) {
            return `Error: Text to replace is too long (${oldText.length} chars). Maximum is 1024.`;
          }
          if (newText.length > 1024) {
            return `Error: New text is too long (${newText.length} chars). Maximum is 1024.`;
          }

          // Perform replacement
          const newContent = content.replace(oldText, newText);
          vfs.writeFile(normalizedPath, newContent);

          console.log(`[Tool:edit] Edited ${normalizedPath}`);
          return `Successfully edited ${normalizedPath}`;
        } catch (error) {
          return `Error editing file: ${error.message}`;
        }
      },
    }),

    /**
     * Deploy tool - Deploy to preview environment
     */
    deploy: tool({
      description: `Deploy the application to the preview environment. Use after all files are ready. If deployment fails, fix errors and deploy again.`,
      parameters: z.object({
        message: z.string().optional().describe("Optional deployment message"),
      }),
      execute: async ({ message }) => {
        try {
          console.log(
            `[Tool:deploy] Deploy requested: ${message || "No message"}`
          );

          if (onDeploy) {
            await onDeploy(message || "Deploying application");
          }

          return "Deployment initiated. The preview will update shortly.";
        } catch (error) {
          return `Error deploying: ${error.message}`;
        }
      },
    }),

    /**
     * Install package tool - Add npm dependencies
     */
    installPackage: tool({
      description: `Install an npm package. Only use for packages not already in package.json. Common packages like next, react, sass are already included.`,
      parameters: z.object({
        packageName: z.string().describe("Name of the npm package to install"),
        version: z
          .string()
          .optional()
          .describe("Optional specific version to install"),
      }),
      execute: async ({ packageName, version }) => {
        try {
          if (!vfs) {
            return `Error: VFS not available`;
          }

          // Read current package.json
          let packageJson;
          try {
            const content = vfs.readFile("package.json");
            packageJson = JSON.parse(content);
          } catch {
            return `Error: Could not read package.json`;
          }

          // Check if already installed
          const deps = packageJson.dependencies || {};
          const devDeps = packageJson.devDependencies || {};

          if (deps[packageName] || devDeps[packageName]) {
            return `Package ${packageName} is already installed`;
          }

          // Add package
          if (!packageJson.dependencies) {
            packageJson.dependencies = {};
          }
          packageJson.dependencies[packageName] = version || "latest";

          // Sort dependencies
          const sortedDeps = {};
          Object.keys(packageJson.dependencies)
            .sort()
            .forEach((key) => {
              sortedDeps[key] = packageJson.dependencies[key];
            });
          packageJson.dependencies = sortedDeps;

          // Write back
          vfs.writeFile("package.json", JSON.stringify(packageJson, null, 2));

          console.log(`[Tool:installPackage] Added ${packageName}`);
          return `Successfully added ${packageName} to package.json`;
        } catch (error) {
          return `Error installing package: ${error.message}`;
        }
      },
    }),
  };
}
