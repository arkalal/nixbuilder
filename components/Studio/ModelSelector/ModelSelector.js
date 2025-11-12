"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiChevronDown, FiCheck } from "react-icons/fi";
import styles from "./ModelSelector.module.scss";

const models = [
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", speed: "Fast" },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", speed: "Medium" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", speed: "Slow" },
  { id: "openai/gpt-5", name: "GPT-5", speed: "Fast" },
];

export default function ModelSelector({ selectedModel, onModelChange }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentModel = models.find((m) => m.id === selectedModel) || models[0];

  return (
    <div className={styles.modelSelector}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select AI model"
      >
        <span className={styles.modelName}>{currentModel.name}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <FiChevronDown className={styles.icon} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className={styles.backdrop}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              className={styles.dropdown}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {models.map((model) => (
                <button
                  key={model.id}
                  className={`${styles.option} ${
                    currentModel.id === model.id ? styles.active : ""
                  }`}
                  onClick={() => {
                    onModelChange(model.id);
                    setIsOpen(false);
                  }}
                >
                  <div className={styles.optionContent}>
                    <span className={styles.optionName}>{model.name}</span>
                    <span className={styles.optionSpeed}>{model.speed}</span>
                  </div>
                  {currentModel.id === model.id && (
                    <FiCheck className={styles.checkIcon} />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
