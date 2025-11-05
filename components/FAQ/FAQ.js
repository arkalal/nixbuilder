"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef, useState } from "react";
import { HiChevronDown } from "react-icons/hi";
import styles from "./FAQ.module.scss";

const faqs = [
  {
    question: "Is my code and data secure?",
    answer: "Yes. All generated files are stored in MongoDB with GridFS encryption. Preview environments run in isolated Fly.io machines that auto-delete after 10 minutes of inactivity. We never train on your code.",
  },
  {
    question: "What AI models do you use?",
    answer: "We use OpenRouter APIs with separate Planner and Writer models. You can configure which models to use (e.g., GPT-4, Claude, etc.) based on your needs and budget.",
  },
  {
    question: "Can I export my project?",
    answer: "Absolutely. Download your entire project as a ZIP file or deploy directly to Vercel with one click. No lock-in, ever.",
  },
  {
    question: "What are the build limits?",
    answer: "Free tier includes 5 builds per month. Pro plans offer unlimited builds, faster previews, and priority AI models. Check pricing for details.",
  },
  {
    question: "How long do preview environments last?",
    answer: "Preview environments auto-shutdown after 10 minutes of inactivity to save costs. You can restart them anytime or deploy permanently to Vercel.",
  },
  {
    question: "Do you support databases other than MongoDB?",
    answer: "Currently we ship with MongoDB by default, but the generated code can be modified to use PostgreSQL, MySQL, or any database you prefer. Full flexibility.",
  },
  {
    question: "Can I customize the generated code?",
    answer: "Yes! Use the built-in Monaco editor to edit any file, or ask the AI to regenerate specific files with new requirements. You have full control.",
  },
  {
    question: "What authentication providers are supported?",
    answer: "We include NextAuth.js pre-configured with Google OAuth and Credentials providers. You can easily add more providers like GitHub, Discord, or magic links.",
  },
];

export default function FAQ() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className={styles.section} ref={ref}>
      <div className={styles.container}>
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className={styles.title}>Frequently asked questions</h2>
          <p className={styles.subtitle}>
            Everything you need to know about nixbuilder
          </p>
        </motion.div>

        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              className={styles.faqItem}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <button
                className={styles.faqQuestion}
                onClick={() => toggleFAQ(index)}
                aria-expanded={openIndex === index}
              >
                <span>{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <HiChevronDown className={styles.chevron} />
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    className={styles.faqAnswer}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <p>{faq.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
