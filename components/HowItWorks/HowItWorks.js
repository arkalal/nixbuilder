"use client";

import { motion } from "framer-motion";
import { HiDocumentText, HiCode, HiEye, HiPencil } from "react-icons/hi";
import { useInView } from "framer-motion";
import { useRef } from "react";
import styles from "./HowItWorks.module.scss";

const steps = [
  {
    icon: HiDocumentText,
    title: "Plan JSON",
    description: "AI generates a comprehensive project structure with routes, components, APIs, and dependencies.",
    color: "#4f46e5",
  },
  {
    icon: HiCode,
    title: "Codegen (VFS)",
    description: "Our AI writer creates every file using tool-calling, storing them in a virtual filesystem with GridFS.",
    color: "#7c3aed",
  },
  {
    icon: HiEye,
    title: "Live Preview",
    description: "Code is bundled and deployed to a Fly.io machine, giving you a live HTTPS preview in ~90 seconds.",
    color: "#06b6d4",
  },
  {
    icon: HiPencil,
    title: "Edit / Deploy",
    description: "Edit files in Monaco editor, regenerate with AI, or deploy to Vercel with one click. Your choice.",
    color: "#22d3ee",
  },
];

export default function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className={styles.section} ref={ref}>
      <div className={styles.container}>
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className={styles.title}>How it works</h2>
          <p className={styles.subtitle}>
            From prompt to production in four automated steps
          </p>
        </motion.div>

        <div className={styles.steps}>
          {steps.map((step, index) => (
            <motion.div
              key={index}
              className={styles.step}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
            >
              <div className={styles.stepNumber}>{index + 1}</div>
              <div className={styles.stepIcon} style={{ color: step.color }}>
                <step.icon size={32} />
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDescription}>{step.description}</p>
              
              {index < steps.length - 1 && (
                <div className={styles.stepConnector}></div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          className={styles.previewBadge}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <span className={styles.badgeIcon}>⚡</span>
          <span>Preview ready in ~90 seconds</span>
        </motion.div>
      </div>
    </section>
  );
}
