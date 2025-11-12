"use client";

import { motion } from "framer-motion";
import { FiLoader, FiExternalLink, FiRefreshCw, FiSquare } from "react-icons/fi";
import styles from "./PreviewPanel.module.scss";

export default function PreviewPanel({ previewUrl, stage }) {
  const isSpinningUp = stage === "previewing" && !previewUrl;
  const isReady = previewUrl !== null;

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  };

  const handleRestart = () => {
    // Will be connected to /api/preview/start in M5
    console.log("Restart preview");
  };

  const handleStop = () => {
    // Will be connected to /api/preview/stop in M5
    console.log("Stop preview");
  };

  if (isSpinningUp) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.spinningUp}>
          <motion.div
            className={styles.loaderWrapper}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className={styles.loaderRing}
              animate={{ rotate: 360 }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <FiLoader className={styles.loaderIcon} />
          </motion.div>
          <motion.h3
            className={styles.loadingTitle}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Spinning up preview
          </motion.h3>
          <motion.p
            className={styles.loadingText}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Building your app on Fly.io...
          </motion.p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FiExternalLink />
          </div>
          <h3 className={styles.emptyTitle}>No preview yet</h3>
          <p className={styles.emptyText}>
            Your app preview will appear here once it&apos;s ready
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewControls}>
        <div className={styles.urlDisplay}>
          <span className={styles.urlLabel}>Preview:</span>
          <span className={styles.url}>{previewUrl}</span>
        </div>
        <div className={styles.controlButtons}>
          <motion.button
            className={styles.controlButton}
            onClick={handleOpenExternal}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Open in new tab"
          >
            <FiExternalLink />
          </motion.button>
          <motion.button
            className={styles.controlButton}
            onClick={handleRestart}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Restart preview"
          >
            <FiRefreshCw />
          </motion.button>
          <motion.button
            className={`${styles.controlButton} ${styles.danger}`}
            onClick={handleStop}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Stop preview"
          >
            <FiSquare />
          </motion.button>
        </div>
      </div>

      <div className={styles.iframeContainer}>
        <iframe
          src={previewUrl}
          className={styles.iframe}
          title="App Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
