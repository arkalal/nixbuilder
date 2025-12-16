import { generateCode } from "../../../../lib/services/writer";
import { createSSEStream, createSSEResponse } from "../../../../lib/sse";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth";
import { globalVFS } from "../../../../lib/vfs";
import {
  selectContextFiles,
  formatContext,
} from "../../../../lib/services/contextSelector";
import { buildDependencyGraph } from "../../../../lib/services/dependencyGraph";
import {
  processHistory,
  formatHistoryForPrompt,
  needsSummary,
} from "../../../../lib/services/chatSummary";

export async function POST(request) {
  try {
    console.log("[API] Chat request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    console.log(
      "[API] Session check:",
      session ? "✓ Authenticated" : "✗ Not authenticated"
    );

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, model, temperature, history } = body;
    console.log("[API] Request:", {
      message: message.substring(0, 50) + "...",
      model,
      temperature,
    });

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // Create SSE stream
    const { stream, send, close } = createSSEStream();
    console.log("[API] SSE stream created");

    // Helper: transient network error detection for retriable streaming failures
    const shouldRetry = (err) => {
      const msg = String(err?.message || "");
      const code = err?.cause?.code || err?.code || "";
      return (
        /terminated|other side closed|Connection closed|stream aborted/i.test(
          msg
        ) || /UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT/i.test(code)
      );
    };

    // Process in the background
    (async () => {
      try {
        console.log("[API] Starting generation...");

        // Send stage update
        send("stage", { stage: "generating" });
        send("activity", {
          message: "Starting code generation...",
          status: "in_progress",
        });

        // Retry loop for transient stream disconnects
        const MAX_ATTEMPTS = 2;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            // Build project context for iterative edits (re-evaluate each attempt to reflect any prior files)
            const existingFiles = globalVFS.getAllFiles();
            const filePaths = Object.keys(existingFiles);

            // Use AI-powered context selection for smart file selection
            let contextResult;
            let keyContents;

            try {
              // Smart context selection with dependency graph
              contextResult = selectContextFiles(message, existingFiles, {
                maxFiles: 12,
                maxChars: 50000,
                includeGraph: filePaths.length > 0,
              });

              keyContents = formatContext(
                existingFiles,
                contextResult.selected
              );
              console.log(
                `[API] Smart context: ${contextResult.selected.length} files selected`
              );
            } catch (contextError) {
              // Fallback to basic context selection
              console.warn(
                "[API] Context selection failed, using fallback:",
                contextError.message
              );
              const keyFiles = [
                "app/page.jsx",
                "app/layout.jsx",
                "app/globals.scss",
                "package.json",
                "next.config.mjs",
                "jsconfig.json",
              ].filter((p) => existingFiles[p]);

              keyContents = keyFiles
                .map((p) => `--- ${p} ---\n${existingFiles[p]}`)
                .join("\n\n");
            }

            // Process chat history with summarization for long conversations
            let historyText = "";
            if (Array.isArray(history) && history.length > 0) {
              try {
                if (needsSummary(history, 10)) {
                  // Use AI-powered summarization for long conversations
                  const processedHistory = await processHistory(history, {
                    threshold: 10,
                    keepRecent: 4,
                    model: model,
                  });
                  historyText =
                    "\n\n" + formatHistoryForPrompt(processedHistory);
                  console.log(
                    `[API] Chat history summarized: ${
                      processedHistory.summarizedCount || 0
                    } messages compressed`
                  );
                } else {
                  // Short history - include as-is
                  historyText = `\n\nCONVERSATION HISTORY (latest first)\n----------------------------------\n${[
                    ...history,
                  ]
                    .slice(-6)
                    .reverse()
                    .map((h) => `${h.role.toUpperCase()}: ${h.content || ""}`)
                    .join("\n")}`;
                }
              } catch (historyError) {
                console.warn(
                  "[API] History processing failed, using fallback:",
                  historyError.message
                );
                historyText = `\n\nCONVERSATION HISTORY (latest first)\n----------------------------------\n${[
                  ...history,
                ]
                  .slice(-6)
                  .reverse()
                  .map((h) => `${h.role.toUpperCase()}: ${h.content || ""}`)
                  .join("\n")}`;
              }
            }
            const context = `Existing files (${filePaths.length}):\n${filePaths
              .map((p) => `- ${p}`)
              .join("\n")}\n\n${keyContents}${historyText}`;

            // Generate code with streaming
            console.log("[API] Calling generateCode...");
            const isNewProject = filePaths.length === 0;
            // Force stricter focus for iterative edits to avoid redoing previous features
            // Also explicitly protect .env and other config files
            const hasEnvFile = filePaths.includes(".env");
            const latestTaskPreface = isNewProject
              ? message
              : `ONLY perform the following latest task. Do NOT re-implement previous features.
${
  hasEnvFile
    ? "⚠️ CRITICAL: .env file exists - DO NOT output or regenerate it. User has their credentials there."
    : ""
}
Output ONLY the files that need to be changed for this request.
Instruction: ${message}`;

            const effectiveTemp = isNewProject
              ? typeof temperature === "number"
                ? temperature
                : 0.7
              : Math.min(
                  typeof temperature === "number" ? temperature : 0.4,
                  0.4
                );

            const result = await generateCode(latestTaskPreface, {
              model,
              temperature: effectiveTemp,
              vfs: globalVFS,
              context,
              newProject: isNewProject,
            });
            console.log("[API] generateCode returned");

            // Track accumulated text and file boundaries
            let generatedCode = "";
            let currentFilePath = "";
            let isInFile = false;
            let explanationSent = false;
            let inExplanation = false;
            let explanationBuffer = "";
            let fileTagBuffer = ""; // small rolling buffer

            // Professional tag-based content separation (like bolt.diy)
            // Use accumulated buffer for reliable tag detection across chunk boundaries
            let accumulatedText = "";
            let lastProcessedPosition = 0;
            let conversationalBuffer = ""; // Track conversational text outside tags

            console.log("[API] Starting to stream text...");
            for await (const textPart of result.textStream) {
              const text = textPart || "";
              // Accumulate ALL text
              generatedCode += text;
              accumulatedText += text;

              // Handle explanation tag streaming-first
              if (!explanationSent) {
                const combined = explanationBuffer + text;
                if (!inExplanation && combined.includes("<explanation>")) {
                  inExplanation = true;
                }
                if (inExplanation) {
                  explanationBuffer = combined;
                  if (combined.includes("</explanation>")) {
                    const m = combined.match(
                      /<explanation>([\s\S]*?)<\/explanation>/
                    );
                    const explanationText = m ? m[1].trim() : "";
                    console.log(
                      `[API] 🎯 IMMEDIATE explanation: "${explanationText.substring(
                        0,
                        100
                      )}..."`
                    );
                    send("explanation", { text: explanationText });
                    explanationSent = true;
                    inExplanation = false;
                  } else {
                    // wait for closing tag in subsequent chunks
                    continue;
                  }
                }
              }

              // Stream raw text for code display
              send("rawStream", { text, raw: true });

              // Professional tag-based parsing - extract ONLY text outside ALL tags
              // Process accumulated text to find conversational content
              const tagPattern =
                /<(file|package|packages|explanation|command|structure|template)\b[^>]*>[\s\S]*?<\/\1>|<(file|package|packages|explanation|command|structure|template)\b[^>]*>/g;

              // Find text segments that are outside any tags
              let lastIndex = 0;
              let match;
              let conversationalText = "";
              const tempText = accumulatedText.substring(lastProcessedPosition);

              // Check if we're potentially in an incomplete tag
              const hasIncompleteTag =
                /<[^>]*$/.test(tempText) ||
                (/<(file|package|packages|explanation|command|structure|template)\b/.test(
                  tempText
                ) &&
                  !/<\/(file|package|packages|explanation|command|structure|template)>/.test(
                    tempText.substring(tempText.lastIndexOf("<"))
                  ));

              if (!hasIncompleteTag) {
                // Safe to process - no incomplete tags
                tagPattern.lastIndex = 0;
                while ((match = tagPattern.exec(tempText)) !== null) {
                  // Add text before this tag match
                  if (match.index > lastIndex) {
                    conversationalText += tempText.substring(
                      lastIndex,
                      match.index
                    );
                  }
                  lastIndex = match.index + match[0].length;
                }
                // Add remaining text after last tag
                conversationalText += tempText.substring(lastIndex);
                lastProcessedPosition = accumulatedText.length;

                // Send clean conversational text (no tags, no code)
                const cleanText = conversationalText.trim();
                if (
                  cleanText &&
                  !cleanText.startsWith("<") &&
                  !cleanText.includes("</")
                ) {
                  send("stream", { content: cleanText });
                  // Accumulate for final message
                  conversationalBuffer += cleanText + " ";
                }
              }

              // Detect file starts
              const searchText = fileTagBuffer + text;
              const openRegex = /<file path="([^"]+)">/g;
              let openMatch;
              while ((openMatch = openRegex.exec(searchText)) !== null) {
                currentFilePath = openMatch[1];
                isInFile = true;
                console.log(`[API] 📄 File STARTED: ${currentFilePath}`);
                send("activity", {
                  message: `Generating ${currentFilePath}`,
                  status: "in_progress",
                  file: currentFilePath,
                });
              }
              fileTagBuffer = searchText.slice(-100);

              // Detect file end
              if (isInFile && text.includes("</file>") && currentFilePath) {
                console.log(`[API] ✅ File COMPLETED: ${currentFilePath}`);
                send("activity", {
                  message: `Created ${currentFilePath}`,
                  status: "completed",
                  file: currentFilePath,
                });
                isInFile = false;
                currentFilePath = "";
              }
            }
            // Stream ended successfully on this attempt
            console.log(`[API] ✅ Stream finished! Parsing files for VFS...`);

            const finalConversation = conversationalBuffer.trim();
            if (finalConversation) {
              console.log(
                `[API] Final conversational text saved for complete event: "${finalConversation.substring(
                  0,
                  100
                )}..."`
              );
            }

            const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
            let fileMatch;
            const parsedFiles = {};
            while ((fileMatch = fileRegex.exec(generatedCode)) !== null) {
              const filePath = fileMatch[1];
              const fileContent = fileMatch[2].trim();
              parsedFiles[filePath] = fileContent;
              globalVFS.writeFile(filePath, fileContent);
            }

            console.log(
              `[API] ✅ Parsed ${Object.keys(parsedFiles).length} files to VFS`
            );
            send("activity", {
              message: "Code generation complete",
              status: "completed",
            });

            const allFiles = globalVFS.getAllFiles();
            const fileCount = Object.keys(allFiles).length;
            console.log(`[API] Sending ${fileCount} files in complete event`);
            send("complete", {
              files: allFiles,
              finalMessage: finalConversation || undefined,
            });
            send("stage", { stage: "done" });
            break; // success; exit retry loop
          } catch (err) {
            if (attempt < MAX_ATTEMPTS && shouldRetry(err)) {
              console.warn(
                `[API] Stream interrupted (attempt ${attempt}). Retrying...`,
                err?.message
              );
              send("activity", {
                message: `Connection dropped, retrying (${attempt}/${
                  MAX_ATTEMPTS - 1
                })...`,
                status: "in_progress",
              });
              continue;
            }
            throw err;
          }
        }
      } catch (error) {
        console.error("Chat API error:", error);
        const friendly = shouldRetry(error)
          ? "Generation stream was interrupted and could not be recovered. Please try again."
          : error.message || "Code generation failed";
        send("error", {
          code: "GENERATION_FAILED",
          message: friendly,
        });
        send("stage", { stage: "idle" });
      } finally {
        close();
      }
    })();

    return createSSEResponse(stream);
  } catch (error) {
    console.error("Chat route error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
