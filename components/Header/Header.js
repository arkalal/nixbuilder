"use client";

import { motion } from "framer-motion";
import { HiMenu, HiX, HiMoon, HiSun, HiLogout } from "react-icons/hi";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "../ThemeProvider";
import styles from "./Header.module.scss";

export default function Header({ onAuthClick }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { data: session, status } = useSession();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

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
            <span className={styles.themeIcon} aria-hidden="true">
              <HiSun size={20} className={styles.sun} />
              <HiMoon size={20} className={styles.moon} />
            </span>
          </motion.button>

          {status === "authenticated" && session?.user ? (
            <div
              className={styles.profileWrapper}
              onMouseEnter={() => setDropdownOpen(true)}
              onMouseLeave={() => setDropdownOpen(false)}
            >
              <motion.div
                className={styles.avatar}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <img
                  src={session.user.image || "/default-avatar.png"}
                  alt={session.user.name || "User"}
                  className={styles.avatarImage}
                />
              </motion.div>

              {dropdownOpen && (
                <motion.div
                  className={styles.dropdown}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={styles.dropdownHeader}>
                    <img
                      src={session.user.image || "/default-avatar.png"}
                      alt={session.user.name || "User"}
                      className={styles.dropdownAvatar}
                    />
                    <div className={styles.dropdownInfo}>
                      <p className={styles.dropdownName}>{session.user.name}</p>
                      <p className={styles.dropdownEmail}>{session.user.email}</p>
                    </div>
                  </div>
                  <div className={styles.dropdownDivider} />
                  <button className={styles.logoutBtn} onClick={handleLogout}>
                    <HiLogout size={18} />
                    <span>Sign out</span>
                  </button>
                </motion.div>
              )}
            </div>
          ) : (
            <motion.button
              className={styles.authBtn}
              onClick={onAuthClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Get Started
            </motion.button>
          )}

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
