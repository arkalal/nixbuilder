"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { FiFile, FiFolder } from "react-icons/fi";
import styles from "./CodeViewer.module.scss";

export default function CodeViewer({ files, stage, selectedFile: externalSelectedFile, onFileSelect, currentFile }) {
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);

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

  if (allFiles.length === 0) {
    return (
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
    );
  }

  // Add filename extraction to each file
  const filesWithNames = allFiles.map((file) => ({
    ...file,
    name: file.path.split("/").pop(),
  }));

  // Find current display file object
  const displayFile = filesWithNames.find(f => f.path === selectedFilePath) || filesWithNames[filesWithNames.length - 1];
  
  const handleTabClick = (file) => {
    if (onFileSelect) {
      onFileSelect(file.path);
    } else {
      setInternalSelectedFile(file.path);
    }
  };

  return (
    <div className={styles.codeViewer}>
      <div className={styles.fileTabs}>
        {filesWithNames.map((file) => (
          <button
            key={file.path}
            className={`${styles.fileTab} ${
              displayFile?.path === file.path ? styles.active : ""
            } ${file.streaming ? styles.streaming : ""}`}
            onClick={() => handleTabClick(file)}
          >
            {file.streaming && (
              <div className={styles.spinner} />
            )}
            <FiFile className={styles.fileIcon} />
            <span className={styles.fileName}>{file.name}</span>
          </button>
        ))}
      </div>

      <div className={styles.codeContent}>
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
