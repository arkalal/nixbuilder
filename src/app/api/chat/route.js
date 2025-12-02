/**
 * Chat API Route - EXACT Chef Architecture
 * createDataStream() → streamText() → mergeIntoDataStream() → toDataStreamResponse()
 */

import { createDataStream, streamText } from "ai";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth";
import { globalVFS } from "../../../../lib/vfs";
import {
  getOpenRouterProvider,
  getDefaultModel,
} from "../../../../lib/openrouter";
import { CHEF_SYSTEM_PROMPT } from "../../../../lib/prompts/system.chef";

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;

export async function POST(request) {
  try {
    console.log("[API] Chat request received (Chef architecture)");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messages: clientMessages, model: requestedModel } = body;

    if (!clientMessages || !Array.isArray(clientMessages)) {
      return Response.json(
        { error: "Messages array required" },
        { status: 400 }
      );
    }

    const model = requestedModel || getDefaultModel();
    console.log("[API] Using model:", model);

    // Get provider
    const provider = getOpenRouterProvider();

    // Build project context
    const existingFiles = globalVFS.getAllFiles();
    const filePaths = Object.keys(existingFiles);
    const isNewProject = filePaths.length === 0;

    // Clear VFS for new projects
    if (isNewProject && globalVFS.clear) {
      globalVFS.clear();
    }

    // Build context string for AI
    const keyFiles = ["app/page.jsx", "app/layout.jsx", "package.json"];
    const keyContents = keyFiles
      .filter((p) => existingFiles[p])
      .map((p) => `--- ${p} ---\n${existingFiles[p]}`)
      .join("\n\n");

    const contextStr =
      filePaths.length > 0
        ? `\n\n[CURRENT PROJECT FILES]\nFiles: ${filePaths.join(
            ", "
          )}\n\n${keyContents}`
        : "";

    const modePreface = isNewProject
      ? "MODE: NEW PROJECT - Create all necessary files from scratch.\n\n"
      : "MODE: EDIT EXISTING - Only modify files that need changes.\n\n";

    // Prepare messages - add context to the last user message
    const messagesForAI = clientMessages.map((msg, idx) => {
      if (msg.role === "user" && idx === clientMessages.length - 1) {
        return {
          role: msg.role,
          content: `${modePreface}${contextStr}\n\n${msg.content}`,
        };
      }
      return { role: msg.role, content: msg.content };
    });

    // Define tools (Chef pattern - NO execute, client-side execution via onToolCall)
    const tools = {
      viewFile: {
        description:
          "Read the contents of a file to see its current state before editing",
        parameters: z.object({
          filePath: z.string().describe("The path to the file to read"),
        }),
        // No execute - handled client-side via onToolCall
      },
      editFile: {
        description:
          "Make small, targeted edits to an existing file. Use for changes under 20 lines.",
        parameters: z.object({
          filePath: z.string().describe("Path to the file to edit"),
          oldText: z
            .string()
            .describe("Exact text to find and replace (must be unique)"),
          newText: z.string().describe("New text to replace with"),
        }),
        // No execute - handled client-side via onToolCall
      },
      deploy: {
        description:
          "Deploy the application to preview. Use after all files are ready.",
        parameters: z.object({
          message: z
            .string()
            .optional()
            .describe("Optional deployment message"),
        }),
        // No execute - handled client-side via onToolCall
      },
    };

    // CHEF ARCHITECTURE: createDataStream with execute callback
    const dataStream = createDataStream({
      execute(dataStream) {
        // streamText inside createDataStream (Chef pattern)
        const result = streamText({
          model: provider(model),
          system: CHEF_SYSTEM_PROMPT,
          messages: messagesForAI,
          tools,
          toolChoice: "auto",
          maxTokens: 32000,
          onFinish: ({ usage, finishReason }) => {
            console.log(
              `[API] Finished: ${finishReason}, usage: ${JSON.stringify(usage)}`
            );
          },
          onError({ error }) {
            console.error("[API] Stream error:", error);
          },
        });

        // CHEF PATTERN: merge result into data stream
        result.mergeIntoDataStream(dataStream);
      },
      onError(error) {
        console.error("[API] Stream error:", error);
        return error.message || "Stream error";
      },
    });

    // CHEF PATTERN: return as Response with headers (exact Chef pattern)
    return new Response(dataStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[API] Route error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
