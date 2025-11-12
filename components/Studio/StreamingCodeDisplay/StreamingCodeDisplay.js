"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styles from "./StreamingCodeDisplay.module.scss";

export default function StreamingCodeDisplay({ streamingCode, currentFile }) {
  if (!streamingCode && !currentFile) {
    return null;
  }

  // Get file type badge color
  const getFileTypeBadge = (type) => {
    switch (type) {
      case 'css':
        return { label: 'CSS', className: styles.badgeCss };
      case 'javascript':
        return { label: 'JSX', className: styles.badgeJs };
      case 'json':
        return { label: 'JSON', className: styles.badgeJson };
      default:
        return { label: 'FILE', className: styles.badgeDefault };
    }
  };

  return (
    <div className={styles.streamingCodeDisplay}>
      {/* Current File Being Generated */}
      {currentFile && (
        <div className={styles.fileBlock}>
          <div className={styles.fileHeader}>
            <div className={styles.fileInfo}>
              <div className={styles.spinner} />
              <span className={styles.fileName}>{currentFile.path}</span>
              {(() => {
                const badge = getFileTypeBadge(currentFile.type);
                return <span className={`${styles.fileBadge} ${badge.className}`}>{badge.label}</span>;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* AI Response Stream */}
      {streamingCode && (
        <div className={styles.streamBlock}>
          <div className={styles.streamHeader}>
            <span className={styles.streamLabel}>● AI Response Stream</span>
          </div>
          <div className={styles.codeContainer}>
            <SyntaxHighlighter
              language="jsx"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: '1rem',
                fontSize: '0.875rem',
                background: 'transparent',
                maxHeight: '300px',
                overflow: 'auto',
              }}
              showLineNumbers={true}
            >
              {streamingCode}
            </SyntaxHighlighter>
            <span className={styles.cursor} />
          </div>
        </div>
      )}
    </div>
  );
}
