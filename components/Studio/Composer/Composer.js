"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FiSend, FiLoader } from "react-icons/fi";
import StageIndicator from "../StageIndicator/StageIndicator";
import MessageTimeline from "../MessageTimeline/MessageTimeline";
import ModelSelector from "../ModelSelector/ModelSelector";
import styles from "./Composer.module.scss";

export default function Composer({ messages, stage, onSendMessage, selectedModel, onModelChange, streamingCode, currentFile }) {
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef(null);

  const isProcessing = stage !== "idle" && stage !== "done";

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    onSendMessage(inputValue.trim());
    setInputValue("");
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e) => {
    setInputValue(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>nixbuilder</h2>
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
          />
        </div>
        <StageIndicator stage={stage} />
      </div>

      <div className={styles.timeline}>
        <MessageTimeline 
          messages={messages}
          streamingCode={streamingCode}
          currentFile={currentFile}
        />
      </div>

      <div className={styles.inputContainer}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputWrapper}>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                messages.length === 0
                  ? "Describe the app you want to build..."
                  : "Iterate, fix bugs, or add new features..."
              }
              className={styles.textarea}
              disabled={isProcessing}
              rows={1}
            />
            <motion.button
              type="submit"
              className={styles.sendButton}
              disabled={!inputValue.trim() || isProcessing}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isProcessing ? (
                <FiLoader className={styles.iconSpinning} />
              ) : (
                <FiSend className={styles.icon} />
              )}
            </motion.button>
          </div>
        </form>
        
        <div className={styles.hint}>
          <kbd>Enter</kbd> to send • <kbd>Shift + Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
