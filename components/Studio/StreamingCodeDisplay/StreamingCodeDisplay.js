"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiCheck, FiLoader, FiChevronUp, FiChevronDown } from "react-icons/fi";
import styles from "./StreamingCodeDisplay.module.scss";

// Streaming text component for smooth character-by-character animation
function StreamingText({ text, onComplete, isStreaming = false }) {
  // If not streaming, render immediately
  if (!isStreaming || !text) {
    return (
      <div className={styles.streamingText}>
        {(text || "").split("\n").map((line, i) => (
          <div key={i}>{line || "\u00A0"}</div>
        ))}
      </div>
    );
  }

  // For streaming, use animator component
  return <TextAnimator text={text} onComplete={onComplete} />;
}

// Inner component for streaming animation
function TextAnimator({ text, onComplete }) {
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    if (charIndex >= text.length) {
      if (onComplete) onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCharIndex((prev) => Math.min(prev + 3, text.length));
    }, 15);

    return () => clearTimeout(timer);
  }, [charIndex, text.length, onComplete]);

  const displayText = text.slice(0, charIndex);

  return (
    <div className={styles.streamingText}>
      {displayText.split("\n").map((line, i) => (
        <div key={i}>{line || "\u00A0"}</div>
      ))}
    </div>
  );
}

export default function StreamingCodeDisplay({
  streamingCode,
  currentFile,
  completedFiles = [],
  isCurrentlyStreaming = false, // NEW: Only animate when this is the active streaming message
  workbenchFiles = [],
  postContent,
  onFileClick,
  appName = "Generated App",
  isGenerating = false,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Use workbenchFiles directly - it's already properly accumulated with statuses
  const hasWorkbenchContent = workbenchFiles.length > 0;

  return (
    <div className={styles.streamingCodeDisplay}>
      {/* Workbench Section - File Creation Steps */}
      {hasWorkbenchContent && (
        <motion.div
          className={styles.workbench}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            className={styles.workbenchHeader}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className={styles.headerContent}>
              <div className={styles.appInfo}>
                <span className={styles.appName}>{appName}</span>
                <span className={styles.subtitle}>Click to open Workbench</span>
              </div>
              <div className={styles.toggleIcon}>
                {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
              </div>
            </div>
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                className={styles.workbenchContent}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className={styles.fileList}>
                  <AnimatePresence initial={false}>
                    {workbenchFiles.map((file, index) => (
                      <motion.div
                        key={file.path}
                        className={`${styles.fileItem} ${
                          file.status === "in_progress" ? styles.inProgress : ""
                        }`}
                        initial={{ opacity: 0, x: -10, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: "auto" }}
                        exit={{ opacity: 0, x: -10, height: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        layout
                        onClick={() => onFileClick && onFileClick(file.path)}
                      >
                        <div className={styles.fileStatus}>
                          {file.status === "completed" && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 25,
                              }}
                            >
                              <FiCheck className={styles.checkIcon} />
                            </motion.div>
                          )}
                          {file.status === "in_progress" && (
                            <FiLoader className={styles.loaderIcon} />
                          )}
                        </div>
                        <span className={styles.fileAction}>{file.action}</span>
                        <span className={styles.filePath}>{file.path}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Final AI text after all files (appended at the very end) */}
      {postContent && (
        <div className={styles.finalText}>
          <StreamingText
            text={String(postContent)}
            isStreaming={isCurrentlyStreaming}
          />
        </div>
      )}
    </div>
  );
}
