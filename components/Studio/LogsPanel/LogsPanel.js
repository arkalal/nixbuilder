"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiTerminal, FiAlertCircle } from "react-icons/fi";
import ErrorDisplay from "../ErrorDisplay/ErrorDisplay";
import styles from "./LogsPanel.module.scss";

export default function LogsPanel({
  logs,
  errors = [],
  onAutoFix,
  isFixing = false,
  fixResult = null,
}) {
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, errors]);

  const hasContent = logs.length > 0 || errors.length > 0;

  if (!hasContent) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <FiTerminal />
        </div>
        <h3 className={styles.emptyTitle}>No logs yet</h3>
        <p className={styles.emptyText}>
          Build logs will appear here during preview
        </p>
      </div>
    );
  }

  return (
    <div className={styles.logsPanel}>
      <div className={styles.logsContent}>
        {/* Error Display Section */}
        {errors.length > 0 && (
          <div className={styles.errorsSection}>
            <div className={styles.errorsSectionHeader}>
              <FiAlertCircle />
              <span>
                {errors.length} Error{errors.length !== 1 ? "s" : ""} Detected
              </span>
            </div>
            <AnimatePresence>
              {errors.map((error, index) => (
                <ErrorDisplay
                  key={`error-${index}`}
                  error={error}
                  onAutoFix={onAutoFix}
                  isFixing={isFixing}
                  fixResult={fixResult}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Regular Logs */}
        <AnimatePresence initial={false}>
          {logs.map((log, index) => (
            <motion.div
              key={index}
              className={`${styles.logLine} ${styles[log.level] || ""}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className={styles.logTimestamp}>
                {new Date(log.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className={styles.logMessage}>{log.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
