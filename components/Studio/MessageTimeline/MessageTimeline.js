"use client";

import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useEffect } from "react";
import {
  FiUser,
  FiCpu,
  FiCheck,
  FiLoader,
  FiAlertCircle,
} from "react-icons/fi";
import StreamingCodeDisplay from "../StreamingCodeDisplay/StreamingCodeDisplay";
import styles from "./MessageTimeline.module.scss";

// Streaming text component - renders text with optional streaming animation
function StreamingTextContent({ text, isStreaming = false }) {
  // If not streaming, render immediately
  if (!isStreaming) {
    if (!text) return null;
    return (
      <div className={styles.streamingTextContent}>
        {text.split("\n").map((line, i) => (
          <div key={i}>{line || "\u00A0"}</div>
        ))}
      </div>
    );
  }

  // For streaming, use animator with stable key
  return <TextStreamAnimator key="animator" text={text} />;
}

// Animator component - only used during active streaming
function TextStreamAnimator({ text }) {
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    if (!text || charIndex >= text.length) return;

    const timer = setTimeout(() => {
      setCharIndex((prev) => Math.min(prev + 3, text.length));
    }, 15);

    return () => clearTimeout(timer);
  }, [charIndex, text]);

  if (!text) return null;

  const displayText = text.slice(0, charIndex);
  if (!displayText) return null;

  return (
    <div className={styles.streamingTextContent}>
      {displayText.split("\n").map((line, i) => (
        <div key={i}>{line || "\u00A0"}</div>
      ))}
    </div>
  );
}

// Helper function to extract app name from user's first message
function extractAppName(messages) {
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) return "Generated App";

  const content = firstUserMessage.content || "";
  // Try to extract a meaningful app name from the prompt
  // Look for patterns like "build a X app", "create X", etc.
  const patterns = [
    /(?:build|create|make|develop)\s+(?:a\s+)?([^.!?,]+?)(?:\s+app|\s+application|\s+website|\s+site)?(?:\.|!|,|$)/i,
    /([^.!?,]+?)(?:\s+app|\s+application|\s+website|\s+site)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      // Clean up and capitalize
      const name = match[1].trim().slice(0, 50);
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  // Fallback: use first 50 chars of the message
  return content.slice(0, 50) || "Generated App";
}

export default function MessageTimeline({
  messages,
  streamingCode,
  currentFile,
  completedFiles,
  workbenchFiles = [],
  onFileClick,
  streamingMessageId,
}) {
  const bottomRef = React.useRef(null);
  const appName = React.useMemo(() => extractAppName(messages), [messages]);

  // Auto-scroll to the newest content reliably
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingCode, currentFile, completedFiles, workbenchFiles]);

  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <FiCpu />
        </div>
        <h3 className={styles.emptyTitle}>Ready to build</h3>
        <p className={styles.emptyText}>
          Describe your app idea below and watch it come to life.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      <AnimatePresence initial={false}>
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            className={`${styles.message} ${
              message.role === "user"
                ? styles.userMessage
                : styles.assistantMessage
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <div className={styles.messageHeader}>
              <div className={styles.avatar}>
                {message.role === "user" ? <FiUser /> : <FiCpu />}
              </div>
              <div className={styles.messageInfo}>
                <span className={styles.roleName}>
                  {message.role === "user" ? "You" : "AI Agent"}
                </span>
                <span className={styles.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            {message.content && message.content.trim() && (
              <div className={styles.messageContent}>
                {message.content === "Analyzing your request..." ? (
                  <div className={styles.loadingMessage}>
                    <FiLoader className={styles.iconSpinning} />
                    <span>{message.content}</span>
                  </div>
                ) : message.role === "assistant" &&
                  message.id === streamingMessageId ? (
                  // Stream text ONLY for the currently streaming message (by ID)
                  <StreamingTextContent
                    key={`stream-${message.id}`}
                    text={message.content}
                    isStreaming={message.hasExplanation && !message.postContent}
                  />
                ) : (
                  // Show text immediately for all other messages
                  <div key={`static-${message.id}`}>
                    {message.content.split("\n").map((line, i) => (
                      <div key={i}>{line || "\u00A0"}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Show only non-file activities (like errors) */}
            {message.activities &&
              message.activities.filter((a) => a.status === "error" && !a.file)
                .length > 0 && (
                <div className={styles.activities}>
                  {message.activities
                    .filter((a) => a.status === "error" && !a.file)
                    .map((activity) => (
                      <motion.div
                        key={activity.id}
                        className={styles.activity}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className={styles.activityIcon}>
                          <FiAlertCircle className={styles.iconError} />
                        </div>
                        <span className={styles.activityMessage}>
                          {activity.message}
                        </span>
                      </motion.div>
                    ))}
                </div>
              )}

            {/* Live stream for the LAST assistant message - use workbenchFiles for file list */}
            {message.role === "assistant" &&
              index === messages.length - 1 &&
              (workbenchFiles.length > 0 || message.postContent ? (
                <StreamingCodeDisplay
                  streamingCode={streamingCode}
                  currentFile={currentFile}
                  completedFiles={completedFiles}
                  workbenchFiles={workbenchFiles}
                  postContent={message.postContent}
                  onFileClick={onFileClick}
                  appName={appName}
                  isGenerating={!!currentFile || !!streamingCode}
                  isCurrentlyStreaming={message.id === streamingMessageId}
                />
              ) : null)}

            {/* Persisted blocks for PRIOR assistant messages - never stream */}
            {message.role === "assistant" &&
              index !== messages.length - 1 &&
              ((message.workbenchFilesSnapshot &&
                message.workbenchFilesSnapshot.length > 0) ||
              message.postContent ? (
                <StreamingCodeDisplay
                  streamingCode={""}
                  currentFile={null}
                  completedFiles={message.completedFilesSnapshot || []}
                  workbenchFiles={message.workbenchFilesSnapshot || []}
                  postContent={message.postContent}
                  onFileClick={onFileClick}
                  appName={appName}
                  isCurrentlyStreaming={false}
                />
              ) : null)}
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
