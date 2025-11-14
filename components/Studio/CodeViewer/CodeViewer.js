"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { FiFile, FiFolder } from "react-icons/fi";
import styles from "./CodeViewer.module.scss";

export default function CodeViewer({
  files,
  stage,
  selectedFile: externalSelectedFile,
  onFileSelect,
  currentFile,
}) {
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const tabsContainerRef = useRef(null);
  const tabRefsRef = useRef({});

  // Use external selectedFile if provided, otherwise use internal state
  const selectedFilePath = externalSelectedFile || internalSelectedFile;

  // Merge currentFile (streaming) into files array for display
  const allFiles = React.useMemo(() => {
    if (!currentFile) return files;

    const index = files.findIndex((f) => f.path === currentFile.path);
    if (index >= 0) {
      // Show streaming state and partial content on the existing tab
      const augmented = files.slice();
      augmented[index] = {
        ...augmented[index],
        content: currentFile.content,
        streaming: true,
      };
      return augmented;
    }

    // File is new and streaming - add to display with streaming content
    return [
      ...files,
      {
        path: currentFile.path,
        content: currentFile.content,
        streaming: true,
        type: currentFile.type,
      },
    ];
  }, [files, currentFile]);

  const scrollRef = useRef(null);
  const displayFile =
    allFiles.find((f) => f.path === selectedFilePath) ||
    allFiles[allFiles.length - 1];
  const depPath = displayFile?.path;
  const depContent = displayFile?.content;
  const depStreaming = !!displayFile?.streaming;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (depStreaming) {
      el.scrollTop = el.scrollHeight;
    }
  }, [depPath, depContent, depStreaming]);

  // Add filename extraction to each file
  const filesWithNames = allFiles.map((file) => ({
    ...file,
    name: file.path.split("/").pop(),
  }));

  // Smoothly auto-scroll to the active tab when selection/streaming changes
  const activePath = displayFile?.path;
  useEffect(() => {
    if (!activePath) return;
    const el = tabRefsRef.current[activePath];
    const container = tabsContainerRef.current;
    if (el && container) {
      try {
        el.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      } catch {
        // Fallback manual scroll calculation
        const elLeft = el.offsetLeft;
        const elRight = elLeft + el.offsetWidth;
        const viewLeft = container.scrollLeft;
        const viewRight = viewLeft + container.clientWidth;
        if (elLeft < viewLeft) {
          container.scrollTo({ left: elLeft - 16, behavior: "smooth" });
        } else if (elRight > viewRight) {
          container.scrollTo({
            left: elRight - container.clientWidth + 16,
            behavior: "smooth",
          });
        }
      }
    }
  }, [activePath]);

  const handleTabClick = (file) => {
    if (onFileSelect) {
      onFileSelect(file.path);
    } else {
      setInternalSelectedFile(file.path);
    }
  };

  return (
    <div className={styles.codeViewer}>
      {allFiles.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FiFolder />
          </div>
          <h3 className={styles.emptyTitle}>No files yet</h3>
          <p className={styles.emptyText}>
            {stage === "generating"
              ? "Files are being generated..."
              : "Start building to see code here"}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.fileTabs} ref={tabsContainerRef}>
            {filesWithNames.map((file) => (
              <button
                key={file.path}
                className={`${styles.fileTab} ${
                  displayFile?.path === file.path ? styles.active : ""
                } ${file.streaming ? styles.streaming : ""}`}
                onClick={() => handleTabClick(file)}
                ref={(el) => {
                  if (el) tabRefsRef.current[file.path] = el;
                }}
              >
                {file.streaming && <div className={styles.spinner} />}
                <FiFile className={styles.fileIcon} />
                <span className={styles.fileName}>{file.name}</span>
              </button>
            ))}
          </div>

          <div className={styles.codeContent} ref={scrollRef}>
            <AnimatePresence mode="wait">
              <motion.div
                key={displayFile?.path}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={styles.codeWrapper}
              >
                <SyntaxHighlighter
                  language={getLanguage(displayFile?.name)}
                  style={vscDarkPlus}
                  showLineNumbers
                  customStyle={{
                    margin: 0,
                    padding: "1rem",
                    background: "var(--color-bg)",
                    fontSize: "0.875rem",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {displayFile?.content || ""}
                </SyntaxHighlighter>
                {displayFile?.streaming && (
                  <span className={styles.cursor}>▊</span>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function getLanguage(filename) {
  if (!filename) return "javascript";

  const ext = filename.split(".").pop();
  const langMap = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
  };

  return langMap[ext] || "javascript";
}
