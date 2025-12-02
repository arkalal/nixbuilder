"use client";

/**
 * ChefChat Component - Chef Architecture
 * Uses useChat from @ai-sdk/react with full tool support
 */

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { useMessageParser } from "../../../lib/hooks/useMessageParser";
import { workbenchStore } from "../../../lib/stores/workbench";
import styles from "./ChefChat.module.scss";

// Max steps for tool iteration (Chef uses 64)
const MAX_STEPS = 64;

export default function ChefChat({
  selectedModel,
  onFilesUpdate,
  onStageChange,
  onActivityUpdate,
}) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef(null);
  const {
    parsedMessages,
    parseMessages,
    reset: resetParser,
  } = useMessageParser();

  // Workbench store state
  const files = useStore(workbenchStore.files);
  const streamingFile = useStore(workbenchStore.streamingFile);
  const showWorkbench = useStore(workbenchStore.showWorkbench);

  // useChat hook (Chef pattern)
  const { messages, setMessages, append, reload, stop, status, error } =
    useChat({
      api: "/api/chat",
      maxSteps: MAX_STEPS,

      // Prepare request body (Chef pattern)
      body: {
        model: selectedModel,
      },

      // Handle tool calls on client side (Chef pattern)
      async onToolCall({ toolCall }) {
        console.log("[ChefChat] Tool call:", toolCall.toolName);

        // Wait for tool result from workbench
        const { result } = await workbenchStore.waitOnToolCall(
          toolCall.toolCallId
        );
        console.log("[ChefChat] Tool result:", result);

        return result;
      },

      // Handle errors (Chef pattern)
      onError: (error) => {
        console.error("[ChefChat] Error:", error);
        onStageChange?.("idle");
        onActivityUpdate?.({
          message: `Error: ${error.message}`,
          status: "error",
        });
      },

      // Handle completion (Chef pattern)
      onFinish: (message) => {
        console.log("[ChefChat] Finished:", message);
        onStageChange?.("done");

        // Get all files from workbench
        const allFiles = workbenchStore.getAllFiles();
        onFilesUpdate?.(allFiles);
      },
    });

  // Parse messages when they change (Chef pattern)
  useEffect(() => {
    parseMessages(messages);
  }, [messages, parseMessages]);

  // Update parent with files when they change
  useEffect(() => {
    const allFiles = workbenchStore.getAllFiles();
    if (Object.keys(allFiles).length > 0) {
      onFilesUpdate?.(allFiles);
    }
  }, [files, onFilesUpdate]);

  // Update streaming file
  useEffect(() => {
    if (streamingFile) {
      onActivityUpdate?.({
        message: `Writing ${streamingFile.path}...`,
        status: "in_progress",
        file: streamingFile.path,
      });
    }
  }, [streamingFile, onActivityUpdate]);

  // Update stage based on status
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      onStageChange?.("generating");
    } else if (status === "ready") {
      // Check if we just finished
    }
  }, [status, onStageChange]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [parsedMessages]);

  // Send message handler
  const handleSend = useCallback(async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setInputValue("");

    // Clear workbench for new generation
    workbenchStore.clearActions();
    onStageChange?.("generating");

    // Append user message (Chef pattern)
    await append({
      role: "user",
      content: userMessage,
    });
  }, [inputValue, append, onStageChange]);

  // Handle key press
  const handleKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    stop();
    workbenchStore.abortAllActions();
    onStageChange?.("idle");
  }, [stop, onStageChange]);

  // Regenerate last message
  const handleRegenerate = useCallback(() => {
    workbenchStore.clearActions();
    onStageChange?.("generating");
    reload();
  }, [reload, onStageChange]);

  return (
    <div className={styles.chatContainer}>
      {/* Messages */}
      <div className={styles.messagesContainer}>
        {parsedMessages.map((message, index) => (
          <div
            key={message.id || index}
            className={`${styles.message} ${styles[message.role]}`}
          >
            <div className={styles.messageContent}>
              {message.role === "user" ? (
                <p>{message.content}</p>
              ) : (
                <div>
                  {/* Display text content (stripped of artifacts) */}
                  {message.displayContent && (
                    <p className={styles.assistantText}>
                      {message.displayContent}
                    </p>
                  )}

                  {/* Display tool parts */}
                  {message.parts?.map((part, partIndex) => {
                    if (part.type === "tool-invocation") {
                      return (
                        <div key={partIndex} className={styles.toolCall}>
                          <span className={styles.toolName}>
                            {part.toolInvocation.toolName}
                          </span>
                          {part.toolInvocation.state === "result" && (
                            <span className={styles.toolResult}>✓</span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {status === "streaming" && (
          <div className={styles.streamingIndicator}>
            <span className={styles.dot}></span>
            <span className={styles.dot}></span>
            <span className={styles.dot}></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className={styles.errorBanner}>Error: {error.message}</div>
      )}

      {/* Input area */}
      <div className={styles.inputContainer}>
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Describe what you want to build..."
          className={styles.input}
          disabled={status === "streaming"}
        />
        <div className={styles.actions}>
          {status === "streaming" ? (
            <button onClick={handleStop} className={styles.stopButton}>
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              className={styles.sendButton}
              disabled={!inputValue.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
