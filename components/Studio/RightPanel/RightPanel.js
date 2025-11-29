"use client";

import React, { useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { FiCode, FiEye, FiTerminal } from "react-icons/fi";
import EditorPanel from "../EditorPanel/EditorPanel";
import PreviewPanel from "../PreviewPanel/PreviewPanel";
import LogsPanel from "../LogsPanel/LogsPanel";
import { setSelectedFile } from "../../../stores/workbench";
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
  selectedFileFromWorkbench, // File selected from left panel Workbench
  onClearWorkbenchSelection, // Clear workbench selection after handling
}) {
  // Handle file selection from Workbench (left panel)
  useEffect(() => {
    if (selectedFileFromWorkbench) {
      setSelectedFile(selectedFileFromWorkbench);
      if (onClearWorkbenchSelection) {
        onClearWorkbenchSelection();
      }
    }
  }, [selectedFileFromWorkbench, onClearWorkbenchSelection]);

  // Handle file reset (reload from files array)
  const handleFileReset = useCallback(
    (filePath) => {
      const file = files.find((f) => f.path === filePath);
      if (file && onFileUpdate) {
        onFileUpdate(filePath, file.content);
      }
    },
    [files, onFileUpdate]
  );

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
          <EditorPanel
            files={files}
            stage={stage}
            currentFile={currentFile}
            onFileUpdate={onFileUpdate}
            onFileReset={handleFileReset}
          />
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
