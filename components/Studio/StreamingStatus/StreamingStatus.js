"use client";

import { memo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiLoader, FiCheck, FiAlertTriangle } from "react-icons/fi";
import styles from "./StreamingStatus.module.scss";

/**
 * StreamingIndicator - Chef style status bar
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/chat/StreamingIndicator.tsx
 */

const STATUS_MESSAGES = {
  cooking: "Cooking...",
  stopped: "Generation stopped",
  error: "The model hit an error. Try sending your message again.",
  generated: "Response Generated",
};

// Fun cooking messages from Chef
const COOKING_SPLINES_MESSAGES = [
  "Simmering stock...",
  "Practicing mise-en-place...",
  "Adjusting seasoning...",
  "Adding a pinch of salt...",
  "Reducing sauce...",
  "Whisking vigorously...",
  "Deglazing pan...",
  "Letting the flavors mingle...",
  "Browning butter...",
  "Preheating oven...",
  "Caramelizing onions...",
  "Chiffonading herbs...",
  "Massaging kale...",
  "Adding a splash of flavor...",
  "Julienning carrots...",
];

const COOKING_SPLINES_PROBABILITY = 0.2;
const COOKING_SPLINES_DURATION = 4000;

const StreamingStatus = memo(function StreamingStatus({
  stage,
  hasError = false,
  messageCount = 0,
  aborted = false,
}) {
  const [cookingMessage, setCookingMessage] = useState(null);

  const isStreaming = stage === "generating" || stage === "planning";
  const isSubmitted = stage === "submitted";
  const isReady = stage === "done" || stage === "idle";
  const isError = hasError || stage === "error";

  // Rotate through cooking messages during generation (Chef style)
  useEffect(() => {
    let timer = null;

    if (isStreaming || isSubmitted) {
      timer = setInterval(() => {
        let newMessage = null;
        if (Math.random() < COOKING_SPLINES_PROBABILITY) {
          const randomIndex = Math.floor(
            Math.random() * COOKING_SPLINES_MESSAGES.length
          );
          newMessage = COOKING_SPLINES_MESSAGES[randomIndex];
        }
        setCookingMessage(newMessage);
      }, COOKING_SPLINES_DURATION);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
      setCookingMessage(null);
    };
  }, [isStreaming, isSubmitted]);

  // Don't show for idle state with no messages
  if (isReady && messageCount === 0) {
    return null;
  }

  // Determine icon and message
  let icon;
  let message;

  if (aborted) {
    icon = <FiAlertTriangle className={styles.iconWarning} />;
    message = STATUS_MESSAGES.stopped;
  } else if (isStreaming || isSubmitted) {
    icon = <FiLoader className={styles.iconSpinning} />;
    message = cookingMessage || STATUS_MESSAGES.cooking;
  } else if (isError) {
    icon = <FiAlertTriangle className={styles.iconWarning} />;
    message = STATUS_MESSAGES.error;
  } else if (isReady && messageCount > 0) {
    icon = <FiCheck className={styles.iconSuccess} />;
    message = STATUS_MESSAGES.generated;
  } else {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className={styles.streamingStatus}
        initial={{ translateY: "100%" }}
        animate={{ translateY: "0%" }}
        exit={{ translateY: "100%" }}
        transition={{ duration: 0.15 }}
      >
        <div className={styles.content}>
          <div className={styles.icon}>{icon}</div>
          <span className={styles.message}>{message}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

export default StreamingStatus;
