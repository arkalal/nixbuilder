"use client";

import React, { useState, useRef, useCallback } from "react";
import { FiFile, FiFolder, FiRotateCcw, FiChevronRight } from "react-icons/fi";
import dynamic from "next/dynamic";
import styles from "./CodeViewer.module.scss";

// Dynamic import CodeMirror to avoid SSR issues
const CodeMirrorEditor = dynamic(
  () => import("../CodeMirrorEditor/CodeMirrorEditor"),
  { ssr: false }
);

/**
 * CodeViewer - Chef-style code editor with breadcrumb navigation
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/workbench/EditorPanel.tsx
 */

export default function CodeViewer({
  files = [],
  stage,
  selectedFile,
  currentFile,
  onFileUpdate,
}) {
  // Track unsaved changes per file
  const [unsavedFiles, setUnsavedFiles] = useState(new Set());
  const scrollRef = useRef(null);

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

  // Get the file to display - selected file or latest
  const displayFile =
    allFiles.find((f) => f.path === selectedFile) ||
    (allFiles.length > 0 ? allFiles[allFiles.length - 1] : null);

  const depPath = displayFile?.path;
  const depContent = displayFile?.content || "";
  const depStreaming = !!displayFile?.streaming;

  // Check if current file has unsaved changes
  const isDirty = depPath && unsavedFiles.has(depPath);

  // Create EditorDocument for CodeMirror (Chef's approach)
  const editorDocument = React.useMemo(() => {
    if (!displayFile) return null;
    return {
      value: displayFile.content || "",
      filePath: displayFile.path,
      isBinary: false,
    };
  }, [displayFile]);

  // Handle editor content changes (Chef's approach)
  const handleEditorChange = useCallback(
    (update) => {
      if (!depPath) return;
      const originalContent = depContent;
      const hasChanges = update.content !== originalContent;

      setUnsavedFiles((prev) => {
        const next = new Set(prev);
        if (hasChanges) {
          next.add(depPath);
        } else {
          next.delete(depPath);
        }
        return next;
      });

      // Update file content
      if (onFileUpdate && hasChanges) {
        onFileUpdate(depPath, update.content);
      }
    },
    [depPath, depContent, onFileUpdate]
  );

  // Generate breadcrumb segments from displayed file path - Chef style
  const breadcrumbSegments = displayFile?.path
    ? displayFile.path.split("/").filter(Boolean)
    : [];

  // Handle reset (discard changes) - Chef style
  const handleReset = useCallback(() => {
    if (depPath) {
      setUnsavedFiles((prev) => {
        const next = new Set(prev);
        next.delete(depPath);
        return next;
      });
      // Force re-render with original content
      // This will be handled by CodeMirror's document prop change
    }
  }, [depPath]);

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
          {/* Chef-style header with breadcrumb and Save/Reset buttons */}
          <div className={styles.tabsHeader}>
            {/* Breadcrumb navigation - Chef style */}
            <div className={styles.breadcrumb}>
              {breadcrumbSegments.map((segment, index) => {
                const isLast = index === breadcrumbSegments.length - 1;
                return (
                  <span key={index} className={styles.breadcrumbItem}>
                    {isLast && <FiFile className={styles.breadcrumbIcon} />}
                    <span
                      className={
                        isLast
                          ? styles.breadcrumbActive
                          : styles.breadcrumbSegment
                      }
                    >
                      {segment}
                    </span>
                    {!isLast && (
                      <FiChevronRight className={styles.breadcrumbSeparator} />
                    )}
                  </span>
                );
              })}
            </div>

            {/* Reset button - Chef style (changes are auto-saved via onChange) */}
            {isDirty && (
              <div className={styles.actionButtons}>
                <button
                  className={styles.resetBtn}
                  onClick={handleReset}
                  title="Reset changes"
                >
                  <FiRotateCcw />
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>

          <div className={styles.codeContent} ref={scrollRef}>
            {editorDocument ? (
              <div className={styles.codeWrapper}>
                {/* Chef-style CodeMirror editor - handles both streaming and static content */}
                <CodeMirrorEditor
                  doc={editorDocument}
                  editable={!depStreaming}
                  scrollToDocAppend={depStreaming}
                  onChange={handleEditorChange}
                />
                {/* Streaming cursor indicator */}
                {depStreaming && <span className={styles.streamingIndicator} />}
              </div>
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
