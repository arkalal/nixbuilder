"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiFile, FiFolder, FiX, FiXCircle } from "react-icons/fi";
import styles from "./CodeViewer.module.scss";

export default function CodeViewer({
  files,
  stage,
  selectedFile: externalSelectedFile,
  onFileSelect,
  currentFile,
  onFileUpdate,
  openTabs = [],
  onTabClose,
  onCloseAllTabs,
}) {
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  // Track edits per file: { [path]: { content: string, dirty: boolean } }
  const [editState, setEditState] = useState({});
  const tabsContainerRef = useRef(null);
  const tabRefsRef = useRef({});
  const textareaRef = useRef(null);
  const scrollRef = useRef(null);

  const selectedFilePath = externalSelectedFile || internalSelectedFile;

  // Merge currentFile (streaming) into files array
  const allFiles = React.useMemo(() => {
    if (!currentFile) return files;
    const index = files.findIndex((f) => f.path === currentFile.path);
    if (index >= 0) {
      const augmented = files.slice();
      augmented[index] = {
        ...augmented[index],
        content: currentFile.content,
        streaming: true,
      };
      return augmented;
    }
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

  // Filter to show only open tabs
  // If onTabClose is provided, respect openTabs (even if empty means no tabs)
  // If no tab management, show all files
  const displayedTabs = onTabClose
    ? allFiles.filter((f) => openTabs.includes(f.path))
    : allFiles;

  const displayFile =
    allFiles.find((f) => f.path === selectedFilePath) ||
    (displayedTabs.length > 0 ? displayedTabs[displayedTabs.length - 1] : null);

  const depPath = displayFile?.path;
  const depContent = displayFile?.content || "";
  const depStreaming = !!displayFile?.streaming;

  // Get current edit state for displayed file
  const currentEdit = depPath ? editState[depPath] : null;
  const displayContent = currentEdit?.content ?? depContent;
  const isDirty = currentEdit?.dirty ?? false;

  // Auto-scroll during streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (el && depStreaming) {
      el.scrollTop = el.scrollHeight;
    }
  }, [depPath, depContent, depStreaming]);

  // Auto-scroll tabs to active
  useEffect(() => {
    if (!depPath) return;
    const el = tabRefsRef.current[depPath];
    const container = tabsContainerRef.current;
    if (el && container) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [depPath]);

  const filesWithNames = displayedTabs.map((file) => ({
    ...file,
    name: file.path.split("/").pop(),
  }));

  const handleTabClick = (file) => {
    if (onFileSelect) {
      onFileSelect(file.path);
    } else {
      setInternalSelectedFile(file.path);
    }
  };

  const handleTabCloseClick = (e, filePath) => {
    e.stopPropagation();
    if (onTabClose) onTabClose(filePath);
  };

  const handleCloseAllClick = () => {
    if (onCloseAllTabs) onCloseAllTabs();
  };

  const handleContentChange = (e) => {
    if (!depPath) return;
    setEditState((prev) => ({
      ...prev,
      [depPath]: { content: e.target.value, dirty: true },
    }));
  };

  const handleSave = () => {
    if (isDirty && depPath && onFileUpdate) {
      onFileUpdate(depPath, displayContent);
      setEditState((prev) => ({
        ...prev,
        [depPath]: { content: displayContent, dirty: false },
      }));
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newVal =
        displayContent.substring(0, start) +
        "  " +
        displayContent.substring(end);
      setEditState((prev) => ({
        ...prev,
        [depPath]: { content: newVal, dirty: true },
      }));
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
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
          <div className={styles.tabsHeader}>
            <div className={styles.fileTabs} ref={tabsContainerRef}>
              {filesWithNames.map((file) => (
                <div
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
                  {!file.streaming && onTabClose && (
                    <button
                      className={styles.tabCloseBtn}
                      onClick={(e) => handleTabCloseClick(e, file.path)}
                      title="Close tab"
                    >
                      <FiX />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {displayedTabs.length > 0 && onCloseAllTabs && (
              <button
                className={styles.closeAllBtn}
                onClick={handleCloseAllClick}
                title="Close all tabs"
              >
                <FiXCircle />
                <span>Close All</span>
              </button>
            )}
          </div>

          <div className={styles.codeContent} ref={scrollRef}>
            {displayFile ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={displayFile.path}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={styles.codeWrapper}
                >
                  {displayFile.streaming ? (
                    <div className={styles.streamingContent}>
                      <pre className={styles.codePreview}>
                        <code>{displayFile.content || ""}</code>
                      </pre>
                      <span className={styles.cursor}>▊</span>
                    </div>
                  ) : (
                    <div className={styles.editorContainer}>
                      <div className={styles.lineNumbers}>
                        {displayContent.split("\n").map((_, i) => (
                          <span key={i} className={styles.lineNumber}>
                            {i + 1}
                          </span>
                        ))}
                      </div>
                      <textarea
                        ref={textareaRef}
                        className={styles.codeEditor}
                        value={displayContent}
                        onChange={handleContentChange}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                      />
                      {isDirty && (
                        <div className={styles.editingIndicator}>
                          <span>Editing • Ctrl+S to save</span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className={styles.noFileSelected}>
                <FiFile className={styles.noFileIcon} />
                <p>Select a file from the explorer to view</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
