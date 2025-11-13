"use client";

import React, { useState, useEffect } from "react";
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
}) {
  const [manuallySelectedFile, setManuallySelectedFile] = useState(null);
  
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
                onFileSelect={setManuallySelectedFile}
              />
            </div>
            <div className={styles.codeViewerPanel}>
              <CodeViewer 
                files={files} 
                stage={stage}
                selectedFile={selectedFile}
                onFileSelect={setManuallySelectedFile}
                currentFile={currentFile}
              />
            </div>
          </div>
        )}
        {activeTab === "preview" && (
          <PreviewPanel previewUrl={previewUrl} stage={stage} />
        )}
        {activeTab === "logs" && <LogsPanel logs={logs} />}
      </div>
    </div>
  );
}
