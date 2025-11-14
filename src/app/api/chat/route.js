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
        let isInFile = false;
        let isInTag = false;
        let conversationalBuffer = "";
        let explanationSent = false;
        // Rolling buffer to detect multiple <file> openings across chunk boundaries
        let fileTagBuffer = "";

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
          
          // Check for ALL file starts in this chunk using a small rolling buffer
          const searchText = (fileTagBuffer + text);
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
          // Keep last 100 chars to catch split tags
          fileTagBuffer = searchText.slice(-100);
          
          // Check for file end (for activity progress only)
          if (isInFile && text.includes('</file>') && currentFilePath) {
            console.log(`[API] ✅ File COMPLETED: ${currentFilePath}`);
            
            send("activity", {
              message: `Created ${currentFilePath}`,
              status: "completed",
              file: currentFilePath,
            });
            
            isInFile = false;
            currentFilePath = '';
          }
        }
        
        console.log(`[API] ✅ Stream finished! Parsing files for VFS...`);
        
        // Store final conversational text to send with complete event
        const finalConversation = conversationalBuffer.trim();
        if (finalConversation) {
          console.log(`[API] Final conversational text saved for complete event: "${finalConversation.substring(0, 100)}..."`);
        }
        
        // Parse files from generatedCode and write to VFS (for backend storage/export)
        const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
        let fileMatch;
        const parsedFiles = {};
        
        while ((fileMatch = fileRegex.exec(generatedCode)) !== null) {
          const filePath = fileMatch[1];
          const fileContent = fileMatch[2].trim();
          parsedFiles[filePath] = fileContent;
          globalVFS.writeFile(filePath, fileContent);
        }
        
        console.log(`[API] ✅ Parsed ${Object.keys(parsedFiles).length} files to VFS`);
        
        send("activity", {
          message: "Code generation complete",
          status: "completed",
        });

        // Send final files (for fallback if client-side parsing fails)
        const allFiles = globalVFS.getAllFiles();
        const fileCount = Object.keys(allFiles).length;
        console.log(`[API] Sending ${fileCount} files in complete event`);
        send("complete", { 
          files: allFiles,
          finalMessage: finalConversation || undefined // Send final text with complete
        });
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
