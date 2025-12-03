"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FiCode, FiEye, FiTerminal } from "react-icons/fi";
import FileExplorer from "../FileExplorer/FileExplorer";
import CodeViewer from "../CodeViewer/CodeViewer";
import PreviewPanel from "../PreviewPanel/PreviewPanel";
import LogsPanel from "../LogsPanel/LogsPanel";
import styles from "./RightPanel.module.scss";

const tabs = [
  { id: "code", label: "Code", icon: FiCode },
  { id: "preview", label: "Preview", icon: FiEye },
  { id: "logs", label: "Logs", icon: FiTerminal },
];

export default function RightPanel({
  activeTab,
  onTabChange,
  files,
  logs,
  previewUrl,
  stage,
  currentFile, // Streaming file being generated
  onPreviewRestart,
  onPreviewStop,
  onFileUpdate, // Callback when file content is edited
  externalSelectedFile, // File selected from left panel workbench
}) {
  const [manuallySelectedFile, setManuallySelectedFile] = useState(null);
  const [closedTabs, setClosedTabs] = useState(new Set()); // Track explicitly closed tabs

  // Handle external file selection from workbench (left panel)
  React.useEffect(() => {
    if (externalSelectedFile) {
      setManuallySelectedFile(externalSelectedFile);
      // Remove from closed tabs to ensure it's open
      setClosedTabs((prev) => {
        if (prev.has(externalSelectedFile)) {
          const next = new Set(prev);
          next.delete(externalSelectedFile);
          return next;
        }
        return prev;
      });
    }
  }, [externalSelectedFile]);

  // Compute open tabs: all file paths minus explicitly closed ones
  const openTabs = React.useMemo(() => {
    const allPaths = files.map((f) => f.path);
    // Filter out explicitly closed tabs
    return allPaths.filter((path) => !closedTabs.has(path));
  }, [files, closedTabs]);

  // Auto-select current streaming file, or latest completed file, or manual selection
  const selectedFile = React.useMemo(() => {
    if (stage === "generating") {
      // Prioritize currentFile being streamed
      if (currentFile?.path) return currentFile.path;
      // Otherwise, show latest completed file
      if (files.length > 0) return files[files.length - 1].path;
    }
    return manuallySelectedFile;
  }, [stage, currentFile, files, manuallySelectedFile]);

  // Handle file selection from explorer (opens tab and selects)
  const handleFileSelect = useCallback((filePath) => {
    setManuallySelectedFile(filePath);
    // Remove from closed tabs to ensure it's open
    setClosedTabs((prev) => {
      if (prev.has(filePath)) {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      }
      return prev;
    });
  }, []);

  // Handle tab close
  const handleTabClose = useCallback(
    (filePath) => {
      // Add to closed tabs
      setClosedTabs((prev) => {
        const next = new Set(prev);
        next.add(filePath);
        return next;
      });
      // If closing the selected file, select another open tab
      if (manuallySelectedFile === filePath) {
        const remainingOpen = openTabs.filter((p) => p !== filePath);
        if (remainingOpen.length > 0) {
          setManuallySelectedFile(remainingOpen[remainingOpen.length - 1]);
        } else {
          setManuallySelectedFile(null);
        }
      }
    },
    [manuallySelectedFile, openTabs]
  );

  // Handle close all tabs
  const handleCloseAllTabs = useCallback(() => {
    // Add all current file paths to closed tabs
    setClosedTabs(new Set(files.map((f) => f.path)));
    setManuallySelectedFile(null);
  }, [files]);

  return (
    <div className={styles.rightPanel}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${isActive ? styles.active : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon className={styles.tabIcon} />
              <span className={styles.tabLabel}>{tab.label}</span>
              {isActive && (
                <motion.div
                  className={styles.activeIndicator}
                  layoutId="activeTab"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className={styles.tabContent}>
        {activeTab === "code" && (
          <div className={styles.codeTabLayout}>
            <div className={styles.fileExplorerPanel}>
              <FileExplorer
                files={files}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
              />
            </div>
            <div className={styles.codeViewerPanel}>
              <CodeViewer
                files={files}
                stage={stage}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                currentFile={currentFile}
                onFileUpdate={onFileUpdate}
                openTabs={openTabs}
                onTabClose={handleTabClose}
                onCloseAllTabs={handleCloseAllTabs}
              />
            </div>
          </div>
        )}
        {activeTab === "preview" && (
          <PreviewPanel
            previewUrl={previewUrl}
            stage={stage}
            onRestart={onPreviewRestart}
            onStop={onPreviewStop}
          />
        )}
        {activeTab === "logs" && <LogsPanel logs={logs} />}
      </div>
    </div>
  );
}
