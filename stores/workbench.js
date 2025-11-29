/**
 * Workbench Store - Chef-style persistent state using nanostores
 * Based on: https://github.com/get-convex/chef/blob/main/app/lib/stores/workbench.client.ts
 * Actions persist across renders and stage changes
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

// Current streaming file
export const $currentStreamingFile = atom(null);

// Files store - Chef style FileMap
export const $files = map({});

// Action counter for unique IDs
let actionCounter = 0;

/**
 * Add a new action (file being created/edited)
 * @param {Object} params - Action parameters
 * @param {string} params.path - File path
 * @param {string} params.content - File content
 * @param {boolean} params.isEdit - Whether this is an edit (vs create)
 * @param {string} params.status - Action status
 */
export function addAction({
  path,
  content,
  isEdit = false,
  status = "pending",
}) {
  const actions = $actions.get();

  // Check if action for this path already exists
  const existingKey = Object.keys(actions).find(
    (key) => actions[key].path === path
  );

  if (existingKey) {
    const existingAction = actions[existingKey];
    // IMPORTANT: Don't downgrade "complete" status to "running"
    // This prevents timing issues where streaming updates overwrite completion
    const newStatus =
      existingAction.status === "complete" && status === "running"
        ? "complete"
        : status;

    // Update existing action
    $actions.setKey(existingKey, {
      ...existingAction,
      content,
      status: newStatus,
    });
    return existingKey;
  }

  // Create new action
  const actionId = `action-${++actionCounter}-${Date.now()}`;
  $actions.setKey(actionId, {
    id: actionId,
    path,
    content,
    isEdit,
    status,
    createdAt: Date.now(),
  });

  return actionId;
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
 * Mark an action as complete
 * @param {string} path - File path to mark complete
 */
export function completeAction(path) {
  const actions = $actions.get();
  const existingKey = Object.keys(actions).find(
    (key) => actions[key].path === path
  );

  if (existingKey) {
    $actions.setKey(existingKey, {
      ...actions[existingKey],
      status: "complete",
    });
  }
}

/**
 * Set current streaming file
 * @param {Object|null} file - Current file being streamed
 */
export function setCurrentStreamingFile(file) {
  $currentStreamingFile.set(file);

  if (file) {
    // Add/update action for streaming file
    addAction({
      path: file.path,
      content: file.content,
      isEdit: file.isEdit || false,
      status: "running",
    });
  }
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
