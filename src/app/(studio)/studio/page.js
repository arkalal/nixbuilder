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

  // Sandbox state (E2B)
  const [sandboxId, setSandboxId] = useState(null);
  const [projectId] = useState(`project-${Date.now()}`); // Temporary until projects CRUD is implemented
  const logsReaderRef = useRef(null);
  const sandboxBusyRef = useRef(false); // prevents re-entrant sandbox runs

  // Error recovery state
  const [previewErrors, setPreviewErrors] = useState([]); // Array of error objects from preview
  const [isFixing, setIsFixing] = useState(false); // Whether auto-fix is in progress
  const [fixResult, setFixResult] = useState(null); // Result of last fix attempt

  // Open-lovable style streaming state
  const [streamingCode, setStreamingCode] = useState("");
  const [currentFile, setCurrentFile] = useState(null); // { path, content, type }
  const [completedFiles, setCompletedFiles] = useState([]); // Persisted completed files for this generation
  const [externalSelectedFile, setExternalSelectedFile] = useState(null); // File selected from left panel workbench

  // Workbench files state - tracks all files with their statuses for left panel display
  // This is separate from completedFiles to ensure proper accumulation and persistence
  const [workbenchFiles, setWorkbenchFiles] = useState([]); // { path, status: 'in_progress' | 'completed', action: 'Create' | 'Edit' }
  const workbenchFilesRef = useRef([]); // Ref to avoid stale closure in SSE handler

  // Track the ID of the currently streaming message - ONLY this message should animate
  const [streamingMessageId, setStreamingMessageId] = useState(null);

  // Track if explanation text streaming is complete - workbench should only show after this
  const [explanationStreamingComplete, setExplanationStreamingComplete] =
    useState(false);
  const explanationStreamingCompleteRef = useRef(false);
  // Queue to briefly display fast-completing files so each file is visibly streamed
  const displayQueueRef = useRef([]);
  const isDisplayingRef = useRef(false);
  // Explanation gating to ensure explanation renders BEFORE any code/activity
  const explanationReceivedRef = useRef(false);
  const preExplanationRawBufferRef = useRef("");
  const queuedActivitiesRef = useRef([]);
  const fallbackExplanationTimerRef = useRef(null);
  // Keep latest files in a ref to avoid adding 'files' to effect deps
  const filesRef = useRef([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Keep workbenchFilesRef in sync to avoid stale closures in SSE handler
  useEffect(() => {
    workbenchFilesRef.current = workbenchFiles;
  }, [workbenchFiles]);

  // Track user-edited files to protect them from AI overwrites
  const userEditedFilesRef = useRef(new Set());
  // Deduplicate last queued completed file for brief display
  const lastQueuedPathRef = useRef(null);
  // Monotonic ID generator to avoid duplicate React keys when events happen within the same millisecond
  const idCounterRef = useRef(0);
  const generateId = () => {
    idCounterRef.current += 1;
    return `${Date.now()}-${idCounterRef.current}`;
  };

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

  // Parse files from streamingCode in real-time (open-lovable approach, refactored to avoid loops)
  useEffect(() => {
    if (!streamingCode || stage !== "generating") return;

    // Extract ALL completed files from accumulated stream
    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
    let match;
    const matches = [];
    while ((match = fileRegex.exec(streamingCode)) !== null) {
      matches.push({ path: match[1], content: match[2].trim() });
    }

    // Apply updates/additions using functional update to avoid dependency loops
    // IMPORTANT: Protect user-edited files from AI overwrites
    let completedEntries = [];
    setFiles((prev) => {
      if (matches.length === 0) return prev;
      const out = prev.slice();
      const indexByPath = new Map(out.map((f, i) => [f.path, i]));
      for (const m of matches) {
        // PROTECTION: Skip if this file was edited by user OR is .env file that already exists
        const isUserEdited = userEditedFilesRef.current.has(m.path);
        const isExistingEnv = m.path === ".env" && indexByPath.has(m.path);
        if (isUserEdited || isExistingEnv) {
          console.log(
            `[Studio] 🛡️ PROTECTED: Skipping overwrite of ${m.path} (user-edited or .env)`
          );
          continue;
        }

        const fileExt = m.path.split(".").pop();
        const fileType =
          fileExt === "jsx" || fileExt === "js"
            ? "javascript"
            : fileExt === "css" || fileExt === "scss"
            ? "css"
            : fileExt === "json"
            ? "json"
            : "text";
        const idx = indexByPath.get(m.path);
        if (typeof idx === "number") {
          // Update existing file (not user-edited)
          out[idx] = {
            ...out[idx],
            content: m.content,
            type: fileType,
            updatedAt: new Date().toISOString(),
            edited: true,
          };
        } else {
          // Add new file
          out.push({
            path: m.path,
            content: m.content,
            type: fileType,
            createdAt: new Date().toISOString(),
            completed: true,
          });
          completedEntries.push({ path: m.path, content: m.content });
        }
      }
      return out;
    });

    if (completedEntries.length > 0) {
      setCompletedFiles((prev) => [...prev, ...completedEntries]);
      setActiveTab((prev) => prev || "code");
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
      } else {
        // Last opened file has closed; clear current streaming indicator
        setCurrentFile(null);
      }
    } else {
      // No incomplete file - queue the most recent completed file for brief display (ensures visibility)
      const lastCompleted =
        matches.length > 0 ? matches[matches.length - 1] : null;
      if (lastCompleted) {
        const fileExt = lastCompleted.path.split(".").pop();
        const fileType =
          fileExt === "jsx" || fileExt === "js"
            ? "javascript"
            : fileExt === "css" || fileExt === "scss"
            ? "css"
            : fileExt === "json"
            ? "json"
            : "text";
        if (lastQueuedPathRef.current !== lastCompleted.path) {
          displayQueueRef.current.push({
            path: lastCompleted.path,
            content: lastCompleted.content,
            type: fileType,
          });
          lastQueuedPathRef.current = lastCompleted.path;
          processDisplayQueue();
        }
      } else {
        // No active streaming and no new completed files - clear currentFile
        setCurrentFile(null);
      }
    }
  }, [streamingCode, stage, processDisplayQueue]);

  // Sandbox lifecycle functions
  const startSandboxLogs = useCallback(async (id) => {
    // Placeholder for future SSE logs from E2B provider
    console.log(`[Studio] E2B logs streaming not enabled (sandbox: ${id})`);
    return;
  }, []);

  const stopSandboxLogs = useCallback(() => {
    if (logsReaderRef.current) {
      logsReaderRef.current.cancel();
      logsReaderRef.current = null;
    }
  }, []);

  const createAndStartSandbox = useCallback(async () => {
    if (sandboxBusyRef.current) {
      console.log(
        "[Studio] Sandbox operation already in progress — skipping duplicate call"
      );
      return;
    }
    sandboxBusyRef.current = true;
    try {
      console.log(`[Studio] Creating sandbox for project: ${projectId}`);
      setStage("previewing");
      setLogs([
        {
          level: "info",
          message: "Creating E2B sandbox...",
          timestamp: new Date().toISOString(),
        },
      ]);

      // Build files snapshot (path -> content) from client-side parsed files
      const filesMap = {};
      (filesRef.current || []).forEach((f) => {
        if (f && f.path) filesMap[f.path] = f.content || "";
      });

      // Log .env content being sent to sandbox for debugging
      if (filesMap[".env"]) {
        console.log(
          `[Studio] 📋 .env being sent to sandbox (${filesMap[".env"].length} chars)`
        );
      }

      // Sync all user-edited files to VFS before starting preview (safety net)
      const userEditedPaths = Array.from(userEditedFilesRef.current);
      if (userEditedPaths.length > 0) {
        console.log(
          `[Studio] 🔄 Syncing ${userEditedPaths.length} user-edited files to VFS before preview`
        );
        await Promise.all(
          userEditedPaths.map((filePath) => {
            const content = filesMap[filePath];
            if (content !== undefined) {
              return fetch("/api/studio/sync-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath, content }),
              }).catch((err) =>
                console.error(`[Studio] Failed to sync ${filePath}:`, err)
              );
            }
            return Promise.resolve();
          })
        );
      }

      // Clear previous errors before starting
      setPreviewErrors([]);
      setFixResult(null);

      // Start preview (creates sandbox, writes files, installs, starts dev)
      const startResponse = await fetch("/api/preview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, files: filesMap }),
      });

      const startData = await startResponse.json().catch(() => ({}));

      // Check if preview failed with error details
      if (!startResponse.ok || startData.success === false) {
        // Capture structured error from the API
        if (startData.errorDetails) {
          const errorObj = {
            type: startData.errorDetails.type || "unknown",
            message:
              startData.errorDetails.message ||
              startData.error ||
              "Preview failed",
            raw: startData.errorDetails.raw || "",
            packages: startData.errorDetails.packages || [],
            fixable: startData.errorDetails.fixable !== false,
            suggestions: getSuggestionsForError(startData.errorDetails.type),
          };
          setPreviewErrors([errorObj]);
          setActiveTab("logs"); // Switch to logs to show the error
          setLogs((prev) => [
            ...prev,
            {
              level: "error",
              message: `Preview failed: ${errorObj.message}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          // Don't throw - we've captured the error for display
          return;
        }
        throw new Error(startData?.error || "Failed to start preview");
      }

      setSandboxId(startData.sandboxId || null);
      if (startData.url) {
        setPreviewUrl(startData.url);
        setActiveTab("preview");
      }

      // Check for warnings (runtime errors that didn't block startup)
      if (startData.hasWarnings && startData.warning) {
        const warningError = {
          type: startData.warning.type || "runtime",
          message: startData.warning.message,
          file: startData.warning.file,
          line: startData.warning.line,
          fixable: true,
          suggestions: getSuggestionsForError(startData.warning.type),
        };
        setPreviewErrors([warningError]);
      }

      setLogs((prev) => [
        ...prev,
        {
          level: "info",
          message: "Dependencies installed",
          timestamp: new Date().toISOString(),
        },
        {
          level: "info",
          message: "Next.js dev server started",
          timestamp: new Date().toISOString(),
        },
        ...(startData.url
          ? [
              {
                level: "success",
                message: `Preview available at: ${startData.url}`,
                timestamp: new Date().toISOString(),
              },
            ]
          : []),
      ]);
    } catch (error) {
      console.error("[Studio] Sandbox error:", error);
      setLogs((prev) => [
        ...prev,
        {
          level: "error",
          message: `Failed to start sandbox: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      // Whether success or error, stop the loader so the user can type again
      setStage("done");
    }
    sandboxBusyRef.current = false;
  }, [projectId]);

  const stopSandbox = useCallback(async () => {
    if (!projectId) return;

    try {
      console.log(`[Studio] Stopping sandbox for project: ${projectId}`);
      stopSandboxLogs();

      const response = await fetch("/api/preview/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (response.ok) {
        setLogs((prev) => [
          ...prev,
          {
            level: "info",
            message: "Sandbox stopped",
            timestamp: new Date().toISOString(),
          },
        ]);
        setPreviewUrl(null);
        setSandboxId(null);
      }
    } catch (error) {
      console.error("[Studio] Failed to stop sandbox:", error);
    }
  }, [projectId, stopSandboxLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSandboxLogs();
    };
  }, [stopSandboxLogs]);

  const handleSendMessage = async (message) => {
    // Add user message
    const userMessage = {
      id: generateId(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create AI message placeholder
    const aiMessageId = generateId();
    const aiMessage = {
      id: aiMessageId,
      role: "assistant",
      content: "Analyzing your request...",
      timestamp: new Date().toISOString(),
      activities: [],
    };
    setMessages((prev) => [...prev, aiMessage]);

    // Set this as the currently streaming message - ONLY this message should animate
    setStreamingMessageId(aiMessageId);

    try {
      // Call /api/chat with SSE
      // Build compact conversation history for iterative edits (last 8 messages)
      const history = messages
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, model: selectedModel, history }),
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

          // Mark ALL previous assistant messages as complete to stop their streaming
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.role === "assistant" && !msg.isComplete) {
                return {
                  ...msg,
                  isComplete: true, // Mark as complete to stop streaming animation
                };
              }
              return msg;
            })
          );

          setStreamingCode(""); // Clear streaming code on new generation
          setCurrentFile(null);
          setCompletedFiles([]); // Clear per-generation left panel blocks only
          setWorkbenchFiles([]); // Clear workbench files for new generation
          setExplanationStreamingComplete(false); // Reset explanation streaming state
          explanationStreamingCompleteRef.current = false;
          // IMPORTANT: Do NOT clear files; we keep existing project for iterative edits
          // Reset display queue
          displayQueueRef.current = [];
          isDisplayingRef.current = false;
          // Reset explanation gating and buffers
          explanationReceivedRef.current = false;
          preExplanationRawBufferRef.current = "";
          queuedActivitiesRef.current = [];
          if (fallbackExplanationTimerRef.current) {
            clearTimeout(fallbackExplanationTimerRef.current);
            fallbackExplanationTimerRef.current = null;
          }
        }
        break;

      case "explanation": {
        // Add explanation text to AI message BEFORE other content (open-lovable approach)
        // Ensure we have meaningful content - use fallback if empty
        const explanationContent =
          data.text && data.text.trim()
            ? data.text
            : "I'll help you build your app. Let me start generating the code...";

        console.log(
          `[Frontend] 📝 Explanation received: "${explanationContent.substring(
            0,
            100
          )}..."`
        );
        explanationReceivedRef.current = true;
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === messageId) {
              // Set explanation as INITIAL content (will be FIRST message)
              return {
                ...msg,
                content: explanationContent,
                hasExplanation: true, // Flag to prevent stream events from overwriting
              };
            }
            return msg;
          })
        );

        // Calculate delay based on explanation text length for streaming animation
        // Approximately 30ms per word (matching StreamingTextContent speed)
        const wordCount = explanationContent.split(/\s+/).length;
        const streamingDelay = Math.min(wordCount * 30 + 500, 3000); // Cap at 3 seconds

        // Delay workbench AND code streaming until explanation text finishes streaming
        setTimeout(() => {
          console.log(
            `[Frontend] ✅ Explanation streaming complete! Starting code generation display...`
          );
          setExplanationStreamingComplete(true);
          explanationStreamingCompleteRef.current = true;

          // NOW flush any buffered raw stream AFTER explanation text streaming completes
          if (preExplanationRawBufferRef.current) {
            console.log(
              `[Frontend] 📦 Flushing ${preExplanationRawBufferRef.current.length} chars of buffered code`
            );
            setStreamingCode(
              (prev) => prev + preExplanationRawBufferRef.current
            );
            preExplanationRawBufferRef.current = "";
          }

          // NOW drain queued activities to start building after explanation streaming completes
          if (queuedActivitiesRef.current.length > 0) {
            const queued = queuedActivitiesRef.current.slice();
            queuedActivitiesRef.current = [];
            for (const queuedData of queued) {
              // Re-run the activity handling logic synchronously
              if (queuedData.status === "in_progress" && queuedData.file) {
                const fileTypeExt = (
                  queuedData.file.split(".").pop() || ""
                ).toLowerCase();
                const fileType =
                  fileTypeExt === "jsx" || fileTypeExt === "js"
                    ? "javascript"
                    : fileTypeExt === "css" || fileTypeExt === "scss"
                    ? "css"
                    : fileTypeExt === "json"
                    ? "json"
                    : "text";
                setCurrentFile({
                  path: queuedData.file,
                  content: "",
                  type: fileType,
                });
                // Add to workbench files
                setWorkbenchFiles((prev) => {
                  const existingIdx = prev.findIndex(
                    (f) => f.path === queuedData.file
                  );
                  if (existingIdx >= 0) return prev;
                  return [
                    ...prev,
                    {
                      path: queuedData.file,
                      status: "in_progress",
                      action: queuedData.message?.includes("Edit")
                        ? "Edit"
                        : "Create",
                    },
                  ];
                });
              } else if (queuedData.status === "completed" && queuedData.file) {
                setCurrentFile((prev) =>
                  prev && prev.path === queuedData.file ? null : prev
                );
                // Update workbench file status
                setWorkbenchFiles((prev) => {
                  const existingIdx = prev.findIndex(
                    (f) => f.path === queuedData.file
                  );
                  if (existingIdx >= 0) {
                    const updated = [...prev];
                    updated[existingIdx] = {
                      ...updated[existingIdx],
                      status: "completed",
                    };
                    return updated;
                  }
                  return [
                    ...prev,
                    {
                      path: queuedData.file,
                      status: "completed",
                      action: queuedData.message?.includes("Edit")
                        ? "Edit"
                        : "Create",
                    },
                  ];
                });
              }
            }
          }
        }, streamingDelay);

        // Clear any pending fallback timer
        if (fallbackExplanationTimerRef.current) {
          clearTimeout(fallbackExplanationTimerRef.current);
          fallbackExplanationTimerRef.current = null;
        }
        break;
      }

      case "rawStream":
        // Accumulate all raw streaming text (open-lovable approach)
        if (data.text && data.raw) {
          // Block until BOTH explanation is received AND text streaming animation is complete
          if (
            !explanationReceivedRef.current ||
            !explanationStreamingCompleteRef.current
          ) {
            // Buffer until explanation text streaming completes
            preExplanationRawBufferRef.current += data.text;
            if (!fallbackExplanationTimerRef.current) {
              fallbackExplanationTimerRef.current = setTimeout(() => {
                if (!explanationReceivedRef.current) {
                  explanationReceivedRef.current = true;
                  setExplanationStreamingComplete(true);
                  explanationStreamingCompleteRef.current = true;
                  setMessages((prev) =>
                    prev.map((msg) => {
                      if (msg.id === messageId) {
                        return {
                          ...msg,
                          content:
                            "I'll build the requested app and then start streaming the full code files.",
                          hasExplanation: true,
                        };
                      }
                      return msg;
                    })
                  );
                  // Flush buffered stream
                  if (preExplanationRawBufferRef.current) {
                    setStreamingCode(
                      (prev) => prev + preExplanationRawBufferRef.current
                    );
                    preExplanationRawBufferRef.current = "";
                  }
                  // Also process any queued activities now
                  if (queuedActivitiesRef.current.length > 0) {
                    const queued = queuedActivitiesRef.current.slice();
                    queuedActivitiesRef.current = [];
                    for (const queuedData of queued) {
                      if (
                        queuedData.status === "in_progress" &&
                        queuedData.file
                      ) {
                        setWorkbenchFiles((prev) => {
                          const existingIdx = prev.findIndex(
                            (f) => f.path === queuedData.file
                          );
                          if (existingIdx >= 0) return prev;
                          return [
                            ...prev,
                            {
                              path: queuedData.file,
                              status: "in_progress",
                              action: queuedData.message?.includes("Edit")
                                ? "Edit"
                                : "Create",
                            },
                          ];
                        });
                      } else if (
                        queuedData.status === "completed" &&
                        queuedData.file
                      ) {
                        setWorkbenchFiles((prev) => {
                          const existingIdx = prev.findIndex(
                            (f) => f.path === queuedData.file
                          );
                          if (existingIdx >= 0) {
                            const updated = [...prev];
                            updated[existingIdx] = {
                              ...updated[existingIdx],
                              status: "completed",
                            };
                            return updated;
                          }
                          return [
                            ...prev,
                            {
                              path: queuedData.file,
                              status: "completed",
                              action: queuedData.message?.includes("Edit")
                                ? "Edit"
                                : "Create",
                            },
                          ];
                        });
                      }
                    }
                  }
                }
              }, 1000);
            }
            return;
          }
          setStreamingCode((prev) => prev + data.text);
        }
        break;

      case "activity":
        // Update activities (dedupe by file/message) and set currentFile on start
        // Queue activities until BOTH explanation is received AND streaming animation is complete
        if (
          !explanationReceivedRef.current ||
          !explanationStreamingCompleteRef.current
        ) {
          // Queue activity to run after explanation streaming completes
          queuedActivitiesRef.current.push({ ...data });
          return;
        }

        // Handle workbench file tracking - accumulate files with their statuses
        if (data.file) {
          if (data.status === "in_progress") {
            const fileTypeExt = (
              data.file.split(".").pop() || ""
            ).toLowerCase();
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

            // Add to workbench files with 'in_progress' status (if not already present)
            setWorkbenchFiles((prev) => {
              const existingIdx = prev.findIndex((f) => f.path === data.file);
              if (existingIdx >= 0) {
                // Update existing file to in_progress
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  status: "in_progress",
                };
                return updated;
              }
              // Add new file with in_progress status
              return [
                ...prev,
                {
                  path: data.file,
                  status: "in_progress",
                  action: data.message?.includes("Edit") ? "Edit" : "Create",
                },
              ];
            });
          } else if (data.status === "completed") {
            // Clear current streaming indicator for this file
            setCurrentFile((prev) =>
              prev && prev.path === data.file ? null : prev
            );

            // Update workbench file to 'completed' status (KEEP in list, just update status)
            setWorkbenchFiles((prev) => {
              const existingIdx = prev.findIndex((f) => f.path === data.file);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  status: "completed",
                };
                return updated;
              }
              // File wasn't in list (edge case), add it as completed
              return [
                ...prev,
                {
                  path: data.file,
                  status: "completed",
                  action: data.message?.includes("Edit") ? "Edit" : "Create",
                },
              ];
            });
          }
        }

        // Update message activities for backward compatibility
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
                  id: generateId(),
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
        // Stream AI response text - backend already filters, only sends conversational text
        if (data.content && typeof data.content === "string") {
          const content = data.content;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === messageId) {
                const currentContent = msg.content || "";
                const hasExplanation = msg.hasExplanation;

                // If has explanation, don't append stream content (explanation is complete)
                if (hasExplanation) {
                  return msg;
                }

                // Otherwise, clear placeholder and set content
                const isPlaceholder =
                  currentContent === "Analyzing your request...";
                const newContent = isPlaceholder
                  ? content
                  : currentContent + content;

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

        // Stop spinner
        setStage("done");
        // Ensure timers/queues cleared
        explanationReceivedRef.current = true;
        explanationStreamingCompleteRef.current = true;
        if (fallbackExplanationTimerRef.current) {
          clearTimeout(fallbackExplanationTimerRef.current);
          fallbackExplanationTimerRef.current = null;
        }

        // Mark all workbench files as completed
        setWorkbenchFiles((prev) =>
          prev.map((f) => ({ ...f, status: "completed" }))
        );

        // Finalize activities and attach final summary + snapshot of files
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            const activities = (msg.activities || []).map((a) =>
              a.status === "in_progress" ? { ...a, status: "completed" } : a
            );
            const filesSnapshot =
              completedFiles && completedFiles.length
                ? [...completedFiles]
                : msg.completedFilesSnapshot || [];
            // Save workbench files snapshot for prior messages display
            // Use ref to get current value and avoid stale closure
            const currentWbFiles = workbenchFilesRef.current;
            const wbSnapshot =
              currentWbFiles && currentWbFiles.length
                ? currentWbFiles.map((f) => ({ ...f, status: "completed" }))
                : msg.workbenchFilesSnapshot || [];
            return {
              ...msg,
              activities,
              postContent: data.finalMessage
                ? String(data.finalMessage)
                : msg.postContent,
              completedFilesSnapshot: filesSnapshot,
              workbenchFilesSnapshot: wbSnapshot,
            };
          })
        );

        // Clear streaming state BUT keep files
        setStreamingCode("");
        setCurrentFile(null);
        // NOTE: Don't clear streamingMessageId here - keep it so postContent can stream
        // It will be replaced when a NEW generation starts, preventing previous messages from re-streaming

        // Always MERGE backend files into client-parsed files to ensure completeness
        // This prevents cases where a few files were parsed client-side, but others were missed.
        // IMPORTANT: Protect user-edited files from being overwritten by VFS content
        setFiles((prev) => {
          const existingByPath = new Map(prev.map((f) => [f.path, f]));
          const merged = prev.slice();
          const backendEntries = data.files ? Object.entries(data.files) : [];
          let added = 0;
          let updated = 0;
          let protected_ = 0;
          for (const [path, content] of backendEntries) {
            const existing = existingByPath.get(path);

            // PROTECTION: Never overwrite user-edited files or .env files
            const isUserEdited = userEditedFilesRef.current.has(path);
            const isEnvFile = path === ".env" || path.endsWith("/.env");
            if (existing && (isUserEdited || isEnvFile)) {
              console.log(
                `[Frontend] 🛡️ PROTECTED in complete: Keeping user's ${path}`
              );
              protected_++;
              continue;
            }

            if (!existing) {
              const fileExt = path.split(".").pop();
              const fileType =
                fileExt === "jsx" || fileExt === "js"
                  ? "javascript"
                  : fileExt === "css" || fileExt === "scss"
                  ? "css"
                  : fileExt === "json"
                  ? "json"
                  : "text";
              merged.push({
                path,
                content,
                type: fileType,
                createdAt: new Date().toISOString(),
                completed: true,
              });
              added++;
            } else if (existing.content !== content) {
              // Update stale content if backend has the authoritative final version
              // Create new object to avoid mutation issues
              const idx = merged.findIndex((f) => f.path === path);
              if (idx !== -1) {
                merged[idx] = {
                  ...merged[idx],
                  content,
                  updatedAt: new Date().toISOString(),
                };
              }
              updated++;
            }
          }
          if (backendEntries.length > 0) {
            console.log(
              `[Frontend] ✅ Finalized files: kept ${prev.length}, added ${added}, updated ${updated}, protected ${protected_}`
            );
          }
          return merged;
        });

        // Ensure the assistant message has some human-readable completion text
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === messageId) {
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

        // Preview is now manual - user clicks "Start Preview" button
        // Stage set to 'done' so user can manually start preview when ready
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

  // Handle file click from the left panel workbench
  const handleFileClickFromWorkbench = useCallback((filePath) => {
    console.log(`[Studio] File clicked from workbench: ${filePath}`);
    // Switch to code tab
    setActiveTab("code");
    // Set the external selected file to trigger selection in RightPanel
    setExternalSelectedFile(filePath);
  }, []);

  // Helper to get suggestions for error types
  const getSuggestionsForError = (errorType) => {
    const suggestions = {
      npm_install: [
        "Check if the package name is spelled correctly",
        "The package may not exist on npm registry",
        "Try removing and re-adding the dependency",
      ],
      compilation: [
        "Check for syntax errors in your code",
        "Verify all imports are correct",
        "Ensure JSX tags are properly closed",
      ],
      runtime: [
        "Check the browser console for more details",
        "Verify all variables are defined before use",
        "Use optional chaining (?.) for potentially undefined values",
      ],
      hydration: [
        "Ensure server and client render identical content",
        "Wrap browser-only code in useEffect",
        "Avoid Date.now() or Math.random() during render",
      ],
      module_not_found: [
        "Check if the import path is correct",
        "Verify the file extension matches",
        "Ensure the module is installed",
      ],
      syntax: [
        "Check for missing brackets or parentheses",
        "Verify JSX is properly closed",
        "Look for stray characters",
      ],
    };
    return suggestions[errorType] || ["Review the error message for details"];
  };

  // Handle auto-fix request
  const handleAutoFix = useCallback(
    async (error) => {
      if (isFixing || !projectId) return;

      console.log("[Studio] Starting auto-fix for error:", error.type);
      setIsFixing(true);
      setFixResult(null);

      // Add log entry
      setLogs((prev) => [
        ...prev,
        {
          level: "info",
          message: `Attempting to fix ${error.type} error...`,
          timestamp: new Date().toISOString(),
        },
      ]);

      try {
        const response = await fetch("/api/preview/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            error: {
              type: error.type,
              message: error.message,
              raw: error.raw,
              file: error.file,
              line: error.line,
            },
            model: selectedModel,
            stream: false,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (result.success) {
          setFixResult({
            success: true,
            filesFixed: result.filesFixed,
            fixedFiles: result.fixedFiles,
          });
          setPreviewErrors([]); // Clear errors on successful fix

          // Update local files state with fixed files
          if (result.fixedFiles && result.fixedFiles.length > 0) {
            // Refresh files from VFS
            const vfsResponse = await fetch("/api/studio/files");
            if (vfsResponse.ok) {
              const vfsData = await vfsResponse.json();
              if (vfsData.files) {
                setFiles(
                  Object.entries(vfsData.files).map(([path, content]) => ({
                    path,
                    content,
                    type: getFileType(path),
                    updatedAt: new Date().toISOString(),
                  }))
                );
              }
            }
          }

          setLogs((prev) => [
            ...prev,
            {
              level: "success",
              message: `Fixed ${result.filesFixed} file(s): ${
                result.fixedFiles?.join(", ") || ""
              }`,
              timestamp: new Date().toISOString(),
            },
          ]);

          // Auto-restart preview after fix
          setTimeout(() => {
            createAndStartSandbox();
          }, 500);
        } else {
          setFixResult({ success: false });
          setLogs((prev) => [
            ...prev,
            {
              level: "warn",
              message:
                "Auto-fix could not resolve the error. Manual intervention may be needed.",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } catch (err) {
        console.error("[Studio] Auto-fix error:", err);
        setFixResult({ success: false, error: err.message });
        setLogs((prev) => [
          ...prev,
          {
            level: "error",
            message: `Auto-fix failed: ${err.message}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsFixing(false);
      }
    },
    [isFixing, projectId, selectedModel, createAndStartSandbox]
  );

  // Helper to get file type from extension
  const getFileType = (path) => {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "jsx" || ext === "js" || ext === "mjs") return "javascript";
    if (ext === "css" || ext === "scss") return "css";
    if (ext === "json") return "json";
    return "text";
  };

  // Handle file content updates from the editor
  const handleFileUpdate = useCallback((filePath, newContent) => {
    console.log(`[Studio] File updated by user: ${filePath}`);

    // Mark this file as user-edited to protect from AI overwrites
    userEditedFilesRef.current.add(filePath);
    console.log(`[Studio] 🛡️ File marked as protected: ${filePath}`);

    // Update client-side state
    setFiles((prev) =>
      prev.map((f) =>
        f.path === filePath
          ? {
              ...f,
              content: newContent,
              updatedAt: new Date().toISOString(),
              userEdited: true,
            }
          : f
      )
    );
    // Update filesRef for sandbox sync
    filesRef.current = filesRef.current.map((f) =>
      f.path === filePath
        ? {
            ...f,
            content: newContent,
            updatedAt: new Date().toISOString(),
            userEdited: true,
          }
        : f
    );

    // Sync to server VFS so AI has correct context on next iteration
    fetch("/api/studio/sync-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, content: newContent }),
    }).catch((err) => {
      console.error("[Studio] Failed to sync file to VFS:", err);
    });
  }, []);

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
            workbenchFiles={workbenchFiles}
            onFileClick={handleFileClickFromWorkbench}
            streamingMessageId={streamingMessageId}
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
            onPreviewRestart={createAndStartSandbox}
            onPreviewStop={stopSandbox}
            onFileUpdate={handleFileUpdate}
            externalSelectedFile={externalSelectedFile}
            errors={previewErrors}
            onAutoFix={handleAutoFix}
            isFixing={isFixing}
            fixResult={fixResult}
          />
        }
      />
    </div>
  );
}
