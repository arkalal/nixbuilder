/**
 * AI Agent Service
 * Chef-style tool-based code generation with iteration capability
 */

import { streamText, convertToCoreMessages } from "ai";
import { getOpenRouterProvider, getDefaultModel } from "../openrouter.js";
import { createToolset } from "../tools/index.js";
import { globalVFS } from "../vfs.js";
import { AGENT_SYSTEM_PROMPT } from "../prompts/system.js";

/**
 * Run the AI agent with tool-based generation
 * @param {Object} options
 * @param {string} options.prompt - User's prompt
 * @param {Array} options.messages - Previous messages (for context)
 * @param {Object} options.vfs - Virtual filesystem
 * @param {string} options.model - Model to use
 * @param {Function} options.onFileWrite - Callback when file is written
 * @param {Function} options.onToolCall - Callback when tool is called
 * @param {Function} options.onToolResult - Callback when tool returns result
 * @param {Object} options.context - Project context
 * @returns {Object} Streaming result
 */
export async function runAgent(options = {}) {
  const {
    prompt,
    messages = [],
    vfs = globalVFS,
    model = getDefaultModel(),
    onFileWrite,
    onToolCall,
    onToolResult,
    onDeploy,
    context,
    isNewProject = true,
  } = options;

  const provider = getOpenRouterProvider();

  // Create toolset with VFS injected
  const tools = createToolset({
    vfs,
    onDeploy,
    onFileWrite,
  });

  // Build context prefix
  const modePreface = isNewProject
    ? `MODE: NEW PROJECT - Create all necessary files for the requested app.\n\n`
    : `MODE: EDIT EXISTING PROJECT - Only modify files that need changes.\n\n`;

  const contextStr = context ? `\nPROJECT CONTEXT:\n${context}\n\n` : "";

  // Prepare messages
  const coreMessages = [
    ...convertToCoreMessages(messages),
    {
      role: "user",
      content: `${modePreface}${contextStr}${prompt}`,
    },
  ];

  console.log("[Agent] Starting with tools:", Object.keys(tools).join(", "));

  // Stream with tools and iteration
  const result = streamText({
    model: provider(model),
    system: AGENT_SYSTEM_PROMPT,
    messages: coreMessages,
    tools,
    toolChoice: "auto", // Let AI decide when to use tools
    maxSteps: 20, // Allow up to 20 iterations for error fixing
    maxTokens: 32000,
    temperature: 0.7,
    onStepFinish: ({ stepType, toolCalls, toolResults, text }) => {
      console.log(`[Agent] Step finished: ${stepType}`);

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          console.log(`[Agent] Tool called: ${call.toolName}`);
          if (onToolCall) {
            onToolCall({
              toolName: call.toolName,
              args: call.args,
              toolCallId: call.toolCallId,
            });
          }
        }
      }

      if (toolResults && toolResults.length > 0) {
        for (const result of toolResults) {
          console.log(`[Agent] Tool result: ${result.toolName}`);
          if (onToolResult) {
            onToolResult({
              toolName: result.toolName,
              result: result.result,
              toolCallId: result.toolCallId,
            });
          }
        }
      }
    },
  });

  return result;
}

/**
 * Generate code using the agent (simplified interface)
 * @param {string} userPrompt
 * @param {Object} options
 * @returns {Object}
 */
export async function generateWithAgent(userPrompt, options = {}) {
  const vfs = options.vfs || globalVFS;

  // Determine if new project
  const hasAnyFiles =
    Object.keys(vfs.getAllFiles ? vfs.getAllFiles() : {}).length > 0;
  const isNewProject = options.newProject === true || !hasAnyFiles;

  // Clear VFS for new projects
  if (isNewProject && vfs.clear) {
    try {
      vfs.clear();
    } catch {}
  }

  return runAgent({
    prompt: userPrompt,
    vfs,
    model: options.model,
    isNewProject,
    context: options.context,
    onFileWrite: options.onFileWrite,
    onToolCall: options.onToolCall,
    onToolResult: options.onToolResult,
    onDeploy: options.onDeploy,
  });
}
