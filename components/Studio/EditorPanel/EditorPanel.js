"use client";

/**
 * EditorPanel Component - Chef-style editor panel with file tree and code editor
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/workbench/EditorPanel.tsx
 */

import { memo, useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useStore } from "@nanostores/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import dynamic from "next/dynamic";
import { FiRotateCcw, FiCheck, FiFolder } from "react-icons/fi";
import FileTree from "../FileTree/FileTree";
import {
  $selectedFile,
  $currentDocument,
  $followingStreamedCode,
  $unsavedFiles,
  $currentStreamingFile,
  setSelectedFile,
  updateEditorFile,
  markFileSaved,
  stopFollowingStreamedCode,
  syncFilesWithEditor,
  setStreamingDocument,
} from "../../../stores/workbench";
import styles from "./EditorPanel.module.scss";

// Dynamic import of CodeMirrorEditor to avoid SSR issues
const CodeMirrorEditor = dynamic(
  () => import("../CodeMirrorEditor/CodeMirrorEditor"),
  { ssr: false }
);

const EditorPanel = memo(function EditorPanel({
  files = [],
  stage,
  currentFile, // Currently streaming file from page.js
  onFileUpdate, // Callback when user edits a file
  onFileReset, // Callback to reset file to original
}) {
  const selectedFile = useStore($selectedFile);
  const currentDocument = useStore($currentDocument);
  const followingStreamedCode = useStore($followingStreamedCode);
  const unsavedFiles = useStore($unsavedFiles);
  const currentStreamingFile = useStore($currentStreamingFile);
  const isStreaming = stage === "generating";
  const prevFilesLengthRef = useRef(0);

  // Sync files with editor store when files change
  useEffect(() => {
    if (files.length > 0) {
      syncFilesWithEditor(files);
    }
  }, [files]);

  // Sync streaming file with editor store
  useEffect(() => {
    if (currentFile?.path && currentFile?.content) {
      setStreamingDocument(currentFile.path, currentFile.content);
    }
  }, [currentFile?.path, currentFile?.content]);

  // Auto-select first file when files load
  useEffect(() => {
    if (files.length > 0 && !selectedFile && prevFilesLengthRef.current === 0) {
      setSelectedFile(files[0].path);
    }
    prevFilesLengthRef.current = files.length;
  }, [files, selectedFile]);

  // Get active file segments for breadcrumb
  const activeFileSegments = useMemo(() => {
    if (!currentDocument?.filePath) {
      return undefined;
    }
    return currentDocument.filePath.split("/");
  }, [currentDocument]);

  // Check if current file is unsaved
  const activeFileUnsaved = useMemo(() => {
    return (
      currentDocument !== undefined &&
      unsavedFiles.has(currentDocument.filePath)
    );
  }, [currentDocument, unsavedFiles]);

  // Handle file selection from tree
  const handleFileSelect = useCallback((filePath) => {
    setSelectedFile(filePath);
    stopFollowingStreamedCode();
  }, []);

  // Handle editor content change
  const handleEditorChange = useCallback(
    ({ content, filePath }) => {
      updateEditorFile(filePath, content);
      if (onFileUpdate) {
        onFileUpdate(filePath, content);
      }
    },
    [onFileUpdate]
  );

  // Handle file save
  const handleFileSave = useCallback(() => {
    if (currentDocument?.filePath) {
      markFileSaved(currentDocument.filePath);
    }
  }, [currentDocument]);

  // Handle file reset
  const handleFileReset = useCallback(() => {
    if (currentDocument?.filePath && onFileReset) {
      onFileReset(currentDocument.filePath);
      markFileSaved(currentDocument.filePath);
    }
  }, [currentDocument, onFileReset]);

  // Determine if we should scroll to append (following streaming)
  const scrollToDocAppend = isStreaming && followingStreamedCode;

  return (
    <div className={styles.editorPanel}>
      <PanelGroup direction="horizontal">
        {/* File Tree Panel */}
        <Panel defaultSize={25} minSize={15} collapsible>
          <div className={styles.fileTreeContainer}>
            <div className={styles.panelHeader}>
              <FiFolder className={styles.headerIcon} />
              <span>Files</span>
            </div>
            <FileTree
              files={files}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              unsavedFiles={unsavedFiles}
              currentStreamingFile={currentFile?.path}
              className={styles.fileTree}
            />
          </div>
        </Panel>

        <PanelResizeHandle className={styles.resizeHandle} />

        {/* Code Editor Panel */}
        <Panel className={styles.editorContainer} defaultSize={75} minSize={30}>
          {/* Breadcrumb Header */}
          <div className={styles.panelHeader}>
            {activeFileSegments?.length ? (
              <div className={styles.breadcrumb}>
                {activeFileSegments.map((segment, idx) => (
                  <span key={idx} className={styles.breadcrumbSegment}>
                    {idx > 0 && <span className={styles.separator}>/</span>}
                    <span
                      className={
                        idx === activeFileSegments.length - 1
                          ? styles.active
                          : ""
                      }
                    >
                      {segment}
                    </span>
                  </span>
                ))}
                {activeFileUnsaved && (
                  <div className={styles.unsavedActions}>
                    <button
                      className={styles.headerButton}
                      onClick={handleFileSave}
                    >
                      <FiCheck />
                      Save
                    </button>
                    <button
                      className={styles.headerButton}
                      onClick={handleFileReset}
                    >
                      <FiRotateCcw />
                      Reset
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <span className={styles.noFile}>No file selected</span>
            )}
          </div>

          {/* Code Editor */}
          <div className={styles.editorWrapper}>
            {currentDocument ? (
              <CodeMirrorEditor
                doc={currentDocument}
                editable={!isStreaming}
                scrollToDocAppend={scrollToDocAppend}
                onChange={handleEditorChange}
              />
            ) : (
              <div className={styles.emptyEditor}>
                <FiFolder className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>
                  {files.length === 0 ? "No files yet" : "Select a file"}
                </h3>
                <p className={styles.emptyText}>
                  {stage === "generating"
                    ? "Files are being generated..."
                    : files.length === 0
                    ? "Start a conversation to generate code"
                    : "Click on a file in the tree to view its contents"}
                </p>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
});

export default EditorPanel;
