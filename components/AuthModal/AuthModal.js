"use client";

import { motion, AnimatePresence } from "framer-motion";
import { HiX } from "react-icons/hi";
import { FaGoogle } from "react-icons/fa";
import { useState } from "react";
import { signIn } from "next-auth/react";
import styles from "./AuthModal.module.scss";

export default function AuthModal({ isOpen, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = () => {
    setLoading(true);
    // Trigger NextAuth Google sign-in
    signIn("google", { callbackUrl: "/" }).catch(() => setLoading(false));
  };

  const handleEmailAuth = (e) => {
    e.preventDefault();
    setLoading(true);
    // This will be connected to NextAuth later
    console.log("Email auth:", { email, password, isSignUp });
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          <div className={styles.modalWrapper}>
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
            <button className={styles.closeBtn} onClick={onClose}>
              <HiX size={24} />
            </button>

            <div className={styles.content}>
              <div className={styles.header}>
                <h2 className={styles.title}>
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h2>
                <p className={styles.subtitle}>
                  {isSignUp 
                    ? "Start building your app in minutes" 
                    : "Sign in to continue building"}
                </p>
              </div>

              <motion.button
                className={styles.googleBtn}
                onClick={handleGoogleAuth}
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <FaGoogle className={styles.googleIcon} />
                {loading ? "Connecting..." : `Continue with Google`}
              </motion.button>

              <div className={styles.divider}>
                <span>or</span>
              </div>

              <form className={styles.form} onSubmit={handleEmailAuth}>
                <div className={styles.inputGroup}>
                  <label htmlFor="email" className={styles.label}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className={styles.input}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="password" className={styles.label}>
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    className={styles.input}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {!isSignUp && (
                  <a href="/forgot-password" className={styles.forgotLink}>
                    Forgot password?
                  </a>
                )}

                <motion.button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={loading}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {loading 
                    ? "Please wait..." 
                    : isSignUp 
                      ? "Create account" 
                      : "Sign in"}
                </motion.button>
              </form>

              <div className={styles.footer}>
                <p className={styles.toggleText}>
                  {isSignUp ? "Already have an account?" : "Don't have an account?"}
                  {" "}
                  <button 
                    onClick={() => setIsSignUp(!isSignUp)}
                    className={styles.toggleBtn}
                  >
                    {isSignUp ? "Sign in" : "Sign up"}
                  </button>
                </p>

                <p className={styles.terms}>
                  By continuing, you agree to our{" "}
                  <a href="/terms">Terms of Service</a> and{" "}
                  <a href="/privacy">Privacy Policy</a>
                </p>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
