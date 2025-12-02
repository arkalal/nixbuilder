/**
 * Workbench Store - Chef-style persistent state using nanostores
 * Based on: https://github.com/get-convex/chef/blob/main/app/lib/stores/workbench.client.ts
 *
 * Chef's Action Status Flow:
 * - onActionOpen: Creates action with "pending" status
 * - onActionStream: Updates content, sets status to "running"
 * - onActionClose: Marks action as "complete"
 */

import { atom, map, computed } from "nanostores";
import { editorStore } from "./editor";

// Action status types (matching Chef)
// 'pending' | 'running' | 'complete' | 'aborted' | 'failed'

// Atoms for simple values
export const $showWorkbench = atom(false);
export const $currentView = atom("code"); // 'code' | 'preview' | 'logs'
export const $unsavedFiles = atom(new Set());

// Re-export editor store atoms for convenience
export const $selectedFile = editorStore.selectedFile;
export const $documents = editorStore.documents;
export const $currentDocument = editorStore.currentDocument;
export const $followingStreamedCode = editorStore.followingStreamedCode;

// Map store for actions - key is actionId, value is ActionState
// Actions are NEVER cleared during a session, only on new generation
export const $actions = map({});

// Current streaming file path (for tracking which file is streaming)
export const $currentStreamingFile = atom(null);

// Track which action IDs have been created (to prevent duplicates)
const createdActionIds = new Set();

// Action counter for unique IDs
let actionCounter = 0;

/**
 * CHEF PATTERN: onActionOpen - Called when a file action TAG OPENS
 * Creates action with "pending" status
 * @param {string} path - File path
 * @param {boolean} isEdit - Whether this is an edit
 */
export function onActionOpen(path, isEdit = false) {
  const actions = $actions.get();

  // Check if action for this path already exists
  const existingKey = Object.keys(actions).find(
    (key) => actions[key].path === path
  );

  if (existingKey) {
    // Action already exists, don't recreate
    return existingKey;
  }

  // Create new action with pending status
  const actionId = `action-${++actionCounter}-${Date.now()}`;
  createdActionIds.add(path);

  $actions.setKey(actionId, {
    id: actionId,
    path,
    content: "",
    isEdit,
    status: "pending",
    createdAt: Date.now(),
  });

  return actionId;
}

/**
 * CHEF PATTERN: onActionStream - Called while file content is streaming
 * Updates content and sets status to "running"
 * @param {string} path - File path
 * @param {string} content - Current content
 * @param {boolean} isEdit - Whether this is an edit
 */
export function onActionStream(path, content, isEdit = false) {
  const actions = $actions.get();

  // Find existing action
  const existingKey = Object.keys(actions).find(
    (key) => actions[key].path === path
  );

  if (existingKey) {
    const existingAction = actions[existingKey];

    // Don't downgrade from "complete" to "running"
    if (existingAction.status === "complete") {
      return existingKey;
    }

    // Update action with streaming content
    $actions.setKey(existingKey, {
      ...existingAction,
      content,
      status: "running",
    });
    return existingKey;
  }

  // If action doesn't exist, create it (handles case where onActionOpen wasn't called)

  const actionId = `action-${++actionCounter}-${Date.now()}`;
  createdActionIds.add(path);

  $actions.setKey(actionId, {
    id: actionId,
    path,
    content,
    isEdit,
    status: "running",
    createdAt: Date.now(),
  });

  return actionId;
}

/**
 * CHEF PATTERN: onActionClose - Called when file action TAG CLOSES
 * Marks action as "complete"
 * @param {string} path - File path
 * @param {string} content - Final content
 * @param {boolean} isEdit - Whether this is an edit
 */
export function onActionClose(path, content, isEdit = false) {
  const actions = $actions.get();

  // Find existing action
  const existingKey = Object.keys(actions).find(
    (key) => actions[key].path === path
  );

  if (existingKey) {
    // Update existing action to complete
    $actions.setKey(existingKey, {
      ...actions[existingKey],
      content,
      status: "complete",
    });
    return existingKey;
  }

  // If action doesn't exist, create it as complete
  const actionId = `action-${++actionCounter}-${Date.now()}`;
  createdActionIds.add(path);

  $actions.setKey(actionId, {
    id: actionId,
    path,
    content,
    isEdit,
    status: "complete",
    createdAt: Date.now(),
  });

  return actionId;
}

