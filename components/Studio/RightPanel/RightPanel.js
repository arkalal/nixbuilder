"use client";

import { motion } from "framer-motion";
import { FiCode, FiEye, FiTerminal } from "react-icons/fi";
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
}) {
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
        {activeTab === "code" && <CodeViewer files={files} stage={stage} />}
        {activeTab === "preview" && (
          <PreviewPanel previewUrl={previewUrl} stage={stage} />
        )}
        {activeTab === "logs" && <LogsPanel logs={logs} />}
      </div>
    </div>
  );
}
