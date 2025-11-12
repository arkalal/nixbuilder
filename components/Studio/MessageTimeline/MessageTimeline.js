"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FiUser, FiCpu, FiCheck, FiLoader, FiAlertCircle } from "react-icons/fi";
import StreamingCodeDisplay from "../StreamingCodeDisplay/StreamingCodeDisplay";
import styles from "./MessageTimeline.module.scss";

export default function MessageTimeline({ messages, streamingCode, currentFile, completedFiles }) {
  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <FiCpu />
        </div>
        <h3 className={styles.emptyTitle}>Ready to build</h3>
        <p className={styles.emptyText}>
          Describe your app idea below and watch it come to life.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      <AnimatePresence initial={false}>
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            className={`${styles.message} ${
              message.role === "user" ? styles.userMessage : styles.assistantMessage
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <div className={styles.messageHeader}>
              <div className={styles.avatar}>
                {message.role === "user" ? <FiUser /> : <FiCpu />}
              </div>
              <div className={styles.messageInfo}>
                <span className={styles.roleName}>
                  {message.role === "user" ? "You" : "AI Agent"}
                </span>
                <span className={styles.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            {message.content && message.content.trim() && (
              <div className={styles.messageContent}>
                {message.content === "Analyzing your request..." ? (
                  <div className={styles.loadingMessage}>
                    <FiLoader className={styles.iconSpinning} />
                    <span>{message.content}</span>
                  </div>
                ) : (
                  message.content.split("\n").map((line, i) => (
                    <div key={i}>{line || '\u00A0'}</div>
                  ))
                )}
              </div>
            )}

            {message.activities && message.activities.length > 0 && (
              <div className={styles.activities}>
                {message.activities.map((activity) => (
                  <motion.div
                    key={activity.id}
                    className={styles.activity}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={styles.activityIcon}>
                      {activity.status === "completed" && (
                        <FiCheck className={styles.iconSuccess} />
                      )}
                      {activity.status === "in_progress" && (
                        <FiLoader className={styles.iconSpinning} />
                      )}
                      {activity.status === "error" && (
                        <FiAlertCircle className={styles.iconError} />
                      )}
                    </div>
                    <span className={styles.activityMessage}>
                      {activity.message}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Show streaming code for the last AI message (open-lovable style) */}
            {message.role === "assistant" && 
             index === messages.length - 1 && 
             (streamingCode || currentFile || completedFiles.length > 0) && (
              <StreamingCodeDisplay 
                streamingCode={streamingCode}
                currentFile={currentFile}
                completedFiles={completedFiles}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
