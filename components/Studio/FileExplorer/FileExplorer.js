"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  FiChevronRight, 
  FiChevronDown, 
  FiFolder, 
  FiFile
} from "react-icons/fi";
import styles from "./FileExplorer.module.scss";

export default function FileExplorer({ files, selectedFile, onFileSelect }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['root', 'app', 'components']));

  // Build file tree structure
  const fileTree = useMemo(() => {
    const tree = {};
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // This is a file
          if (!current._files) current._files = [];
          current._files.push(file);
        } else {
          // This is a folder
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });
    
    return tree;
  }, [files]);

  const toggleFolder = (folderPath) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop();
    return <FiFile className={styles[`icon${ext}`] || styles.iconFile} />;
  };

  const renderTree = (node, path = '', level = 0) => {
    const folders = Object.keys(node).filter(k => k !== '_files' && typeof node[k] === 'object');
    const nodeFiles = node._files || [];

    return (
      <>
        {/* Render folders */}
        {folders.map(folder => {
          const folderPath = path ? `${path}/${folder}` : folder;
          const isExpanded = expandedFolders.has(folderPath);
          
          return (
            <div key={folderPath}>
              <div
                className={styles.folderRow}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => toggleFolder(folderPath)}
              >
                {isExpanded ? (
                  <FiChevronDown className={styles.chevron} />
                ) : (
                  <FiChevronRight className={styles.chevron} />
                )}
                <FiFolder className={styles.folderIcon} />
                <span className={styles.folderName}>{folder}</span>
              </div>
              
              {isExpanded && renderTree(node[folder], folderPath, level + 1)}
            </div>
          );
        })}

        {/* Render files */}
        {nodeFiles.map(file => (
          <div
            key={file.path}
            className={`${styles.fileRow} ${selectedFile === file.path ? styles.selected : ''}`}
            style={{ paddingLeft: `${level * 16 + 32}px` }}
            onClick={() => onFileSelect(file.path)}
          >
            {getFileIcon(file.path)}
            <span className={styles.fileName}>{file.path.split('/').pop()}</span>
          </div>
        ))}
      </>
    );
  };

  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <FiFolder className={styles.emptyIcon} />
        <p className={styles.emptyText}>No files yet</p>
      </div>
    );
  }

  return (
    <div className={styles.fileExplorer}>
      <div className={styles.header}>
        <FiFolder />
        <span>Explorer</span>
      </div>
      <div className={styles.tree}>
        {renderTree(fileTree)}
      </div>
    </div>
  );
}
