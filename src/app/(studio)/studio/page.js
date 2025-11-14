"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import StudioLayout from "../../../../components/Studio/StudioLayout/StudioLayout";
import Composer from "../../../../components/Studio/Composer/Composer";
import RightPanel from "../../../../components/Studio/RightPanel/RightPanel";
import styles from "./Studio.module.scss";

export default function StudioPage() {
  const [messages, setMessages] = useState([]);
  const [stage, setStage] = useState("idle"); // idle | planning | generating | previewing | done
  const [files, setFiles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeTab, setActiveTab] = useState("code"); // code | preview | logs
  const [selectedModel, setSelectedModel] = useState(
    "anthropic/claude-3.5-sonnet"
  );

  // Open-lovable style streaming state
  const [streamingCode, setStreamingCode] = useState("");
  const [currentFile, setCurrentFile] = useState(null); // { path, content, type }
  const [completedFiles, setCompletedFiles] = useState([]); // Persisted completed files for this generation
  // Queue to briefly display fast-completing files so each file is visibly streamed
  const displayQueueRef = useRef([]);
  const isDisplayingRef = useRef(false);

  const processDisplayQueue = useCallback(() => {
    if (isDisplayingRef.current) return;
    if (!displayQueueRef.current || displayQueueRef.current.length === 0)
      return;
    isDisplayingRef.current = true;
    const next = displayQueueRef.current.shift();
    if (next) {
      setCurrentFile({
        path: next.path,
        content: next.content,
        type: next.type,
      });
      setTimeout(() => {
        isDisplayingRef.current = false;
        processDisplayQueue();
      }, 450);
    } else {
      isDisplayingRef.current = false;
    }
  }, []);

  // Parse files from streamingCode in real-time (EXACT open-lovable approach - lines 2874-2968)
  useEffect(() => {
    if (!streamingCode || stage !== "generating") return;

    // Extract ALL completed files from accumulated stream (open-lovable line 2889)
    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
    let match;
    const newFiles = [];

    // Build processedFiles Set from CURRENT state (open-lovable line 2891)
    const processedFiles = new Set(files.map((f) => f.path));

    while ((match = fileRegex.exec(streamingCode)) !== null) {
      const filePath = match[1];
      const fileContent = match[2].trim();

      // Only add if we haven't processed this file yet (open-lovable line 2898)
      if (!processedFiles.has(filePath)) {
        const fileExt = filePath.split(".").pop();
        const fileType =
          fileExt === "jsx" || fileExt === "js"
            ? "javascript"
            : fileExt === "css" || fileExt === "scss"
            ? "css"
            : fileExt === "json"
            ? "json"
            : "text";

        // Add new file IMMEDIATELY (open-lovable line 2923-2929)
        console.log(
          `[Frontend] ✅ File completed: ${filePath} - Adding to files array`
        );
        newFiles.push({
          path: filePath,
          content: fileContent,
          type: fileType,
          createdAt: new Date().toISOString(),
          completed: true,
        });
        processedFiles.add(filePath);
      }
    }

    // Add completed files to state IMMEDIATELY (open-lovable does this synchronously)
    if (newFiles.length > 0) {
      console.log(
        `[Frontend] 📂 Adding ${newFiles.length} completed files immediately`
      );
      setFiles((prev) => [...prev, ...newFiles]);
      setCompletedFiles((prev) => [
        ...prev,
        ...newFiles.map((f) => ({ path: f.path, content: f.content })),
      ]);

      // Auto-switch to Code tab on first file
      if (files.length === 0) {
        setActiveTab("code");
      }
    }

    // Determine current streaming file by finding the LAST opened <file> that has no closing </file> yet
    let lastOpenMatch = null;
    const openTagRegex = /<file path="([^"]+)">/g;
    let tmpMatch;
    while ((tmpMatch = openTagRegex.exec(streamingCode)) !== null) {
      lastOpenMatch = {
        index: tmpMatch.index,
        path: tmpMatch[1],
        openTagLength: tmpMatch[0].length,
      };
    }

    if (lastOpenMatch) {
      const searchFrom = lastOpenMatch.index + lastOpenMatch.openTagLength;
      const remainder = streamingCode.slice(searchFrom);
      const hasClose = remainder.includes("</file>");
      if (!hasClose) {
        const filePath = lastOpenMatch.path;
        const partialContent = remainder;
        if (!processedFiles.has(filePath)) {
          const fileExt = filePath.split(".").pop();
          const fileType =
            fileExt === "jsx" || fileExt === "js"
              ? "javascript"
              : fileExt === "css" || fileExt === "scss"
              ? "css"
              : fileExt === "json"
              ? "json"
              : "text";
          console.log(
            `[Frontend] 📝 STREAMING: ${filePath} (${partialContent.length} chars)`
          );
          setCurrentFile({
            path: filePath,
            content: partialContent,
            type: fileType,
          });
          // Active streaming takes precedence over any queued displays
          displayQueueRef.current = [];
          isDisplayingRef.current = false;
        }
      } else {
        // The last opened file has already closed; fall through to queue logic
        // (currentFile will be cleared below if applicable)
        if (!newFiles.length) {
          setCurrentFile(null);
        }
      }
    } else {
      // No incomplete file - queue every newly completed file for brief display (ensures visibility per file)
      if (newFiles.length > 0) {
        displayQueueRef.current.push(...newFiles);
        processDisplayQueue();
      } else {
        // No active streaming and no new completed files - clear currentFile
        setCurrentFile(null);
      }
    }
  }, [streamingCode, stage, files, processDisplayQueue]);

  const handleSendMessage = async (message) => {
    // Add user message
    const userMessage = {
      id: Date.now(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create AI message placeholder
    const aiMessageId = Date.now() + 1;
    const aiMessage = {
      id: aiMessageId,
      role: "assistant",
      content: "Analyzing your request...",
      timestamp: new Date().toISOString(),
      activities: [],
    };
    setMessages((prev) => [...prev, aiMessage]);

    try {
      // Call /api/chat with SSE
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, model: selectedModel }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error:", response.status, errorText);
        throw new Error(`API error: ${response.statusText}`);
      }

      console.log("Starting SSE stream...");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("SSE stream ended");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            if (currentEvent) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                console.log("SSE event:", currentEvent, data);
                handleSSEEvent(currentEvent, data, aiMessageId);
                currentEvent = null;
              } catch (e) {
                console.error("Failed to parse SSE data:", e, line);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setStage("idle");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? {
                ...msg,
                content: `Error: ${error.message}`,
                activities: [
                  ...msg.activities,
                  {
                    id: Date.now(),
                    message: "Failed to generate plan",
                    status: "error",
                  },
                ],
              }
            : msg
        )
      );
    }
  };

  const handleSSEEvent = (event, data, messageId) => {
    switch (event) {
      case "stage":
        setStage(data.stage);
        if (data.stage === "generating") {
          console.log(`[Frontend] 🎬 NEW GENERATION STARTED - Clearing state`);
          setStreamingCode(""); // Clear streaming code on new generation
          setCurrentFile(null);
          setCompletedFiles([]); // Clear completed files on new generation
          setFiles([]); // Clear files array for fresh start
          // Reset display queue
          displayQueueRef.current = [];
          isDisplayingRef.current = false;
        }
        break;

      case "explanation":
        // Add explanation text to AI message BEFORE other content (open-lovable approach)
        if (data.text) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === messageId) {
                // Set explanation as INITIAL content (will be FIRST message)
                return {
                  ...msg,
                  content: data.text,
                  hasExplanation: true, // Flag to prevent stream events from overwriting
                };
              }
              return msg;
            })
          );
        }
        break;

      case "rawStream":
        // Accumulate all raw streaming text (open-lovable approach)
        if (data.text && data.raw) {
          setStreamingCode((prev) => prev + data.text);
        }
        break;

      case "activity":
        // Update activities (dedupe by file/message) and set currentFile on start
        if (data.status === "in_progress" && data.file) {
          const fileTypeExt = (data.file.split(".").pop() || "").toLowerCase();
          const fileType =
            fileTypeExt === "jsx" || fileTypeExt === "js"
              ? "javascript"
              : fileTypeExt === "css" || fileTypeExt === "scss"
              ? "css"
              : fileTypeExt === "json"
              ? "json"
              : "text";
          // Show streaming tab immediately when file starts
          setCurrentFile({ path: data.file, content: "", type: fileType });
        } else if (data.status === "completed" && data.file) {
          // Clear current streaming indicator for this file
          setCurrentFile((prev) =>
            prev && prev.path === data.file ? null : prev
          );
        }

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            const activities = msg.activities || [];
            // Try to update an existing activity entry for the same file/message
            const idx = activities.findIndex(
              (a) =>
                (data.file && a.file === data.file) ||
                a.message === data.message
            );
            if (idx !== -1) {
              const updated = activities.slice();
              updated[idx] = {
                ...updated[idx],
                status: data.status || updated[idx].status,
              };
              return { ...msg, activities: updated };
            }
            // Otherwise append
            return {
              ...msg,
              activities: [
                ...activities,
                {
                  id: Date.now(),
                  message: data.message,
                  status: data.status || "in_progress",
                  file: data.file,
                },
              ],
            };
          })
        );
        break;

      case "stream":
        // Stream AI response text (conversational only, no XML)
        if (data.content && typeof data.content === "string") {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === messageId) {
                const currentContent = msg.content || "";
                const hasExplanation = msg.hasExplanation;

                // If has explanation, append AFTER it with separator
                if (
                  hasExplanation &&
                  currentContent &&
                  !currentContent.includes(data.content)
                ) {
                  return {
                    ...msg,
                    content: currentContent + "\n\n" + data.content,
                  };
                }

                // Otherwise, clear placeholder and set content
                const isPlaceholder =
                  currentContent === "Analyzing your request...";
                const newContent = isPlaceholder
                  ? data.content
                  : currentContent + data.content;

                return {
                  ...msg,
                  content: newContent,
                };
              }
              return msg;
            })
          );
        }
        break;

      case "file_write":
        // DEPRECATED: Files are now parsed client-side from streamingCode
        // This event is kept for backwards compatibility but does nothing
        console.log(
          `[Frontend] ⚠️ file_write event received but ignored (using client-side parsing)`
        );
        break;

      case "complete":
        // All files generated
        console.log(
          `[Frontend] complete event received, files:`,
          data.files ? Object.keys(data.files).length : 0
        );

        // Set stage to done to stop spinner
        setStage("done");

        // Mark any in-progress activities as completed and attach finalMessage to render AFTER code blocks
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            const activities = (msg.activities || []).map((a) =>
              a.status === "in_progress" ? { ...a, status: "completed" } : a
            );
            return {
              ...msg,
              activities,
              postContent: data.finalMessage
                ? String(data.finalMessage)
                : undefined,
            };
          })
        );

        // Clear streaming state BUT keep completedFiles and files (open-lovable approach)
        setStreamingCode("");
        setCurrentFile(null);
        // Don't clear completedFiles or files - they persist and were already parsed client-side

        // Only set files if we don't have any (fallback if client-side parsing failed)
        setFiles((prev) => {
          if (prev.length > 0) {
            console.log(
              `[Frontend] ✅ Keeping ${prev.length} client-side parsed files`
            );
            return prev; // Keep existing files from client-side parsing
          }

          // Fallback: Use backend-parsed files if client-side parsing didn't work
          if (data.files) {
            const fileArray = Object.entries(data.files).map(
              ([path, content]) => ({
                path,
                content,
                createdAt: new Date().toISOString(),
              })
            );
            console.log(
              `[Frontend] ⚠️ Using ${fileArray.length} backend-parsed files (fallback)`
            );
            return fileArray;
          }

          return prev;
        });

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === messageId) {
              // Only set default content if AI didn't stream conversational text
              const hasConversationalText =
                msg.content && msg.content !== "Analyzing your request...";
              return {
                ...msg,
                content: hasConversationalText
                  ? msg.content
                  : `Generated ${
                      Object.keys(data.files || {}).length
                    } files successfully!`,
              };
            }
            return msg;
          })
        );

        // Set stage to done to stop useEffect processing
        setStage("done");
        break;

      case "error":
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: `Error: ${data.message}`,
                  activities: [
                    ...msg.activities,
                    {
                      id: Date.now(),
                      message: data.message,
                      status: "error",
                    },
                  ],
                }
              : msg
          )
        );
        break;

      default:
        console.warn("Unknown SSE event:", event, data);
    }
  };

  return (
    <div className={styles.studioPage}>
      <StudioLayout
        leftPanel={
          <Composer
            messages={messages}
            stage={stage}
            onSendMessage={handleSendMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            streamingCode={streamingCode}
            currentFile={currentFile}
            completedFiles={completedFiles}
          />
        }
        rightPanel={
          <RightPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            files={files}
            logs={logs}
            previewUrl={previewUrl}
            stage={stage}
            currentFile={currentFile}
          />
        }
      />
    </div>
  );
}
