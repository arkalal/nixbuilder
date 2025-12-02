import { generateCode } from "../../../../lib/services/writer";
import { createSSEStream, createSSEResponse } from "../../../../lib/sse";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth";
import { globalVFS } from "../../../../lib/vfs";
import { validateAndFixJSXFile } from "../../../../lib/jsxValidator";

// Clean markdown code block syntax from file content (Chef approach)
function cleanMarkdownSyntax(content) {
  // Match ```lang\n...content...\n``` pattern - handles various formats
  let cleaned = content;

  // Pattern 1: Full code block with language
  const fullBlockRegex = /^\s*```[\w]*\n?([\s\S]*?)\n?```\s*$/;
  const fullMatch = cleaned.match(fullBlockRegex);
  if (fullMatch) {
    return fullMatch[1];
  }

  // Pattern 2: Code block anywhere in content (not just at start/end)
  cleaned = cleaned.replace(/```[\w]*\n([\s\S]*?)\n```/g, "$1");

  // Pattern 3: Inline backticks at start
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\n?```$/, "");
  }

  return cleaned;
}

// Clean escaped HTML entities (Chef approach)
function cleanEscapedTags(content) {
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Remove ALL XML/file tags that shouldn't be in code
function removeFileTags(content) {
  let cleaned = content;
  // Remove opening file tags with any attributes
  cleaned = cleaned.replace(/<file\s+[^>]*>/gi, "");
  // Remove closing file tags (with or without proper closing)
  cleaned = cleaned.replace(/<\/file\s*>/gi, "");
  cleaned = cleaned.replace(/<\/file\b/gi, ""); // Partial tag
  // Remove explanation tags
  cleaned = cleaned.replace(/<\/?explanation\s*>/gi, "");
  // Remove any other artifact tags that might leak through
  cleaned = cleaned.replace(/<\/?boltArtifact[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?boltAction[^>]*>/gi, "");
  return cleaned;
}

// Master clean function for file content
function cleanFileContent(content, filePath) {
  let cleaned = content;

  // Only clean markdown for non-markdown files
  if (!filePath.endsWith(".md")) {
    cleaned = cleanMarkdownSyntax(cleaned);
    cleaned = cleanEscapedTags(cleaned);
  }

  // ALWAYS remove file/XML tags - do this AFTER escaping is handled
  cleaned = removeFileTags(cleaned);

  return cleaned.trim();
}

// Helper to repair common JSON issues from AI output
function repairJSON(content) {
  let fixed = content;
  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,(\s*[}\]])/g, "$1");
  // Remove JavaScript-style comments (// and /* */)
  fixed = fixed.replace(/\/\/[^\n]*/g, "");
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, "");
  // Fix single quotes to double quotes (simple cases)
  fixed = fixed.replace(/:\s*'([^']+)'/g, ': "$1"');
  fixed = fixed.replace(/{\s*'([^']+)'/g, '{ "$1"');
  // Try to validate - if still broken, return original (let downstream handle it)
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return content; // Return original if repair didn't help
  }
}

// Validate and fix next.config.mjs if incomplete
function fixNextConfig(content) {
  // Check if config is complete
  const hasNextConfig = /const\s+nextConfig\s*=\s*\{/.test(content);
  const hasExportDefault = /export\s+default\s+(nextConfig|\{)/.test(content);

  // If it has nextConfig but incomplete export, fix it
  if (hasNextConfig && !hasExportDefault) {
    console.log("[API] Fixing incomplete next.config.mjs");
    // Remove any incomplete export statement
    let fixed = content.replace(/export\s*$/, "").trim();
    // Ensure proper closing
    if (!fixed.endsWith(";")) {
      fixed = fixed.replace(/\}?\s*$/, "};");
    }
    // Add proper export
    fixed += "\n\nexport default nextConfig;\n";
    return fixed;
  }

  return content;
}

// Note: validateAndFixJSXFile is imported from ../../../../lib/jsxValidator
// which uses acorn parser for proper JSX syntax validation

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

              // Process close tag FIRST to clear state
              if (hasCloseTag) {
                isInTag = false;
                conversationalBuffer = "";
              }

              // Then process open tag - this ensures if both are present, we end up inside the new tag
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

              // Only add to conversational buffer if not in any tag
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

            // Get final conversational text - either from buffer or extract from after last file
            let finalConversation = conversationalBuffer.trim();

            // If no final message in buffer, try to extract text after the last </file> tag
            if (!finalConversation) {
              const lastFileClose = generatedCode.lastIndexOf("</file>");
              if (lastFileClose !== -1) {
                const afterLastFile = generatedCode
                  .slice(lastFileClose + 7)
                  .trim();
                // Clean up any remaining XML tags
                const cleaned = afterLastFile.replace(/<\/?[^>]+>/g, "").trim();
                if (cleaned && cleaned.length > 10) {
                  finalConversation = cleaned;
                }
              }
            }

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
              let fileContent = fileMatch[2];

              // Clean all markdown, escaped tags, and XML tags (Chef approach)
              fileContent = cleanFileContent(fileContent, filePath);

              // Auto-repair JSON files if malformed
              if (filePath.endsWith(".json")) {
                fileContent = repairJSON(fileContent);
              }

              // Fix incomplete next.config.mjs
              if (filePath === "next.config.mjs") {
                fileContent = fixNextConfig(fileContent);
              }

              // Validate and fix incomplete JS/JSX files using proper parser
              if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
                fileContent = validateAndFixJSXFile(fileContent, filePath);
              }

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