/**
 * Legacy addAction function for backward compatibility
 * Routes to appropriate Chef-style function based on status
 */
export function addAction({
  path,
  content,
  isEdit = false,
  status = "pending",
}) {
  if (status === "pending") {
    return onActionOpen(path, isEdit);
  } else if (status === "running") {
    return onActionStream(path, content, isEdit);
  } else if (status === "complete") {
    return onActionClose(path, content, isEdit);
  }

  // Fallback for other statuses
  return onActionStream(path, content, isEdit);
}

/**
 * Update an action's status
 * @param {string} actionId - Action ID
 * @param {Partial<ActionState>} updates - Updates to apply
 */
export function updateAction(actionId, updates) {
  const actions = $actions.get();
  const action = actions[actionId];

  if (!action) {
    console.warn(`[WorkbenchStore] Action ${actionId} not found`);
    return;
  }

  $actions.setKey(actionId, {
    ...action,
    ...updates,
  });
}

/**
 * Mark an action as complete by path
 * @param {string} path - File path to mark complete
 */
export function completeAction(path) {
  onActionClose(path, "", false);
}

/**
 * Set current streaming file
 * @param {Object|null} file - Current file being streamed
 */
export function setCurrentStreamingFile(file) {
  $currentStreamingFile.set(file);

  // Note: onActionStream is now called directly from page.js
  // This function just tracks the current streaming file
}

/**
 * Mark ALL actions as complete (called when generation finishes)
 */
export function markAllActionsComplete() {
  const actions = $actions.get();
  Object.keys(actions).forEach((key) => {
    if (actions[key].status !== "complete") {
      $actions.setKey(key, {
        ...actions[key],
        status: "complete",
      });
    }
  });
}

/**
 * Clear all actions (for new generation)
 */
export function clearActions() {
  $actions.set({});
  $currentStreamingFile.set(null);
  actionCounter = 0;
  createdActionIds.clear();
}

/**
 * Get all actions as an array (for rendering)
 * @returns {Array} Actions array sorted by creation time
 */
export function getActionsArray() {
  const actions = $actions.get();
  return Object.values(actions).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Check if all actions are complete
 * @returns {boolean}
 */
export function areAllActionsComplete() {
  const actions = $actions.get();
  const actionList = Object.values(actions);
  return (
    actionList.length > 0 && actionList.every((a) => a.status === "complete")
  );
}

/**
 * Toggle workbench visibility
 */
export function toggleWorkbench() {
  $showWorkbench.set(!$showWorkbench.get());
}

/**
 * Set selected file in editor
 * @param {string} path - File path
 */
export function setSelectedFile(path) {
  $selectedFile.set(path);
  $followingStreamedCode.set(false);
}

/**
 * Resume following streamed code
 */
export function resumeFollowingStreamedCode() {
  $followingStreamedCode.set(true);
}

/**
 * Stop following streamed code
 */
export function stopFollowingStreamedCode() {
  $followingStreamedCode.set(false);
}

/**
 * Sync files array with editor documents (Chef pattern)
 * @param {Array} files - Array of file objects { path, content }
 */
export function syncFilesWithEditor(files) {
  editorStore.setDocuments(files);
}

/**
 * Set streaming document in editor
 * @param {string} filePath
 * @param {string} content
 */
export function setStreamingDocument(filePath, content) {
  editorStore.setStreamingDocument(filePath, content);
}

/**
 * Update file in editor (from user edit)
 * @param {string} filePath
 * @param {string} content
 */
export function updateEditorFile(filePath, content) {
  editorStore.updateFile(filePath, content);

  // Mark as unsaved
  const unsaved = new Set($unsavedFiles.get());
  unsaved.add(filePath);
  $unsavedFiles.set(unsaved);
}

/**
 * Save file (remove from unsaved)
 * @param {string} filePath
 */
export function markFileSaved(filePath) {
  const unsaved = new Set($unsavedFiles.get());
  unsaved.delete(filePath);
  $unsavedFiles.set(unsaved);
}

/**
 * Clear editor state (for new generation)
 */
export function clearEditorState() {
  editorStore.clear();
  $unsavedFiles.set(new Set());
}
