"use client";

import { HiHeart } from "react-icons/hi";
import { FaGithub, FaTwitter } from "react-icons/fa";
import styles from "./Footer.module.scss";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.brand}>
            <div className={styles.logo}>
              <span className={styles.logoText}>nixbuilder</span>
              <span className={styles.logoDot}>.</span>
            </div>
            <p className={styles.tagline}>
              Build full-stack Next.js apps with AI
            </p>
          </div>

          <div className={styles.links}>
            <div className={styles.linkGroup}>
              <h4 className={styles.linkTitle}>Product</h4>
              <a href="#how-it-works" className={styles.link}>How it works</a>
              <a href="#features" className={styles.link}>Features</a>
              <a href="#pricing" className={styles.link}>Pricing</a>
              <a href="/changelog" className={styles.link}>Changelog</a>
            </div>

            <div className={styles.linkGroup}>
              <h4 className={styles.linkTitle}>Resources</h4>
              <a href="/docs" className={styles.link}>Documentation</a>
              <a href="/examples" className={styles.link}>Examples</a>
              <a href="/blog" className={styles.link}>Blog</a>
              <a href="#faq" className={styles.link}>FAQ</a>
            </div>

            <div className={styles.linkGroup}>
              <h4 className={styles.linkTitle}>Legal</h4>
              <a href="/privacy" className={styles.link}>Privacy</a>
              <a href="/terms" className={styles.link}>Terms</a>
              <a href="/security" className={styles.link}>Security</a>
            </div>

            <div className={styles.linkGroup}>
              <h4 className={styles.linkTitle}>Connect</h4>
              <a 
                href="https://github.com/nixbuilder" 
                target="_blank" 
                rel="noopener noreferrer"
                className={styles.link}
              >
                <FaGithub className={styles.socialIcon} />
                GitHub
              </a>
              <a 
                href="https://twitter.com/nixbuilder" 
                target="_blank" 
                rel="noopener noreferrer"
                className={styles.link}
              >
                <FaTwitter className={styles.socialIcon} />
                Twitter
              </a>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} nixbuilder.dev. All rights reserved.
          </p>
          <p className={styles.madeWith}>
            Made with <HiHeart className={styles.heart} /> using nixbuilder
          </p>
        </div>
      </div>
    </footer>
  );
}
