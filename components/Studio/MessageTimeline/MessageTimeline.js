"use client";

import React, { useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiUser, FiLoader } from "react-icons/fi";
import { HiSparkles } from "react-icons/hi2";
import StreamingCodeDisplay from "../StreamingCodeDisplay/StreamingCodeDisplay";
import Workbench from "../Workbench/Workbench";
import SpinnerThreeDots from "../SpinnerThreeDots/SpinnerThreeDots";
import styles from "./MessageTimeline.module.scss";

/**
 * PriorMessageWorkbench - Shows persisted Workbench for previous messages
 */
function PriorMessageWorkbench({
  completedFiles,
  postContent,
  existingFiles,
  onFileClick,
}) {
  const actions = useMemo(() => {
    return completedFiles.map((file, idx) => ({
      id: `prior-${file.path}-${idx}`,
      file: file.path,
      status: "completed",
      isEdit:
        file.isEdit !== undefined
          ? file.isEdit
          : existingFiles.some((ef) => ef.path === file.path),
    }));
  }, [completedFiles, existingFiles]);

  const handleFileClick = useCallback(
    (filePath) => {
      if (onFileClick) onFileClick(filePath);
    },
    [onFileClick]
  );

  if (actions.length === 0 && !postContent) return null;

  return (
    <div className={styles.priorWorkbench}>
      {actions.length > 0 && (
        <Workbench
          title="App Implementation"
          actions={actions}
          allComplete={true}
          onFileClick={handleFileClick}
        />
      )}
      {postContent && (
        <div className={styles.finalText}>
          {String(postContent)
            .split("\n")
            .map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * MessageTimeline - Chef-style message display
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/chat/Messages.client.tsx
 */
export default function MessageTimeline({
  messages,
  streamingCode,
  currentFile,
  completedFiles,
  existingFiles = [],
  onFileClick,
  stage,
}) {
  const bottomRef = React.useRef(null);
  const isStreaming = stage === "generating" || stage === "planning";

  // Auto-scroll to the newest content
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingCode, currentFile, completedFiles]);

  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <HiSparkles />
        </div>
        <h3 className={styles.emptyTitle}>Ready to cook up a new feature?</h3>
        <p className={styles.emptyText}>
          Send a message below to start building your app!
        </p>
      </div>
    );
  }

  // Check if AI is still analyzing (loading state)
  const isAnalyzing = (content) => {
    return (
      content === "Analyzing your request..." ||
      !content ||
      content.trim() === ""
    );
  };

  // Parse content to separate plan from "Let's start:" section
  const parseContent = (content) => {
    if (!content) return { plan: "", hasLetsStart: false };

    const letsStartIndex = content.toLowerCase().indexOf("let's start");
    if (letsStartIndex !== -1) {
      return {
        plan: content.substring(0, letsStartIndex).trim(),
        hasLetsStart: true,
      };
    }
    return { plan: content, hasLetsStart: false };
  };

  return (
    <div className={styles.timeline}>
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isLastAssistant =
          message.role === "assistant" && index === messages.length - 1;
        const hasFiles = completedFiles.length > 0 || currentFile;
        const { plan, hasLetsStart } = parseContent(message.content);

        return (
          <div
            key={message.id}
            className={`${styles.messageWrapper} ${
              isUser ? styles.userMessage : styles.assistantMessage
            }`}
          >
            {/* User Message - Chef style with avatar */}
            {isUser && (
              <div className={styles.userBubble}>
                <div className={styles.userAvatar}>
                  <FiUser />
                </div>
                <div className={styles.userContent}>{message.content}</div>
              </div>
            )}

            {/* Assistant Message - Chef style (no avatar, clean text) */}
            {!isUser && (
              <div className={styles.assistantContent}>
                {/* Loading state */}
                {isAnalyzing(message.content) && (
                  <div className={styles.loadingState}>
                    <FiLoader className={styles.loadingSpinner} />
                    <span>Thinking...</span>
                  </div>
                )}

                {/* Plan text - rendered as plain text like Chef */}
                {!isAnalyzing(message.content) && plan && (
                  <div className={styles.planText}>
                    {plan.split("\n").map((line, i) => (
                      <div key={i} className={styles.planLine}>
                        {line || "\u00A0"}
                      </div>
                    ))}
                  </div>
                )}

                {/* "Let's start:" separator - Chef style */}
                {!isAnalyzing(message.content) &&
                  (hasLetsStart || (isLastAssistant && hasFiles)) && (
                    <div className={styles.letsStart}>Let&apos;s start:</div>
                  )}

                {/* Workbench - File operations for LAST assistant message (uses nanostores) */}
                {isLastAssistant && (
                  <StreamingCodeDisplay
                    postContent={message.postContent}
                    onFileClick={onFileClick}
                  />
                )}

                {/* Persisted Workbench for PRIOR assistant messages (uses snapshot) */}
                {!isLastAssistant &&
                  ((message.completedFilesSnapshot &&
                    message.completedFilesSnapshot.length > 0) ||
                    message.postContent) && (
                    <PriorMessageWorkbench
                      completedFiles={message.completedFilesSnapshot || []}
                      postContent={message.postContent}
                      existingFiles={existingFiles}
                      onFileClick={onFileClick}
                    />
                  )}
              </div>
            )}
          </div>
        );
      })}

      {/* Three dots loading indicator - Chef style */}
      {isStreaming && (
        <div className={styles.streamingIndicator}>
          <SpinnerThreeDots className={styles.threeDots} />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
