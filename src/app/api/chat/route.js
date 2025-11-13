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
    console.log("[API] Session check:", session ? "✓ Authenticated" : "✗ Not authenticated");
    
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, model, temperature } = body;
    console.log("[API] Request:", { message: message.substring(0, 50) + "...", model, temperature });

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Create SSE stream
    const { stream, send, close } = createSSEStream();
    console.log("[API] SSE stream created");

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

        // Generate code with streaming
        console.log("[API] Calling generateCode...");
        const result = await generateCode(message, {
          model,
          temperature,
          vfs: globalVFS,
        });
        console.log("[API] generateCode returned");

        // Track accumulated text and file boundaries (open-lovable approach)
        let generatedCode = "";
        let currentFilePath = "";
        let currentFileContent = "";
        let isInFile = false;
        let isInTag = false;
        let conversationalBuffer = "";
        let explanationSent = false;
        const completedFiles = new Map(); // Track completed files in real-time

        // Stream the AI response using textStream (open-lovable approach - line 1397)
        console.log("[API] Starting to stream text...");
        for await (const textPart of result.textStream) {
          const text = textPart || '';
          
          // Accumulate ALL text for final parsing
          generatedCode += text;
          
          // Send raw stream for code display (open-lovable line 1434-1438)
          send("rawStream", { text, raw: true });
          
          // Extract and send explanation IMMEDIATELY when detected (before file generation)
          if (!explanationSent && generatedCode.includes('<explanation>') && generatedCode.includes('</explanation>')) {
            const explanationMatch = generatedCode.match(/<explanation>([\s\S]*?)<\/explanation>/);
            if (explanationMatch) {
              const explanation = explanationMatch[1].trim();
              console.log(`[API] 🎯 IMMEDIATE explanation: "${explanation.substring(0, 100)}..."`);
              send("explanation", { text: explanation });
              explanationSent = true;
            }
          }
          
          // Check for XML tag boundaries (open-lovable line 1409-1431)
          const hasOpenTag = /<(file|package|packages|explanation|command|structure|template)\b/.test(text);
          const hasCloseTag = /<\/(file|package|packages|explanation|command|structure|template)>/.test(text);
          
          if (hasOpenTag) {
            // Send any buffered conversational text before the tag
            if (conversationalBuffer.trim() && !isInTag) {
              console.log(`[API] Sending conversational text: "${conversationalBuffer.trim().substring(0, 50)}..."`);
              send("stream", { content: conversationalBuffer.trim() });
              conversationalBuffer = '';
            }
            isInTag = true;
          }
          
          if (hasCloseTag) {
            isInTag = false;
            // Clear any XML content that leaked into conversational buffer
            conversationalBuffer = '';
          }
          
          // If we're not in a tag AND no tags in this chunk, buffer as conversational text
          if (!isInTag && !hasOpenTag && !hasCloseTag) {
            conversationalBuffer += text;
          }
          
          // Check for file start (for progress updates)
          if (text.includes('<file path="')) {
            const pathMatch = text.match(/<file path="([^"]+)"/);
            if (pathMatch) {
              currentFilePath = pathMatch[1];
              currentFileContent = ""; // Reset content accumulator
              isInFile = true;
              console.log(`[API] 📄 File STARTED: ${currentFilePath} | isInFile=${isInFile}`);
              
              send("activity", {
                message: `Generating ${currentFilePath}`,
                status: "in_progress",
                file: currentFilePath,
              });
            }
          }
          
          // Check for file end in CURRENT text chunk - SEND file_write IN REAL-TIME!
          if (isInFile && text.includes('</file>') && currentFilePath) {
            console.log(`[API] 🔍 Detected </file> tag for: ${currentFilePath}`);
            // Extract complete file content from accumulated generatedCode
            const escapedPath = currentFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const fileMatch = generatedCode.match(new RegExp(`<file path="${escapedPath}">([\s\S]*?)</file>`));
            
            if (fileMatch && !completedFiles.has(currentFilePath)) {
              const completeContent = fileMatch[1].trim();
              completedFiles.set(currentFilePath, completeContent);
              
              console.log(`[API] ✅ File COMPLETED IN REAL-TIME: ${currentFilePath} (${completeContent.length} chars)`);
              
              // Write to VFS immediately
              globalVFS.writeFile(currentFilePath, completeContent);
              
              // Send file_write IN REAL-TIME (not after streaming!)
              console.log(`[API] 📤 Sending file_write event for: ${currentFilePath}`);
              send("file_write", {
                path: currentFilePath,
                content: completeContent,
              });
              
              send("activity", {
                message: `Created ${currentFilePath}`,
                status: "completed",
                file: currentFilePath,
              });
              
              isInFile = false;
              currentFilePath = '';
              currentFileContent = '';
            } else if (!fileMatch) {
              console.log(`[API] ⚠️ File match FAILED for: ${currentFilePath}`);
            } else if (completedFiles.has(currentFilePath)) {
              console.log(`[API] ⚠️ File already completed: ${currentFilePath}`);
            }
          }
        }
        
        // Send any remaining conversational text (open-lovable line 1509-1514)
        if (conversationalBuffer.trim()) {
          console.log(`[API] Sending final conversational text: "${conversationalBuffer.trim().substring(0, 100)}..."`);
          send("stream", { content: "\n\n" + conversationalBuffer.trim() });
        }
        
        console.log(`[API] ✅ Stream finished! ${completedFiles.size} files sent in real-time`);
        
        send("activity", {
          message: "Code generation complete",
          status: "completed",
        });

        // Send final files
        const allFiles = globalVFS.getAllFiles();
        const fileCount = Object.keys(allFiles).length;
        console.log(`[API] Sending ${fileCount} files in complete event`);
        send("complete", { files: allFiles });
        send("stage", { stage: "done" });
      } catch (error) {
        console.error("Chat API error:", error);
        send("error", {
          code: "GENERATION_FAILED",
          message: error.message || "Code generation failed",
        });
        send("stage", { stage: "idle" });
      } finally {
        close();
      }
    })();

    return createSSEResponse(stream);
  } catch (error) {
    console.error("Chat route error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
