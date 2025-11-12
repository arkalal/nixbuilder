"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiTerminal } from "react-icons/fi";
import styles from "./LogsPanel.module.scss";

export default function LogsPanel({ logs }) {
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (logs.length === 0) {
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
