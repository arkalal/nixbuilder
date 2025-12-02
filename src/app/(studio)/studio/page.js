"use client";

/**
 * Studio Page - EXACT Chef Architecture
 * Frontend: useChat() from @ai-sdk/react
 * Backend: createDataStream() → streamText() → mergeIntoDataStream() → toDataStreamResponse()
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import StudioLayout from "../../../../components/Studio/StudioLayout/StudioLayout";
import Composer from "../../../../components/Studio/Composer/Composer";
import RightPanel from "../../../../components/Studio/RightPanel/RightPanel";
import { globalVFS } from "../../../../lib/vfs";
import styles from "./Studio.module.scss";

// Tag constants for parsing (Chef pattern)
const ARTIFACT_TAG_OPEN = "<boltArtifact";
const ARTIFACT_TAG_CLOSE = "</boltArtifact>";
const ACTION_TAG_OPEN = "<boltAction";
const ACTION_TAG_CLOSE = "</boltAction>";

// Clean markdown from content
function cleanMarkdownSyntax(content) {
  let cleaned = content;
  const fullBlockRegex = /^\s*```[\w]*\n?([\s\S]*?)\n?```\s*$/;
  const fullMatch = cleaned.match(fullBlockRegex);
  if (fullMatch) return fullMatch[1];
  cleaned = cleaned.replace(/```[\w]*\n([\s\S]*?)\n```/g, "$1");
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```[\w]*\n?/, "");
  if (cleaned.endsWith("```")) cleaned = cleaned.replace(/\n?```$/, "");
  return cleaned;
}

// Clean escaped HTML entities
function cleanEscapedTags(content) {
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Strip artifacts from text for display
function stripArtifacts(content) {
  if (!content) return "";
  let result = "";
  let i = 0;
  while (i < content.length) {
    const startIdx = content.indexOf(ARTIFACT_TAG_OPEN, i);
    if (startIdx === -1) {
      result += content.slice(i);
      break;
    }
    result += content.slice(i, startIdx);
    const endIdx = content.indexOf(ARTIFACT_TAG_CLOSE, startIdx);
    if (endIdx === -1) break;
    i = endIdx + ARTIFACT_TAG_CLOSE.length;
  }
  return result.trim();
}

// Extract files from content
function extractFilesFromContent(content) {
  if (!content) return [];
  const files = [];
  const fileRegex =
    /<boltAction\s+[^>]*type="file"[^>]*>([\s\S]*?)<\/boltAction>/g;
  let match;

  while ((match = fileRegex.exec(content)) !== null) {
    const tag = match[0];
    const filePathMatch = tag.match(/filePath="([^"]+)"/);
    if (!filePathMatch) continue;

    let filePath = filePathMatch[1];
    if (filePath.startsWith("/")) filePath = filePath.slice(1);

    let fileContent = match[1];

    // Clean content
    if (!filePath.endsWith(".md")) {
      fileContent = cleanMarkdownSyntax(fileContent);
      fileContent = cleanEscapedTags(fileContent);
    }

    fileContent = fileContent.trim() + "\n";

    files.push({ path: filePath, content: fileContent });
  }

  return files;
}

// Get file type from extension
function getFileType(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jsx" || ext === "js") return "javascript";
  if (ext === "css" || ext === "scss") return "css";
  if (ext === "json") return "json";
  return "text";
}

export default function StudioPage() {
  // UI State
  const [selectedModel, setSelectedModel] = useState(
    "anthropic/claude-3.5-sonnet"
  );
  const [activeTab, setActiveTab] = useState("code");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [logs, setLogs] = useState([]);
  const [localFiles, setLocalFiles] = useState([]);
  const [completedFiles, setCompletedFiles] = useState([]);

  // Refs
  const processedFilesRef = useRef(new Set());

  // Tool execution handler (Chef pattern - client-side tool execution)
  const executeToolCall = useCallback(async (toolName, args) => {
    console.log(`[Studio] Executing tool: ${toolName}`, args);

    switch (toolName) {
      case "viewFile": {
        const path = args.filePath?.startsWith("/")
          ? args.filePath.slice(1)
          : args.filePath;
        const content = globalVFS.readFile(path);
        if (content === null) return `Error: File not found: ${path}`;
        return content;
      }
      case "editFile": {
        const path = args.filePath?.startsWith("/")
          ? args.filePath.slice(1)
          : args.filePath;
        const content = globalVFS.readFile(path);
        if (!content) return `Error: File not found: ${path}`;
        if (!content.includes(args.oldText))
          return `Error: Text to replace not found in file`;
        const newContent = content.replace(args.oldText, args.newText);
        globalVFS.writeFile(path, newContent);
        // Update local state
        setLocalFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, content: newContent } : f))
        );
        return `Successfully edited ${path}`;
      }
      case "deploy": {
        console.log(
          `[Studio] Deploy requested: ${args.message || "No message"}`
        );
        return "Deployment initiated. Preview will update shortly.";
      }
      default:
        return `Unknown tool: ${toolName}`;
    }
  }, []);

  // CHEF PATTERN: useChat from @ai-sdk/react
  const { messages, append, status, error } = useChat({
    api: "/api/chat",
    maxSteps: 64, // Chef uses 64 for iteration

    body: {
      model: selectedModel,
    },

    // CHEF PATTERN: onToolCall - client-side tool execution
    async onToolCall({ toolCall }) {
      console.log("[Studio] Tool call received:", toolCall.toolName);
      const result = await executeToolCall(toolCall.toolName, toolCall.args);
      console.log("[Studio] Tool call finished:", result);
      return result; // Return result to AI for iteration
    },

    onError: (err) => {
      console.error("[Studio] Chat error:", err);
      setLogs((prev) => [
        ...prev,
        {
          type: "error",
          message: err.message,
          timestamp: new Date().toISOString(),
        },
      ]);
    },

    onFinish: (message) => {
      console.log("[Studio] Chat finished");

      // Extract and write all files from final message
      if (message.content) {
        const files = extractFilesFromContent(message.content);
        files.forEach((file) => {
          globalVFS.writeFile(file.path, file.content);
        });

        if (files.length > 0) {
          setLocalFiles(
            files.map((f) => ({
              path: f.path,
              content: f.content,
              type: getFileType(f.path),
            }))
          );
          setCompletedFiles(files);
        }
      }
    },
  });

  // Derive stage from status
  const stage =
    status === "streaming" || status === "submitted"
      ? "generating"
      : status === "ready" && localFiles.length > 0
      ? "done"
      : "idle";

  // Process completed files from messages
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant" || !lastMessage.content) return;

    const content = lastMessage.content;
    const files = extractFilesFromContent(content);

    // Update files that we haven't processed yet
    files.forEach((file) => {
      if (!processedFilesRef.current.has(file.path)) {
        processedFilesRef.current.add(file.path);

        // Write to VFS
        globalVFS.writeFile(file.path, file.content);

        // Update local state
        setLocalFiles((prev) => {
          const existing = prev.findIndex((f) => f.path === file.path);
          const newFile = {
            path: file.path,
            content: file.content,
            type: getFileType(file.path),
          };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = newFile;
            return updated;
          }
          return [...prev, newFile];
        });

        setCompletedFiles((prev) => {
          const existing = prev.findIndex((f) => f.path === file.path);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = file;
            return updated;
          }
          return [...prev, file];
        });
      }
    });
  }, [messages]);

  // Derive currently streaming file from messages (no setState needed)
  const streamingFile = React.useMemo(() => {
    if (messages.length === 0) return null;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant" || !lastMessage.content) return null;

    const content = lastMessage.content;
    const lastActionOpen = content.lastIndexOf(ACTION_TAG_OPEN);

    if (lastActionOpen === -1) return null;

    const afterOpen = content.slice(lastActionOpen);
    const hasClose = afterOpen.includes(ACTION_TAG_CLOSE);

    if (hasClose) return null;

    // This is a streaming file
    const filePathMatch = afterOpen.match(/filePath="([^"]+)"/);
    const typeMatch = afterOpen.match(/type="([^"]+)"/);

    if (!filePathMatch || typeMatch?.[1] !== "file") return null;

    let filePath = filePathMatch[1];
    if (filePath.startsWith("/")) filePath = filePath.slice(1);

    // Get content after the opening tag
    const tagEnd = afterOpen.indexOf(">");
    if (tagEnd === -1) return null;

    let streamContent = afterOpen.slice(tagEnd + 1);
    if (!filePath.endsWith(".md")) {
      streamContent = cleanMarkdownSyntax(streamContent);
      streamContent = cleanEscapedTags(streamContent);
    }

    return {
      path: filePath,
      content: streamContent,
      type: getFileType(filePath),
    };
  }, [messages]);

  // Use streamingFile for display
  const displayCurrentFile = streamingFile;

  // Build display messages for Composer
  const displayMessages = messages.map((msg, idx) => {
    if (msg.role === "user") {
      return {
        id: msg.id || `user-${idx}`,
        role: "user",
        content: msg.content,
      };
    }

    // Assistant message - strip artifacts for display
    const displayContent = stripArtifacts(msg.content);

    // Build activities from completed files
    const activities = completedFiles.map((file, fileIdx) => ({
      id: `file-${fileIdx}`,
      message: `Create ${file.path}`,
      status: "completed",
      file: file.path,
    }));

    return {
      id: msg.id || `assistant-${idx}`,
      role: "assistant",
      content: displayContent || "Building your application...",
      activities,
      completedFilesSnapshot: completedFiles,
    };
  });

  // Send message handler
  const handleSendMessage = useCallback(
    async (content) => {
      if (!content.trim()) return;

      console.log("[Studio] Sending:", content.slice(0, 50) + "...");

      // Clear state for new generation
      processedFilesRef.current.clear();
      setLocalFiles([]);
      setCompletedFiles([]);
      globalVFS.clear?.();

      // Append message (Chef pattern - useChat handles the rest)
      await append({
        role: "user",
        content: content.trim(),
      });
    },
    [append]
  );

  return (
    <>
      <StudioLayout
        leftPanel={
          <Composer
            messages={displayMessages}
            onSendMessage={handleSendMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            streamingCode=""
            currentFile={displayCurrentFile}
            completedFiles={completedFiles}
            existingFiles={[]}
            stage={stage}
          />
        }
        rightPanel={
          <RightPanel
            files={localFiles}
            logs={logs}
            previewUrl={previewUrl}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedFileFromWorkbench={null}
            stage={stage}
            currentFile={displayCurrentFile}
            onFileUpdate={(path, content) => {
              globalVFS.writeFile(path, content);
              setLocalFiles((prev) =>
                prev.map((f) => (f.path === path ? { ...f, content } : f))
              );
            }}
          />
        }
      />

      {/* Error display */}
      {error && (
        <div className={styles.errorBanner}>Error: {error.message}</div>
      )}
    </>
  );
}
