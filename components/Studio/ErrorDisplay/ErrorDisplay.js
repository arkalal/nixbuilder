"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiAlertTriangle,
  FiAlertCircle,
  FiChevronDown,
  FiChevronUp,
  FiTool,
  FiLoader,
  FiCheck,
  FiX,
  FiFile,
  FiCode,
} from "react-icons/fi";
import styles from "./ErrorDisplay.module.scss";

// Error type icons and colors
const ERROR_CONFIG = {
  npm_install: {
    icon: FiAlertCircle,
    color: "#ef4444",
    label: "NPM Install Error",
  },
  compilation: {
    icon: FiCode,
    color: "#f59e0b",
    label: "Compilation Error",
  },
  runtime: {
    icon: FiAlertTriangle,
    color: "#ef4444",
    label: "Runtime Error",
  },
  hydration: {
    icon: FiAlertTriangle,
    color: "#f97316",
    label: "Hydration Error",
  },
  syntax: {
    icon: FiCode,
    color: "#ef4444",
    label: "Syntax Error",
  },
  module_not_found: {
    icon: FiFile,
    color: "#ef4444",
    label: "Module Not Found",
  },
  type_error: {
    icon: FiAlertCircle,
    color: "#ef4444",
    label: "Type Error",
  },
  reference_error: {
    icon: FiAlertCircle,
    color: "#ef4444",
    label: "Reference Error",
  },
  unknown: {
    icon: FiAlertTriangle,
    color: "#6b7280",
    label: "Unknown Error",
  },
};

export default function ErrorDisplay({
  error,
  onAutoFix,
  isFixing = false,
  fixResult = null,
  showRaw = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(showRaw);

  if (!error) return null;

  const config = ERROR_CONFIG[error.type] || ERROR_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <motion.div
      className={styles.errorDisplay}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{ "--error-color": config.color }}
    >
      {/* Header */}
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <div className={styles.headerLeft}>
          <div className={styles.iconWrapper}>
            <Icon className={styles.icon} />
          </div>
          <div className={styles.headerInfo}>
            <span className={styles.errorType}>{config.label}</span>
            {error.file && (
              <span className={styles.errorFile}>
                {error.file}
                {error.line && `:${error.line}`}
              </span>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          {error.fixable !== false && !fixResult?.success && (
            <button
              className={`${styles.autoFixBtn} ${
                isFixing ? styles.fixing : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onAutoFix?.(error);
              }}
              disabled={isFixing}
            >
              {isFixing ? (
                <>
                  <FiLoader className={styles.spinner} />
                  <span>Fixing...</span>
                </>
              ) : (
                <>
                  <FiTool />
                  <span>Auto Fix</span>
                </>
              )}
            </button>
          )}
          {fixResult?.success && (
            <div className={styles.fixSuccess}>
              <FiCheck />
              <span>Fixed!</span>
            </div>
          )}
          <button className={styles.expandBtn}>
            {expanded ? <FiChevronUp /> : <FiChevronDown />}
          </button>
        </div>
      </div>

      {/* Error Message */}
      <div className={styles.message}>{error.message}</div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className={styles.details}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Suggestions */}
            {error.suggestions && error.suggestions.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Possible Causes</div>
                <ul className={styles.suggestions}>
                  {error.suggestions.map((suggestion, idx) => (
                    <li key={idx}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Failed Packages (for npm errors) */}
            {error.packages && error.packages.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Failed Packages</div>
                <div className={styles.packages}>
                  {error.packages.map((pkg, idx) => (
                    <div key={idx} className={styles.package}>
                      <span className={styles.packageName}>{pkg.name}</span>
                      <span className={styles.packageReason}>
                        {pkg.reason === "not_found"
                          ? "Not found"
                          : pkg.reason === "resolve_failed"
                          ? "Version conflict"
                          : pkg.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fix Result */}
            {fixResult && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Fix Result</div>
                <div
                  className={`${styles.fixResult} ${
                    fixResult.success ? styles.success : styles.failed
                  }`}
                >
                  {fixResult.success ? (
                    <>
                      <FiCheck />
                      <span>
                        Fixed {fixResult.filesFixed} file
                        {fixResult.filesFixed !== 1 ? "s" : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <FiX />
                      <span>
                        Could not auto-fix. Manual intervention needed.
                      </span>
                    </>
                  )}
                </div>
                {fixResult.fixedFiles && fixResult.fixedFiles.length > 0 && (
                  <div className={styles.fixedFiles}>
                    {fixResult.fixedFiles.map((file, idx) => (
                      <div key={idx} className={styles.fixedFile}>
                        <FiFile />
                        <span>{file}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Raw Output Toggle */}
            {error.raw && (
              <div className={styles.section}>
                <button
                  className={styles.rawToggle}
                  onClick={() => setShowRawOutput(!showRawOutput)}
                >
                  {showRawOutput ? "Hide" : "Show"} Raw Output
                </button>
                {showRawOutput && (
                  <pre className={styles.rawOutput}>
                    {error.raw.substring(0, 2000)}
                    {error.raw.length > 2000 && "\n... (truncated)"}
                  </pre>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Compact error badge for inline display
export function ErrorBadge({ error, onClick }) {
  if (!error) return null;

  const config = ERROR_CONFIG[error.type] || ERROR_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <button
      className={styles.errorBadge}
      style={{ "--error-color": config.color }}
      onClick={onClick}
    >
      <Icon />
      <span>{config.label}</span>
    </button>
  );
}

// Error count indicator
export function ErrorCount({ count, onClick }) {
  if (!count || count === 0) return null;

  return (
    <button className={styles.errorCount} onClick={onClick}>
      <FiAlertCircle />
      <span>
        {count} error{count !== 1 ? "s" : ""}
      </span>
    </button>
  );
}
