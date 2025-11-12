"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FiCheck, FiLoader } from "react-icons/fi";
import styles from "./StageIndicator.module.scss";

const stageConfig = {
  idle: { label: "Ready", color: "var(--color-text-secondary)" },
  planning: { label: "Planning", color: "var(--color-accent)" },
  generating: { label: "Generating", color: "var(--color-primary-start)" },
  previewing: { label: "Previewing", color: "var(--color-primary-end)" },
  done: { label: "Done", color: "#22c55e" },
};

export default function StageIndicator({ stage }) {
  const config = stageConfig[stage] || stageConfig.idle;
  const isProcessing = stage !== "idle" && stage !== "done";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        className={styles.stageIndicator}
        style={{ "--stage-color": config.color }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
      >
        <div className={styles.iconWrapper}>
          {isProcessing ? (
            <FiLoader className={styles.iconSpinning} />
          ) : stage === "done" ? (
            <FiCheck className={styles.icon} />
          ) : null}
        </div>
        <span className={styles.label}>{config.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}
