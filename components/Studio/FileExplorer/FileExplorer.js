"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FiChevronRight,
  FiChevronDown,
  FiFolder,
  FiFile,
  FiPlus,
  FiFolderPlus,
  FiTrash2,
  FiEdit2,
} from "react-icons/fi";
import styles from "./FileExplorer.module.scss";

export default function FileExplorer({
  files,
  selectedFile,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
}) {
  const [expandedFolders, setExpandedFolders] = useState(
    new Set(["root", "app", "components"])
  );
  const [contextMenu, setContextMenu] = useState(null); // { x, y, type, path }
  const [isCreating, setIsCreating] = useState(null); // { type: 'file' | 'folder', parentPath: string }
  const [isRenaming, setIsRenaming] = useState(null); // { path: string, currentName: string }
  const [inputValue, setInputValue] = useState("");

  // Build file tree structure
  const fileTree = useMemo(() => {
    const tree = {};

    files.forEach((file) => {
      const parts = file.path.split("/");
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
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  // Handle right-click context menu
  const handleContextMenu = useCallback((e, type, path) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, path });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle new file creation
  const handleNewFile = useCallback(
    (parentPath = "") => {
      setIsCreating({ type: "file", parentPath });
      setInputValue("");
      closeContextMenu();
    },
    [closeContextMenu]
  );

  // Handle new folder creation
  const handleNewFolder = useCallback(
    (parentPath = "") => {
      setIsCreating({ type: "folder", parentPath });
      setInputValue("");
      closeContextMenu();
    },
    [closeContextMenu]
  );

  // Handle rename
  const handleRename = useCallback(
    (path) => {
      const name = path.split("/").pop();
      setIsRenaming({ path, currentName: name });
      setInputValue(name);
      closeContextMenu();
    },
    [closeContextMenu]
  );

  // Handle delete
  const handleDelete = useCallback(
    (path) => {
      if (onFileDelete && window.confirm(`Delete "${path}"?`)) {
        onFileDelete(path);
      }
      closeContextMenu();
    },
    [onFileDelete, closeContextMenu]
  );

  // Submit create
  const submitCreate = useCallback(() => {
    if (!isCreating || !inputValue.trim()) {
      setIsCreating(null);
      return;
    }
    const newPath = isCreating.parentPath
      ? `${isCreating.parentPath}/${inputValue.trim()}`
      : inputValue.trim();

    if (onFileCreate) {
      onFileCreate(newPath, isCreating.type === "folder");
    }
    setIsCreating(null);
    setInputValue("");
  }, [isCreating, inputValue, onFileCreate]);

  // Submit rename
  const submitRename = useCallback(() => {
    if (
      !isRenaming ||
      !inputValue.trim() ||
      inputValue === isRenaming.currentName
    ) {
      setIsRenaming(null);
      return;
    }
    const pathParts = isRenaming.path.split("/");
    pathParts.pop();
    const newPath =
      pathParts.length > 0
        ? `${pathParts.join("/")}/${inputValue.trim()}`
        : inputValue.trim();

    if (onFileRename) {
      onFileRename(isRenaming.path, newPath);
    }
    setIsRenaming(null);
    setInputValue("");
  }, [isRenaming, inputValue, onFileRename]);

  // Handle input key down
  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        if (isCreating) submitCreate();
        if (isRenaming) submitRename();
      } else if (e.key === "Escape") {
        setIsCreating(null);
        setIsRenaming(null);
      }
    },
    [isCreating, isRenaming, submitCreate, submitRename]
  );

  const getFileIcon = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    // Map extensions to style classes
    const iconClass = styles[`icon${ext}`] || styles.iconFile;
    return <FiFile className={iconClass} />;
  };

  const renderTree = (node, path = "", level = 0) => {
    const folders = Object.keys(node).filter(
      (k) => k !== "_files" && typeof node[k] === "object"
    );
    const nodeFiles = node._files || [];

    return (
      <>
        {/* Render folders */}
        {folders.map((folder) => {
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
        {nodeFiles.map((file) => (
          <div
            key={file.path}
            className={`${styles.fileRow} ${
              selectedFile === file.path ? styles.selected : ""
            }`}
            style={{ paddingLeft: `${level * 16 + 32}px` }}
            onClick={() => onFileSelect(file.path)}
          >
            {getFileIcon(file.path)}
            <span className={styles.fileName}>
              {file.path.split("/").pop()}
            </span>
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
        {onFileCreate && (
          <div className={styles.emptyActions}>
            <button
              className={styles.emptyBtn}
              onClick={() => handleNewFile("")}
            >
              <FiPlus /> New File
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.fileExplorer} onClick={closeContextMenu}>
      <div className={styles.header}>
        <FiFolder />
        <span>Explorer</span>
        {onFileCreate && (
          <div className={styles.headerActions}>
            <button
              className={styles.headerBtn}
              onClick={() => handleNewFile("")}
              title="New File"
            >
              <FiPlus />
            </button>
            <button
              className={styles.headerBtn}
              onClick={() => handleNewFolder("")}
              title="New Folder"
            >
              <FiFolderPlus />
            </button>
          </div>
        )}
      </div>
      <div className={styles.tree}>
        {/* New file/folder input at root level */}
        {isCreating && !isCreating.parentPath && (
          <div className={styles.createInput}>
            {isCreating.type === "folder" ? (
              <FiFolder className={styles.folderIcon} />
            ) : (
              <FiFile />
            )}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={submitCreate}
              placeholder={
                isCreating.type === "folder" ? "folder name" : "filename.jsx"
              }
              autoFocus
            />
          </div>
        )}
        {renderTree(fileTree)}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "folder" && (
            <>
              <button onClick={() => handleNewFile(contextMenu.path)}>
                <FiPlus /> New File
              </button>
              <button onClick={() => handleNewFolder(contextMenu.path)}>
                <FiFolderPlus /> New Folder
              </button>
              <div className={styles.menuDivider} />
            </>
          )}
          <button onClick={() => handleRename(contextMenu.path)}>
            <FiEdit2 /> Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.path)}
            className={styles.deleteBtn}
          >
            <FiTrash2 /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
