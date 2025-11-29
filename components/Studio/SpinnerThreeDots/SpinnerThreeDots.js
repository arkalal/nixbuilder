"use client";

import { memo } from "react";
import styles from "./SpinnerThreeDots.module.scss";

/**
 * SpinnerThreeDots - Chef-style three dots loading indicator
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/ui/SpinnerThreeDots.tsx
 */
const SpinnerThreeDots = memo(function SpinnerThreeDots({ className = "" }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        className={styles.dot1}
        cx="4"
        cy="12"
        r="3"
        fill="currentColor"
      />
      <circle
        className={styles.dot2}
        cx="12"
        cy="12"
        r="3"
        fill="currentColor"
      />
      <circle
        className={styles.dot3}
        cx="20"
        cy="12"
        r="3"
        fill="currentColor"
      />
    </svg>
  );
});

export default SpinnerThreeDots;
