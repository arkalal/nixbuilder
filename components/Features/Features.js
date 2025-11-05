"use client";

import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { 
  HiServer, 
  HiLightningBolt, 
  HiDatabase, 
  HiCloud, 
  HiShieldCheck,
  HiCurrencyDollar 
} from "react-icons/hi";
import styles from "./Features.module.scss";

const features = [
  {
    icon: HiServer,
    title: "Full-stack Next.js v16",
    description: "App Router, server components, and modern React patterns out of the box.",
  },
  {
    icon: HiLightningBolt,
    title: "OpenRouter streaming",
    description: "Real-time AI responses with Vercel AI SDK for structured outputs and tool-calling.",
  },
  {
    icon: HiDatabase,
    title: "MongoDB + GridFS",
    description: "Official Node driver with GridFS for generated file storage and versioning.",
  },
  {
    icon: HiCloud,
    title: "Fly.io ephemeral previews",
    description: "Spin up micro-VMs with full Node runtime for instant live previews.",
  },
  {
    icon: HiShieldCheck,
    title: "NextAuth ready",
    description: "Google OAuth, credentials, and session management pre-configured.",
  },
  {
    icon: HiCurrencyDollar,
    title: "Dodo Payments integration",
    description: "Built-in credit system and subscription management for monetization.",
  },
];

export default function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" className={styles.section} ref={ref}>
      <div className={styles.container}>
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className={styles.title}>Everything you need</h2>
          <p className={styles.subtitle}>
            Production-ready stack with modern tools and best practices
          </p>
        </motion.div>

        <div className={styles.grid}>
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className={styles.feature}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className={styles.iconWrapper}>
                <feature.icon className={styles.icon} size={28} />
              </div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          className={styles.trustNote}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <span>No lock-in. Export or deploy to Vercel anytime.</span>
        </motion.div>
      </div>
    </section>
  );
}
