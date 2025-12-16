// Preview Validation API
// Validates code and attempts auto-recovery if errors are found

import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getSandbox } from "../../../../../lib/sandbox/manager";
import {
  captureInstallErrors,
  captureRuntimeErrors,
  generateFixPrompt,
  generateErrorSummary,
  isFixableError,
  ERROR_TYPES,
} from "../../../../../lib/agent/index.js";
import { generateCode } from "../../../../../lib/services/writer";
import { globalVFS } from "../../../../../lib/vfs";

const MAX_FIX_ATTEMPTS = 3;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { projectId, autoFix = true, model } = body;

    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
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

    console.log(`[Validate] Starting validation for project: ${projectId}`);

    // Step 1: Check for install errors
    let errors = [];
    let fixAttempts = [];

    const installError = await captureInstallErrors(sandbox);
    if (installError) {
      console.log(
        `[Validate] Install error detected: ${generateErrorSummary(
          installError
        )}`
      );
      errors.push(installError);

      if (autoFix && isFixableError(installError)) {
        const fixResult = await attemptFix(installError, model, fixAttempts);
        if (fixResult.success) {
          // Re-run install after fix
          await sandbox.writeFiles(globalVFS.getAllFiles());
          const retryInstall = await captureInstallErrors(sandbox);
          if (!retryInstall) {
            console.log(`[Validate] ✅ Install error fixed!`);
            errors = [];
          }
        }
        fixAttempts = fixResult.attempts;
      }
    }

    // Step 2: If no install errors, check runtime
    if (errors.length === 0) {
      try {
        // Ensure dev server is running
        const info = sandbox.getInfo();
        if (info.state !== "running") {
          await sandbox.startDevServer();
        }

        // Wait and check for runtime errors
        const runtimeError = await captureRuntimeErrors(sandbox, 3000);
        if (runtimeError) {
          console.log(
            `[Validate] Runtime error detected: ${generateErrorSummary(
              runtimeError
            )}`
          );
          errors.push(runtimeError);

          if (autoFix && isFixableError(runtimeError)) {
            const fixResult = await attemptFix(
              runtimeError,
              model,
              fixAttempts
            );
            if (fixResult.success) {
              // Re-write files and restart
              await sandbox.writeFiles(globalVFS.getAllFiles());
              await sandbox.restartDevServer();

              // Re-check for errors
              const retryRuntime = await captureRuntimeErrors(sandbox, 3000);
              if (!retryRuntime) {
                console.log(`[Validate] ✅ Runtime error fixed!`);
                errors = [];
              }
            }
            fixAttempts = fixResult.attempts;
          }
        }
      } catch (devError) {
        console.error(`[Validate] Dev server error:`, devError.message);
        errors.push({
          type: ERROR_TYPES.COMPILATION,
          message: devError.message,
          raw: devError.message,
        });
      }
    }

    // Return validation result
    const valid = errors.length === 0;
    console.log(`[Validate] Result: ${valid ? "✅ Valid" : "❌ Has errors"}`);

    return Response.json({
      valid,
      errors: errors.map((e) => ({
        type: e.type,
        message: e.message,
        file: e.file,
        line: e.line,
        suggestions: e.suggestions,
        summary: generateErrorSummary(e),
      })),
      fixAttempts: fixAttempts.map((a) => ({
        iteration: a.iteration,
        error: a.errorSummary,
        success: a.success,
      })),
      previewUrl: sandbox.getInfo()?.url,
    });
  } catch (error) {
    console.error("[Validate] Error:", error);
    return Response.json(
      { error: error.message || "Validation failed" },
      { status: 500 }
    );
  }
}

/**
 * Attempt to fix an error by generating a fix
 */
async function attemptFix(error, model, previousAttempts = []) {
  const attempts = [...previousAttempts];
  let success = false;

  for (let i = attempts.length; i < MAX_FIX_ATTEMPTS; i++) {
    console.log(`[Validate] Fix attempt ${i + 1}/${MAX_FIX_ATTEMPTS}`);

    try {
      // Get current files
      const currentFiles = globalVFS.getAllFiles();

      // Generate fix prompt
      const fixPrompt = generateFixPrompt(error, currentFiles);

      // Generate fix
      const result = await generateCode(fixPrompt, {
        model,
        temperature: 0.3, // Lower temperature for fixes
        vfs: globalVFS,
        context: `FIXING ERROR: ${generateErrorSummary(error)}`,
        newProject: false,
      });

      // Collect the generated code
      let generatedCode = "";
      for await (const textPart of result.textStream) {
        generatedCode += textPart || "";
      }

      // Parse files from response
      const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
      let fileMatch;
      let filesFixed = 0;

      while ((fileMatch = fileRegex.exec(generatedCode)) !== null) {
        const filePath = fileMatch[1];
        const fileContent = fileMatch[2].trim();
        globalVFS.writeFile(filePath, fileContent);
        filesFixed++;
        console.log(`[Validate] Fixed file: ${filePath}`);
      }

      attempts.push({
        iteration: i + 1,
        errorSummary: generateErrorSummary(error),
        filesFixed,
        success: filesFixed > 0,
      });

      if (filesFixed > 0) {
        success = true;
        break;
      }
    } catch (fixError) {
      console.error(
        `[Validate] Fix attempt ${i + 1} failed:`,
        fixError.message
      );
      attempts.push({
        iteration: i + 1,
        errorSummary: generateErrorSummary(error),
        filesFixed: 0,
        success: false,
        error: fixError.message,
      });
    }
  }

  return { success, attempts };
}
