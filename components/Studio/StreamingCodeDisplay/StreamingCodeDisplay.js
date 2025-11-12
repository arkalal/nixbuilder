"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { FiCheck } from "react-icons/fi";
import styles from "./StreamingCodeDisplay.module.scss";

export default function StreamingCodeDisplay({ streamingCode, currentFile, completedFiles = [] }) {
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

  const getFileType = (path) => {
    const ext = path.split('.').pop();
    if (ext === 'js' || ext === 'jsx') return 'javascript';
    if (ext === 'css' || ext === 'scss') return 'css';
    if (ext === 'json') return 'json';
    return 'text';
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

      {/* Completed Files (persisted, not cleared) */}
      {completedFiles.map((file, idx) => (
        <div key={idx} className={styles.completedFileBlock}>
          <div className={styles.completedHeader}>
            <div className={styles.fileInfo}>
              <FiCheck className={styles.checkIcon} />
              <span className={styles.fileName}>{file.path}</span>
              {(() => {
                const badge = getFileTypeBadge(getFileType(file.path));
                return <span className={`${styles.fileBadge} ${badge.className}`}>{badge.label}</span>;
              })()}
            </div>
          </div>
          <div className={styles.codePreview}>
            <SyntaxHighlighter
              language={getFileType(file.path) === 'javascript' ? 'jsx' : getFileType(file.path)}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: '0.75rem',
                fontSize: '0.75rem',
                background: 'transparent',
                maxHeight: '150px',
              }}
              showLineNumbers={true}
              wrapLongLines={true}
            >
              {file.content.substring(0, 500)}
            </SyntaxHighlighter>
          </div>
        </div>
      ))}

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
