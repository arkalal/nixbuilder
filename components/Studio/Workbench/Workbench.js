"use client";

import { useState, memo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiFile,
  FiCheck,
  FiX,
  FiChevronUp,
  FiChevronDown,
  FiCircle,
} from "react-icons/fi";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import styles from "./Workbench.module.scss";

/**
 * Workbench Component - Chef-style collapsible file operations card
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/chat/Artifact.tsx
 */
const Workbench = memo(function Workbench({
  title = "App Implementation",
  actions = [],
  onFileClick,
  allComplete = false,
}) {
  const userToggledRef = useRef(false);
  const [showActions, setShowActions] = useState(false);

  // Auto-expand when actions are added (like Chef)
  useEffect(() => {
    if (actions.length > 0 && !showActions && !userToggledRef.current) {
      // Use queueMicrotask to avoid synchronous setState warning
      queueMicrotask(() => {
        setShowActions(true);
      });
    }
  }, [actions.length, showActions]);

  const toggleActions = useCallback(() => {
    userToggledRef.current = true;
    setShowActions((prev) => !prev);
  }, []);

  const handleFileClick = useCallback(
    (filePath) => {
      if (onFileClick) {
        onFileClick(filePath);
      }
    },
    [onFileClick]
  );

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={styles.artifact}>
      {/* Header - Chef style */}
      <div className={styles.artifactHeader}>
        <button className={styles.artifactButton} onClick={toggleActions}>
          <div className={styles.artifactIcon}>
            {allComplete ? <FiFile className={styles.fileIcon} /> : <Spinner />}
          </div>
          <div className={styles.artifactDivider} />
          <div className={styles.artifactInfo}>
            <div className={styles.artifactTitle}>{title}</div>
            <div className={styles.artifactSubtitle}>
              Click to open Workbench
            </div>
          </div>
        </button>
        <div className={styles.artifactDivider} />
        <AnimatePresence>
          {actions.length > 0 && (
            <motion.button
              initial={{ width: 0 }}
              animate={{ width: "auto" }}
              exit={{ width: 0 }}
              transition={{ duration: 0.15 }}
              className={styles.toggleButton}
              onClick={toggleActions}
            >
              <div className={styles.toggleIcon}>
                {showActions ? <FiChevronUp /> : <FiChevronDown />}
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Actions List - Chef style */}
      <AnimatePresence>
        {showActions && actions.length > 0 && (
          <motion.div
            className={styles.actionsWrapper}
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.actionsDivider} />
            <div className={styles.actionsContent}>
              <ActionList actions={actions} onFileClick={handleFileClick} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Spinner Component - Chef style rotating spinner
 */
const Spinner = memo(function Spinner() {
  return <AiOutlineLoading3Quarters className={styles.spinner} />;
});

/**
 * ActionList Component - Chef style file operations list
 */
const ActionList = memo(function ActionList({ actions, onFileClick }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <ul className={styles.actionList}>
        {actions.map((action, index) => {
          const { file, status, isEdit } = action;
          const message = isEdit ? "Edit" : "Create";

          return (
            <motion.li
              key={action.id || `${file}-${index}`}
              className={styles.actionItem}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
            >
              <div className={styles.actionRow}>
                <div
                  className={`${styles.statusIcon} ${getIconColorClass(
                    status
                  )}`}
                >
                  <StatusIcon status={status} />
                </div>
                <div className={styles.actionText}>
                  {message}{" "}
                  <code
                    className={styles.filePath}
                    onClick={() => onFileClick(file)}
                  >
                    {file}
                  </code>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
});

/**
 * StatusIcon Component - Chef-style status icons
 * running → Spinner, pending → Circle outline, complete → Checkmark, failed → X
 */
const StatusIcon = memo(function StatusIcon({ status }) {
  switch (status) {
    case "in_progress":
    case "running":
      return <AiOutlineLoading3Quarters className={styles.spinner} />;
    case "completed":
    case "complete":
      return <FiCheck />;
    case "error":
    case "failed":
    case "aborted":
      return <FiX />;
    case "pending":
    default:
      return <FiCircle />;
  }
});

/**
 * Get icon color class based on status
 */
function getIconColorClass(status) {
  switch (status) {
    case "pending":
      return styles.statusPending;
    case "in_progress":
    case "running":
      return styles.statusRunning;
    case "completed":
    case "complete":
      return styles.statusComplete;
    case "aborted":
      return styles.statusAborted;
    case "error":
    case "failed":
      return styles.statusError;
    default:
      return "";
  }
}

export default Workbench;
