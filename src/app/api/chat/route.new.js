/**
 * Chat API Route - Chef-style Architecture
 * Uses Vercel AI SDK's createDataStream and streamText with tools
 */

import { createDataStream, streamText } from "ai";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth";
import { globalVFS } from "../../../../lib/vfs";
import {
  getOpenRouterProvider,
  getDefaultModel,
} from "../../../../lib/openrouter";
import { createToolset } from "../../../../lib/tools/index";
import { AGENT_SYSTEM_PROMPT } from "../../../../lib/prompts/system";
import { validateAndFixJSXFile } from "../../../../lib/jsxValidator";

export async function POST(request) {
  try {
    console.log("[API] Chat request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messages, model: requestedModel } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const model = requestedModel || getDefaultModel();
    console.log("[API] Using model:", model);

    // Build project context
    const existingFiles = globalVFS.getAllFiles();
    const filePaths = Object.keys(existingFiles);
    const isNewProject = filePaths.length === 0;

    // Create context for the AI
    const keyFiles = ["app/page.jsx", "app/layout.jsx", "package.json"];
    const keyContents = keyFiles
      .filter((p) => existingFiles[p])
      .map((p) => `--- ${p} ---\n${existingFiles[p]}`)
      .join("\n\n");

    const contextMessage =
      filePaths.length > 0
        ? `\n\n[CURRENT PROJECT STATE]\nExisting files: ${filePaths.join(
            ", "
          )}\n\n${keyContents}`
        : "";

    // Create tools with VFS
    const tools = createToolset({
      vfs: globalVFS,
      onFileWrite: (path, content) => {
        // Validate JSX files
        if (path.endsWith(".js") || path.endsWith(".jsx")) {
          const fixed = validateAndFixJSXFile(content, path);
          if (fixed !== content) {
            globalVFS.writeFile(path, fixed);
          }
        }
        console.log(`[API] File written via tool: ${path}`);
      },
      onDeploy: async (message) => {
        console.log(`[API] Deploy requested: ${message}`);
        return { success: true };
      },
    });

    // Get provider
    const provider = getOpenRouterProvider();

    // Prepare messages - add context to the last user message
    const preparedMessages = messages.map((msg, idx) => {
      if (idx === messages.length - 1 && msg.role === "user") {
        return {
          ...msg,
          content: msg.content + contextMessage,
        };
      }
      return msg;
    });

    console.log("[API] Starting streamText with tools");

    // Create data stream (Chef approach)
    const dataStream = createDataStream({
      execute: async (dataStream) => {
        const result = streamText({
          model: provider(model),
          system: AGENT_SYSTEM_PROMPT,
          messages: preparedMessages,
          tools,
          toolChoice: "auto",
          maxSteps: 20,
          maxTokens: 32000,
          temperature: 0.7,
          onStepFinish: ({ stepType, toolCalls, toolResults }) => {
            console.log(
              `[API] Step finished: ${stepType}, tools: ${
                toolCalls?.length || 0
              }`
            );
          },
        });

        // Merge the result into the data stream
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error) => {
        console.error("[API] Stream error:", error);
        return error instanceof Error ? error.message : "Unknown error";
      },
    });

    // Return the data stream response
    return dataStream.toDataStreamResponse({
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[API] Chat route error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
