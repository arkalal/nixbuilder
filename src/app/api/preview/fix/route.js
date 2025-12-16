// Auto-Fix API
// Attempts to automatically fix errors in the generated code

import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getSandbox, touch } from "../../../../../lib/sandbox/manager";
import {
  generateFixPrompt,
  generateErrorSummary,
  parseError,
  ERROR_TYPES,
} from "../../../../../lib/agent/index.js";
import { generateCode } from "../../../../../lib/services/writer";
import { globalVFS } from "../../../../../lib/vfs";
import { createSSEStream, createSSEResponse } from "../../../../../lib/sse";

const MAX_FIX_ATTEMPTS = 3;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { projectId, error: errorData, model, stream = false } = body;

    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }

    if (!errorData) {
      return Response.json(
        { error: "error data is required" },
        { status: 400 }
      );
    }

    // Get existing sandbox
    const entry = getSandbox(session.user.email, projectId);
    const sandbox = entry?.provider;

    if (!sandbox) {
      return Response.json(
        { error: "No active sandbox. Start preview first." },
        { status: 400 }
      );
    }

    console.log(`[AutoFix] Starting fix for project: ${projectId}`);
    console.log(`[AutoFix] Error type: ${errorData.type}`);

    // Parse the error if it's raw
    const error = errorData.raw
      ? { ...errorData, ...parseError(errorData.raw, errorData.type) }
      : errorData;

    // If streaming is requested, return SSE stream
    if (stream) {
      return handleStreamingFix(error, model, sandbox, session, projectId);
    }

    // Non-streaming fix
    const result = await attemptFix(error, model);

    if (result.success) {
      // Write fixed files to sandbox
      await sandbox.writeFiles(globalVFS.getAllFiles());

      // Restart dev server to apply changes
      try {
        await sandbox.restartDevServer();
      } catch (restartError) {
        console.warn(
          "[AutoFix] Dev server restart warning:",
          restartError.message
        );
      }

      touch(session.user.email, projectId);
    }

    return Response.json({
      success: result.success,
      filesFixed: result.filesFixed,
      fixedFiles: result.fixedFiles,
      attempts: result.attempts,
      previewUrl: sandbox.getInfo()?.url,
    });
  } catch (error) {
    console.error("[AutoFix] Error:", error);
    return Response.json(
      { error: error.message || "Fix failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle streaming fix with SSE
 */
async function handleStreamingFix(error, model, sandbox, session, projectId) {
  const { stream, send, close } = createSSEStream();

  (async () => {
    try {
      send("stage", { stage: "fixing" });
      send("activity", {
        message: `Analyzing error: ${error.type}`,
        status: "in_progress",
      });

      // Get current files
      const currentFiles = globalVFS.getAllFiles();

      // Generate fix prompt
      const fixPrompt = generateFixPrompt(error, currentFiles);

      send("activity", {
        message: "Generating fix...",
        status: "in_progress",
      });

      // Generate fix with streaming
      const result = await generateCode(fixPrompt, {
        model,
        temperature: 0.3,
        vfs: globalVFS,
        context: `FIXING ERROR: ${generateErrorSummary(error)}`,
        newProject: false,
      });

      let generatedCode = "";
      let currentFilePath = "";
      let isInFile = false;

      // Stream the fix generation
      for await (const textPart of result.textStream) {
        const text = textPart || "";
        generatedCode += text;

        // Send raw stream for display
        send("rawStream", { text, raw: true });

        // Detect file starts
        const openRegex = /<file path="([^"]+)">/g;
        let openMatch;
        while ((openMatch = openRegex.exec(text)) !== null) {
          currentFilePath = openMatch[1];
          isInFile = true;
          send("activity", {
            message: `Fixing ${currentFilePath}`,
            status: "in_progress",
            file: currentFilePath,
          });
        }

        // Detect file end
        if (isInFile && text.includes("</file>") && currentFilePath) {
          send("activity", {
            message: `Fixed ${currentFilePath}`,
            status: "completed",
            file: currentFilePath,
          });
          isInFile = false;
          currentFilePath = "";
        }
      }

      // Parse and save fixed files
      const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
      let fileMatch;
      const fixedFiles = [];

      while ((fileMatch = fileRegex.exec(generatedCode)) !== null) {
        const filePath = fileMatch[1];
        const fileContent = fileMatch[2].trim();
        globalVFS.writeFile(filePath, fileContent);
        fixedFiles.push(filePath);
      }

      if (fixedFiles.length > 0) {
        // Write to sandbox and restart
        await sandbox.writeFiles(globalVFS.getAllFiles());

        send("activity", {
          message: "Restarting preview...",
          status: "in_progress",
        });

        try {
          await sandbox.restartDevServer();
        } catch (restartError) {
          console.warn("[AutoFix] Restart warning:", restartError.message);
        }

        touch(session.user.email, projectId);

        send("activity", {
          message: `Fixed ${fixedFiles.length} file(s)`,
          status: "completed",
        });

        send("complete", {
          success: true,
          filesFixed: fixedFiles.length,
          fixedFiles,
          files: globalVFS.getAllFiles(),
        });
      } else {
        send("activity", {
          message: "Could not generate fix",
          status: "error",
        });

        send("complete", {
          success: false,
          filesFixed: 0,
          fixedFiles: [],
        });
      }

      send("stage", { stage: "done" });
    } catch (error) {
      console.error("[AutoFix Stream] Error:", error);
      send("error", {
        code: "FIX_FAILED",
        message: error.message || "Fix generation failed",
      });
      send("stage", { stage: "idle" });
    } finally {
      close();
    }
  })();

  return createSSEResponse(stream);
}

/**
 * Non-streaming fix attempt
 */
async function attemptFix(error, model) {
  const attempts = [];
  let success = false;
  let fixedFiles = [];

  for (let i = 0; i < MAX_FIX_ATTEMPTS; i++) {
    console.log(`[AutoFix] Attempt ${i + 1}/${MAX_FIX_ATTEMPTS}`);

    try {
      const currentFiles = globalVFS.getAllFiles();
      const fixPrompt = generateFixPrompt(error, currentFiles);

      const result = await generateCode(fixPrompt, {
        model,
        temperature: 0.3,
        vfs: globalVFS,
        context: `FIXING ERROR: ${generateErrorSummary(error)}`,
        newProject: false,
      });

      let generatedCode = "";
      for await (const textPart of result.textStream) {
        generatedCode += textPart || "";
      }

      const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
      let fileMatch;
      fixedFiles = [];

      while ((fileMatch = fileRegex.exec(generatedCode)) !== null) {
        const filePath = fileMatch[1];
        const fileContent = fileMatch[2].trim();
        globalVFS.writeFile(filePath, fileContent);
        fixedFiles.push(filePath);
      }

      attempts.push({
        iteration: i + 1,
        filesFixed: fixedFiles.length,
        success: fixedFiles.length > 0,
      });

      if (fixedFiles.length > 0) {
        success = true;
        break;
      }
    } catch (fixError) {
      console.error(`[AutoFix] Attempt ${i + 1} failed:`, fixError.message);
      attempts.push({
        iteration: i + 1,
        filesFixed: 0,
        success: false,
        error: fixError.message,
      });
    }
  }

  return { success, filesFixed: fixedFiles.length, fixedFiles, attempts };
}
