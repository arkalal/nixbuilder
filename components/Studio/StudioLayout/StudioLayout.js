"use client";

import { useState, useRef } from "react";
import styles from "./StudioLayout.module.scss";

export default function StudioLayout({ leftPanel, rightPanel }) {
  const [leftWidth, setLeftWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  const handleMouseMove = (e) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;

    // Constrain between 320px and 600px
    if (newWidth >= 320 && newWidth <= 600) {
      setLeftWidth(newWidth);
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.studioLayout}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className={styles.leftPanel} style={{ width: `${leftWidth}px` }}>
        {leftPanel}
      </div>

      <div
        className={`${styles.resizer} ${isResizing ? styles.active : ""}`}
        onMouseDown={handleMouseDown}
      >
        <div className={styles.resizerLine} />
      </div>

      <div className={styles.rightPanel}>{rightPanel}</div>
    </div>
  );
}
