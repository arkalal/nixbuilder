"use client";

/**
 * Studio Page - Chef Architecture
 * Uses useChat from @ai-sdk/react with full tool support
 * Exact replica of Chef's frontend architecture
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useStore } from "@nanostores/react";
import StudioLayout from "../../../../components/Studio/StudioLayout/StudioLayout";
import Composer from "../../../../components/Studio/Composer/Composer";
import RightPanel from "../../../../components/Studio/RightPanel/RightPanel";
import {
  useMessageParser,
  StreamingMessageParser,
} from "../../../../lib/hooks/useMessageParser";
import { workbenchStore } from "../../../../lib/stores/workbench";
import styles from "./Studio.module.scss";

// Max steps for iteration (Chef uses 64)
const MAX_STEPS = 64;

// Helper to get file type (outside component to avoid re-creation)
function getFileType(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jsx" || ext === "js") return "javascript";
  if (ext === "css" || ext === "scss") return "css";
  if (ext === "json") return "json";
  return "text";
}

export default function StudioPage() {
  // Local state
  const [selectedModel, setSelectedModel] = useState(
    "anthropic/claude-3.5-sonnet"
  );
  const [activeTab, setActiveTab] = useState("code");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [logs, setLogs] = useState([]);
  const [localFiles, setLocalFiles] = useState([]);
  const [stage, setStage] = useState("idle");

  // Workbench store subscriptions
  const files = useStore(workbenchStore.files);
  const streamingFile = useStore(workbenchStore.streamingFile);
  const showWorkbench = useStore(workbenchStore.showWorkbench);

  // Message parser (Chef pattern)
  const {
    parsedMessages,
    parseMessages,
    reset: resetParser,
  } = useMessageParser();

  // Refs
  const messagesEndRef = useRef(null);

  // useChat hook (exact Chef pattern)
  const {
    messages,
    setMessages,
    append,
    reload,
    stop,
    status,
    error,
    isLoading,
  } = useChat({
    api: "/api/chat",
    maxSteps: MAX_STEPS,

    // Request body
    body: {
      model: selectedModel,
    },

    // Handle client-side tool calls (Chef pattern)
    async onToolCall({ toolCall }) {
      console.log("[Studio] Tool call:", toolCall.toolName, toolCall.args);

      // For client-side tools, we could handle them here
      // But our tools are server-side with execute functions
      // So this is mainly for logging

      return undefined; // Let server handle it
    },

    // Error handling (Chef pattern)
    onError: (err) => {
      console.error("[Studio] Chat error:", err);
      setStage("idle");
      setLogs((prev) => [
        ...prev,
        {
          type: "error",
          message: err.message,
          timestamp: new Date().toISOString(),
        },
      ]);
    },

    // Completion handling (Chef pattern)
    onFinish: (message, { finishReason }) => {
      console.log("[Studio] Chat finished:", finishReason);
      setStage("done");

      // Mark all actions complete
      workbenchStore.abortAllActions();
    },
  });

  // Parse messages when they update (Chef pattern)
  useEffect(() => {
    if (messages.length > 0) {
      parseMessages(messages);
    }
  }, [messages, parseMessages]);

  // Update stage based on status
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      setStage("generating");
    } else if (status === "ready" && stage === "generating") {
      setStage("done");
    }
  }, [status, stage]);

  // Sync files from workbench store to local state
  useEffect(() => {
    const allFiles = workbenchStore.getAllFiles();
    const fileArray = Object.entries(allFiles).map(([path, content]) => ({
      path,
      content,
      type: getFileType(path),
    }));

    if (fileArray.length > 0) {
      setLocalFiles(fileArray);
    }
  }, [files]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [parsedMessages]);

  // Send message handler
  const handleSendMessage = useCallback(
    async (content) => {
      if (!content.trim()) return;

      console.log("[Studio] Sending message:", content.slice(0, 50) + "...");

      // Clear workbench for new generation
      workbenchStore.clearActions();
      workbenchStore.clearFiles();
      resetParser();
      setStage("generating");
      setLocalFiles([]);

      // Append message (Chef pattern)
      await append({
        role: "user",
        content: content.trim(),
      });
    },
    [append, resetParser]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    stop();
    workbenchStore.abortAllActions();
    setStage("idle");
  }, [stop]);

  // Build messages for Composer display
  const displayMessages = parsedMessages.map((msg, idx) => {
    if (msg.role === "user") {
      return {
        id: msg.id || `user-${idx}`,
        role: "user",
        content: msg.content,
      };
    }

    // Assistant message - strip artifacts for display
    let displayContent = msg.displayContent || "";
    if (!displayContent && msg.content) {
      displayContent = StreamingMessageParser.stripArtifacts(msg.content);
    }

    // Build activities from tool parts
    const activities = [];
    if (msg.parts) {
      msg.parts.forEach((part, partIdx) => {
        if (part.type === "tool-invocation") {
          activities.push({
            id: `tool-${partIdx}`,
            message: `${part.toolInvocation.toolName}`,
            status:
              part.toolInvocation.state === "result"
                ? "completed"
                : "in_progress",
          });
        }
      });
    }

    // Add file activities from workbench
    const completedFiles = workbenchStore.getCompletedFiles();
    completedFiles.forEach((file, fileIdx) => {
      if (!activities.find((a) => a.message?.includes(file.path))) {
        activities.push({
          id: `file-${fileIdx}`,
          message: `Create ${file.path}`,
          status: "completed",
          file: file.path,
        });
      }
    });

    return {
      id: msg.id || `assistant-${idx}`,
      role: "assistant",
      content: displayContent.trim() || "Building your application...",
      activities,
      completedFilesSnapshot: completedFiles,
    };
  });

  // Current streaming file for display
  const currentStreamingFile = streamingFile
    ? {
        path: streamingFile.path,
        content: streamingFile.content,
        type: getFileType(streamingFile.path),
      }
    : null;

  return (
    <StudioLayout>
      <div className={styles.studioContainer}>
        {/* Left panel - Chat/Composer */}
        <div className={styles.leftPanel}>
          <Composer
            messages={displayMessages}
            onSendMessage={handleSendMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            streamingCode=""
            currentFile={currentStreamingFile}
            completedFiles={workbenchStore.getCompletedFiles()}
            existingFiles={[]}
            stage={stage}
            onStop={handleStop}
          />
          <div ref={messagesEndRef} />
        </div>

        {/* Right panel - Code/Preview/Logs */}
        <div className={styles.rightPanel}>
          <RightPanel
            files={localFiles}
            logs={logs}
            previewUrl={previewUrl}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedFileFromWorkbench={null}
            stage={stage}
            currentFile={currentStreamingFile}
            completedFiles={workbenchStore.getCompletedFiles()}
            onFileSelect={(file) => {
              workbenchStore.setCurrentDocument(file.path, file.content);
            }}
            onFileUpdate={(path, content) => {
              workbenchStore.setFile(path, content);
              setLocalFiles((prev) =>
                prev.map((f) => (f.path === path ? { ...f, content } : f))
              );
            }}
          />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className={styles.errorBanner}>Error: {error.message}</div>
      )}
    </StudioLayout>
  );
}
