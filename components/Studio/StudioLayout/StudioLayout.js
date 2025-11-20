"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./StudioLayout.module.scss";

export default function StudioLayout({ leftPanel, rightPanel }) {
  const [leftWidth, setLeftWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isResizing || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      if (newWidth >= 320 && newWidth <= 600) setLeftWidth(newWidth);
    };
    const onUp = () => setIsResizing(false);
    if (isResizing) {
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  return (
    <div
      ref={containerRef}
      className={`${styles.studioLayout} ${isResizing ? styles.resizing : ""}`}
    >
      {isResizing && <div className={styles.resizeOverlay} />}
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
