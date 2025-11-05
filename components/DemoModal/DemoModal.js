"use client";

import { motion, AnimatePresence } from "framer-motion";
import { HiX, HiPlay } from "react-icons/hi";
import styles from "./DemoModal.module.scss";

export default function DemoModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          <div className={styles.modalWrapper}>
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
            <button className={styles.closeBtn} onClick={onClose}>
              <HiX size={24} />
            </button>

            <div className={styles.content}>
              <div className={styles.header}>
                <h2 className={styles.title}>Interactive Demo</h2>
                <p className={styles.subtitle}>
                  See nixbuilder in action - from prompt to preview
                </p>
              </div>

              <div className={styles.videoPlaceholder}>
                <div className={styles.playBtn}>
                  <HiPlay size={48} />
                </div>
                <p className={styles.placeholderText}>
                  Demo video will be embedded here
                </p>
                <p className={styles.placeholderSubtext}>
                  Watch how nixbuilder generates a full-stack app in under 2 minutes
                </p>
              </div>

              <div className={styles.features}>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>⚡</span>
                  <span>Real-time code generation</span>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>🚀</span>
                  <span>Instant preview deployment</span>
                </div>
                <div className={styles.feature}>
                  <span className={styles.featureIcon}>✨</span>
                  <span>AI-powered architecture</span>
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
