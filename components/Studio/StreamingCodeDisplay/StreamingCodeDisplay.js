"use client";

import { useCallback } from "react";
import { useStore } from "@nanostores/react";
import { $actions } from "../../../stores/workbench";
import WorkbenchContainer from "../WorkbenchContainer/WorkbenchContainer";
import styles from "./StreamingCodeDisplay.module.scss";

export default function StreamingCodeDisplay({ postContent, onFileClick }) {
  // Subscribe to nanostores actions
  const actionsMap = useStore($actions);
  const hasActions = Object.keys(actionsMap).length > 0;

  const handleFileClick = useCallback(
    (filePath) => {
      if (onFileClick) {
        onFileClick(filePath);
      }
    },
    [onFileClick]
  );

  // If no actions and no post content, don't render
  if (!hasActions && !postContent) {
    return null;
  }

  return (
    <div className={styles.streamingCodeDisplay}>
      {/* Workbench - Chef-style file operations list using nanostores */}
      {hasActions && (
        <WorkbenchContainer
          title="App Implementation"
          onFileClick={handleFileClick}
        />
      )}

      {/* Final AI text after all files (appended at the very end) */}
      {postContent && (
        <div className={styles.finalText}>
          {String(postContent)
            .split("\n")
            .map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))}
        </div>
      )}
    </div>
  );
}
