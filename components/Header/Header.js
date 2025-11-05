"use client";

import { motion } from "framer-motion";
import { HiMenu, HiX, HiMoon, HiSun } from "react-icons/hi";
import { useState } from "react";
import { useTheme } from "../ThemeProvider";
import styles from "./Header.module.scss";

export default function Header({ onAuthClick }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.header
      className={styles.header}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className={styles.container}>
        <div className={styles.logo}>
          <span className={styles.logoText}>nixbuilder</span>
          <span className={styles.logoDot}>.</span>
        </div>

        <nav className={`${styles.nav} ${mobileMenuOpen ? styles.navOpen : ""}`}>
          <a href="#how-it-works" className={styles.navLink}>
            How it works
          </a>
          <a href="#features" className={styles.navLink}>
            Features
          </a>
          <a href="#faq" className={styles.navLink}>
            FAQ
          </a>
          <a
            href="https://github.com/nixbuilder"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.navLink}
          >
            GitHub
          </a>
        </nav>

        <div className={styles.actions}>
          <motion.button
            className={styles.themeToggle}
            onClick={toggleTheme}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <HiSun size={20} /> : <HiMoon size={20} />}
          </motion.button>

          <motion.button
            className={styles.authBtn}
            onClick={onAuthClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Get Started
          </motion.button>

          <button
            className={styles.mobileMenuBtn}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <HiX size={24} /> : <HiMenu size={24} />}
          </button>
        </div>
      </div>
    </motion.header>
  );
}
