"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import StudioLayout from "../../../../components/Studio/StudioLayout/StudioLayout";
import Composer from "../../../../components/Studio/Composer/Composer";
import RightPanel from "../../../../components/Studio/RightPanel/RightPanel";
import styles from "./Studio.module.scss";
import {
  syncFilesWithEditor,
  clearEditorState,
} from "../../../../stores/workbench";

// Message Parser for extracting files from boltArtifact tags
function parseFilesFromMessage(content) {
  const files = [];
  const artifactRegex = /<boltArtifact[^>]*>([\s\S]*?)<\/boltArtifact>/g;
  const actionRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

  let artifactMatch;
  while ((artifactMatch = artifactRegex.exec(content)) !== null) {
    const artifactContent = artifactMatch[1];
    let actionMatch;
    while ((actionMatch = actionRegex.exec(artifactContent)) !== null) {
      const path = actionMatch[1].startsWith("/")
        ? actionMatch[1].slice(1)
        : actionMatch[1];
      const fileContent = actionMatch[2].trim();
      files.push({ path, content: fileContent });
    }
  }

  return files;
}

// Extract text outside of artifacts for display
function stripArtifacts(content) {
  return content
    .replace(/<boltArtifact[^>]*>[\s\S]*?<\/boltArtifact>/g, "")
    .trim();
}

export default function StudioPage() {
  const [selectedModel, setSelectedModel] = useState(
    "anthropic/claude-3.5-sonnet"
  );
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [stage, setStage] = useState("idle");
  const [completedFiles, setCompletedFiles] = useState([]);
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Use the Vercel AI SDK's useChat hook (Chef approach)
  const { messages, isLoading, setMessages, append, status } = useChat({
    api: "/api/chat",
    maxSteps: 20,
    onToolCall: async ({ toolCall }) => {
      console.log("[Frontend] Tool call:", toolCall.toolName, toolCall.args);

      // Handle file writes from tools
      if (toolCall.toolName === "writeFile" && toolCall.args?.path) {
        const path = toolCall.args.path;
        const content = toolCall.args.content || "";

        // Add to files
        setFiles((prev) => {
          const existing = prev.find((f) => f.path === path);
          if (existing) {
            return prev.map((f) => (f.path === path ? { ...f, content } : f));
          }
          return [...prev, { path, content }];
        });

        // Add to completed files
        setCompletedFiles((prev) => {
          if (prev.some((f) => f.path === path)) return prev;
          return [...prev, { path, content }];
        });

        console.log("[Frontend] File added:", path);
      }

      // Return empty string - tool execution happens on server
      return "";
    },
    onFinish: (message) => {
      console.log("[Frontend] Message finished:", message.id);
      setStage("done");

      // Parse any files from the message content
      if (message.content) {
        const parsedFiles = parseFilesFromMessage(message.content);
        if (parsedFiles.length > 0) {
          setFiles((prev) => {
            const newFiles = [...prev];
            for (const file of parsedFiles) {
              const existingIdx = newFiles.findIndex(
                (f) => f.path === file.path
              );
              if (existingIdx >= 0) {
                newFiles[existingIdx] = file;
              } else {
                newFiles.push(file);
              }
            }
            return newFiles;
          });
          setCompletedFiles((prev) => [
            ...prev,
            ...parsedFiles.filter((f) => !prev.some((p) => p.path === f.path)),
          ]);
        }
      }
    },
    onError: (error) => {
      console.error("[Frontend] Chat error:", error);
      setStage("idle");
    },
  });

  // Derive stage from status (no effect needed)
  const derivedStage =
    status === "streaming" || status === "submitted"
      ? "generating"
      : status === "ready" && messages.length > 0
      ? "done"
      : stage;

  // Sync files with editor
  useEffect(() => {
    syncFilesWithEditor(files);
  }, [files]);

  // Custom submit handler
  const handleSend = useCallback(
    async (messageText) => {
      if (!messageText.trim()) return;

      setStage("generating");
      setCompletedFiles([]);

      await append({
        role: "user",
        content: messageText,
      });
    },
    [append]
  );

  // Handle new project
  const handleNewProject = useCallback(() => {
    setMessages([]);
    setFiles([]);
    setCompletedFiles([]);
    setCurrentFile(null);
    setStage("idle");
    clearEditorState();
  }, [setMessages]);

  // Convert messages to our format
  const displayMessages = messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content:
      msg.role === "assistant" ? stripArtifacts(msg.content) : msg.content,
    timestamp: new Date().toISOString(),
    activities:
      msg.toolInvocations?.map((inv) => ({
        id: inv.toolCallId,
        message: `${inv.toolName}: ${inv.args?.path || ""}`,
        status: inv.state === "result" ? "completed" : "in_progress",
        file: inv.args?.path,
      })) || [],
  }));

  // Get activities from latest assistant message
  const latestAssistantMsg = displayMessages
    .filter((m) => m.role === "assistant")
    .pop();
  const activities = latestAssistantMsg?.activities || [];

  return (
    <StudioLayout
      onNewProject={handleNewProject}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
    >
      <div className={styles.studioContainer}>
        <div className={styles.leftPanel}>
          <Composer
            messages={displayMessages}
            onSend={handleSend}
            isGenerating={isLoading}
            stage={derivedStage}
            activities={activities}
            completedFiles={completedFiles}
          />
        </div>
        <div className={styles.rightPanel}>
          <RightPanel
            files={files}
            currentFile={currentFile}
            onFileSelect={setCurrentFile}
            isGenerating={isLoading}
            onFilesChange={setFiles}
            stage={derivedStage}
          />
        </div>
      </div>
    </StudioLayout>
  );
}
