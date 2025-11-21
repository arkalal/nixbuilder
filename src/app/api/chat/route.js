import { generateCode } from "../../../../lib/services/writer";
import { createSSEStream, createSSEResponse } from "../../../../lib/sse";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth";
import { globalVFS } from "../../../../lib/vfs";

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
            const keyFiles = [
              "app/page.jsx",
              "app/layout.jsx",
              "app/globals.scss",
              "package.json",
              "next.config.mjs",
              "jsconfig.json",
            ];
            const keyContents = keyFiles
              .filter((p) => existingFiles[p])
              .map((p) => `--- ${p} ---\n${existingFiles[p]}`)
              .join("\n\n");
            const historyText = Array.isArray(history)
              ? `\n\nCONVERSATION HISTORY (latest first)\n----------------------------------\n${[
                  ...history,
                ]
                  .slice(-6)
                  .reverse()
                  .map((h) => `${h.role.toUpperCase()}: ${h.content || ""}`)
                  .join("\n")}`
              : "";
            const context = `Existing files (${filePaths.length}):\n${filePaths
              .map((p) => `- ${p}`)
              .join("\n")}\n\n${keyContents}${historyText}`;

            // Generate code with streaming
            console.log("[API] Calling generateCode...");
            const isNewProject = filePaths.length === 0;
            // Force stricter focus for iterative edits to avoid redoing previous features
            const latestTaskPreface = isNewProject
              ? message
              : `ONLY perform the following latest task. Do NOT re-implement previous features.
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
            let isInTag = false;
            let conversationalBuffer = "";
            let explanationSent = false;
            let inExplanation = false;
            let explanationBuffer = "";
            let fileTagBuffer = ""; // small rolling buffer

            console.log("[API] Starting to stream text...");
            for await (const textPart of result.textStream) {
              const text = textPart || "";
              // Accumulate ALL text
              generatedCode += text;

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

              // Tag boundary detection
              const hasOpenTag =
                /<(file|package|packages|explanation|command|structure|template)\b/.test(
                  text
                );
              const hasCloseTag =
                /<\/(file|package|packages|explanation|command|structure|template)>/.test(
                  text
                );

              if (hasOpenTag) {
                if (conversationalBuffer.trim() && !isInTag) {
                  console.log(
                    `[API] Sending conversational text: "${conversationalBuffer
                      .trim()
                      .substring(0, 50)}..."`
                  );
                  send("stream", { content: conversationalBuffer.trim() });
                  conversationalBuffer = "";
                }
                isInTag = true;
              }

              if (hasCloseTag) {
                isInTag = false;
                conversationalBuffer = "";
              }

              if (!isInTag && !hasOpenTag && !hasCloseTag) {
                conversationalBuffer += text;
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
