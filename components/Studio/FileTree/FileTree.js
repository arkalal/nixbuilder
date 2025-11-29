"use client";

/**
 * FileTree Component - Chef-style file tree
 * Based on: https://github.com/get-convex/chef/blob/main/app/components/workbench/FileTree.tsx
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  FiChevronRight,
  FiChevronDown,
  FiFolder,
  FiFile,
} from "react-icons/fi";
import styles from "./FileTree.module.scss";

const NODE_PADDING_LEFT = 12;
const DEFAULT_HIDDEN_FILES = [/\/node_modules\//, /\/\.next/, /\/\.git/];
const DEFAULT_COLLAPSED_FOLDERS = new Set(["node_modules", ".next", ".git"]);

/**
 * Build a flat list of files/folders from the files array
 */
function buildFileList(files, hiddenFiles = []) {
  const list = [];
  const seenFolders = new Set();

  // Sort files by path
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split("/");
    let currentPath = "";

    // Add folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

      // Check if hidden
      const isHidden = hiddenFiles.some((pattern) =>
        pattern instanceof RegExp
          ? pattern.test(`/${currentPath}/`)
          : currentPath.includes(pattern)
      );

      if (!seenFolders.has(currentPath) && !isHidden) {
        seenFolders.add(currentPath);
        list.push({
          id: `folder-${currentPath}`,
          kind: "folder",
          name: parts[i],
          fullPath: currentPath,
          depth: i,
        });
      }
    }

    // Add file node
    const fileName = parts[parts.length - 1];
    const isHidden = hiddenFiles.some((pattern) =>
      pattern instanceof RegExp
        ? pattern.test(`/${file.path}`)
        : file.path.includes(pattern)
    );

    if (!isHidden) {
      list.push({
        id: `file-${file.path}`,
        kind: "file",
        name: fileName,
        fullPath: file.path,
        depth: parts.length - 1,
        file,
      });
    }
  }

  return list;
}

const FileTree = memo(function FileTree({
  files = [],
  selectedFile,
  onFileSelect,
  hiddenFiles = DEFAULT_HIDDEN_FILES,
  unsavedFiles = new Set(),
  currentStreamingFile,
  className = "",
}) {
  const fileList = useMemo(() => {
    return buildFileList(files, hiddenFiles);
  }, [files, hiddenFiles]);

  const [collapsedFolders, setCollapsedFolders] = useState(() => {
    const initialCollapsed = new Set();
    fileList.forEach((item) => {
      if (item.kind === "folder" && DEFAULT_COLLAPSED_FOLDERS.has(item.name)) {
        initialCollapsed.add(item.fullPath);
      }
    });
    return initialCollapsed;
  });

  // Filter out items in collapsed folders
  const filteredFileList = useMemo(() => {
    const list = [];
    let lastDepth = Number.MAX_SAFE_INTEGER;

    for (const item of fileList) {
      const depth = item.depth;

      // Reset if we're back at same level
      if (lastDepth === depth) {
        lastDepth = Number.MAX_SAFE_INTEGER;
      }

      // Check if this folder is collapsed
      if (item.kind === "folder" && collapsedFolders.has(item.fullPath)) {
        lastDepth = Math.min(lastDepth, depth);
      }

      // Skip items below collapsed folder
      if (lastDepth < depth) {
        continue;
      }

      list.push(item);
    }

    return list;
  }, [fileList, collapsedFolders]);

  const toggleFolder = useCallback((fullPath) => {
    setCollapsedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fullPath)) {
        newSet.delete(fullPath);
      } else {
        newSet.add(fullPath);
      }
      return newSet;
    });
  }, []);

  const handleFileClick = useCallback(
    (filePath) => {
      if (onFileSelect) {
        onFileSelect(filePath);
      }
    },
    [onFileSelect]
  );

  if (files.length === 0) {
    return (
      <div className={`${styles.fileTree} ${className}`}>
        <div className={styles.empty}>
          <FiFolder className={styles.emptyIcon} />
          <p className={styles.emptyText}>No files yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.fileTree} ${className}`}>
      {filteredFileList.map((item) => {
        const isSelected = selectedFile === item.fullPath;
        const isStreaming = currentStreamingFile === item.fullPath;
        const isUnsaved = unsavedFiles.has(item.fullPath);
        const isCollapsed = collapsedFolders.has(item.fullPath);

        if (item.kind === "folder") {
          return (
            <button
              key={item.id}
              className={styles.folderItem}
              style={{ paddingLeft: `${item.depth * NODE_PADDING_LEFT + 8}px` }}
              onClick={() => toggleFolder(item.fullPath)}
            >
              {isCollapsed ? (
                <FiChevronRight className={styles.chevron} />
              ) : (
                <FiChevronDown className={styles.chevron} />
              )}
              <FiFolder className={styles.folderIcon} />
              <span className={styles.name}>{item.name}</span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            className={`${styles.fileItem} ${
              isSelected ? styles.selected : ""
            } ${isStreaming ? styles.streaming : ""}`}
            style={{ paddingLeft: `${item.depth * NODE_PADDING_LEFT + 8}px` }}
            onClick={() => handleFileClick(item.fullPath)}
          >
            <FiFile className={styles.fileIcon} />
            <span className={styles.name}>{item.name}</span>
            {isUnsaved && <span className={styles.unsavedDot} />}
            {isStreaming && <span className={styles.streamingDot} />}
          </button>
        );
      })}
    </div>
  );
});

export default FileTree;
