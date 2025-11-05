"use client";

import { motion } from "framer-motion";
import { HiPlay, HiArrowRight, HiCode, HiLightningBolt } from "react-icons/hi";
import { useState, useEffect } from "react";
import styles from "./Hero.module.scss";

export default function Hero({ onAuthClick, onDemoClick }) {
  const [typedText, setTypedText] = useState("");
  const fullText = '"Build a SaaS with auth, pricing, and MongoDB"';
  
  useEffect(() => {
    if (typedText.length < fullText.length) {
      const timeout = setTimeout(() => {
        setTypedText(fullText.slice(0, typedText.length + 1));
      }, 80);
      return () => clearTimeout(timeout);
    }
  }, [typedText]);

  return (
    <section className={styles.hero}>
      <div className={styles.background}>
        <div className={styles.gradientOrb}></div>
        <div className={styles.gradientOrb2}></div>
      </div>

      <div className={styles.container}>
        <motion.div
          className={styles.content}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <motion.div
            className={styles.badge}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <HiLightningBolt className={styles.badgeIcon} />
            <span>Powered by OpenRouter AI</span>
          </motion.div>

          <h1 className={styles.title}>
            Describe your app.
            <br />
            <span className={styles.gradient}>Get a live Next.js build</span>
            <br />
            in minutes.
          </h1>

          <p className={styles.subtitle}>
            We plan, code, and preview your full-stack app in real time.
            <br />
            Auth, MongoDB, APIs—all included. Deploy anywhere.
          </p>

          <div className={styles.terminal}>
            <div className={styles.terminalHeader}>
              <div className={styles.terminalDots}>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className={styles.terminalTitle}>nixbuilder.dev</span>
            </div>
            <div className={styles.terminalBody}>
              <div className={styles.terminalPrompt}>
                <HiCode className={styles.promptIcon} />
                <span className={styles.promptText}>{typedText}</span>
                <span className={styles.cursor}>|</span>
              </div>
              
              {typedText.length === fullText.length && (
                <motion.div
                  className={styles.buildLog}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  <div className={styles.logLine}>
                    <span className={styles.logStatus}>✓</span>
                    <span>Plan generated</span>
                    <span className={styles.logTime}>0.8s</span>
                  </div>
                  <div className={styles.logLine}>
                    <span className={styles.logStatus}>✓</span>
                    <span>Files created (24)</span>
                    <span className={styles.logTime}>2.1s</span>
                  </div>
                  <div className={styles.logLine}>
                    <span className={styles.logStatus}>⚡</span>
                    <span>Preview building...</span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <motion.div
            className={styles.cta}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <motion.button
              className={styles.primaryBtn}
              onClick={onAuthClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Start building free
              <HiArrowRight className={styles.btnIcon} />
            </motion.button>

            <motion.button
              className={styles.secondaryBtn}
              onClick={onDemoClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <HiPlay className={styles.btnIcon} />
              See demo
            </motion.button>
          </motion.div>

          <motion.div
            className={styles.socialProof}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            <span className={styles.proofText}>
              Builders shipped <strong>1,000+</strong> previews
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
