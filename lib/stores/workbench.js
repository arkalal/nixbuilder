/**
 * Workbench Store - Chef Architecture
 * Manages files, artifacts, and actions using nanostores pattern
 */

import { atom, map } from "nanostores";

// File storage
export const filesStore = atom({});

// Current document being viewed
export const currentDocumentStore = atom(null);

// Artifacts (groups of actions)
export const artifactsStore = map({});

// Actions (individual file operations)
export const actionsStore = map({});

// Tool calls waiting for results
const toolCallPromises = new Map();

// Streaming state
export const streamingFileStore = atom(null);

// Show workbench panel
export const showWorkbenchStore = atom(false);

/**
 * Add or update a file
 */
export function setFile(path, content) {
  const files = filesStore.get();
  filesStore.set({
    ...files,
    [path]: {
      content,
      updatedAt: Date.now(),
    },
  });
}

/**
 * Get a file's content
 */
export function getFile(path) {
  const files = filesStore.get();
  return files[path]?.content || null;
}

/**
 * Get all files
 */
export function getAllFiles() {
  const files = filesStore.get();
  const result = {};
  for (const [path, data] of Object.entries(files)) {
    result[path] = data.content;
  }
  return result;
}

/**
 * Clear all files
 */
export function clearFiles() {
  filesStore.set({});
}

/**
 * Set current document
 */
export function setCurrentDocument(path, content) {
  currentDocumentStore.set({ path, content });
}

/**
 * Add artifact (Chef pattern)
 */
export function addArtifact(data) {
  const { id, title, messageId } = data;
  artifactsStore.setKey(id, {
    id,
    title,
    messageId,
    closed: false,
    actions: [],
    createdAt: Date.now(),
  });
  showWorkbenchStore.set(true);
}

/**
 * Update artifact
 */
export function updateArtifact(id, updates) {
  const artifact = artifactsStore.get()[id];
  if (artifact) {
    artifactsStore.setKey(id, { ...artifact, ...updates });
  }
}

/**
 * Add action to artifact (Chef pattern)
 */
export function addAction(data) {
  const { artifactId, actionId, action } = data;
  actionsStore.setKey(actionId, {
    artifactId,
    actionId,
    action,
    status: "pending",
    createdAt: Date.now(),
  });
}

/**
 * Run action - execute file write or other action (Chef pattern)
 */
export function runAction(data, options = {}) {
  const { artifactId, actionId, action } = data;
  const { isStreaming } = options;

  if (action.type === "file" && action.filePath) {
    const content = action.content || "";

    // Write file to store
    setFile(action.filePath, content);

    // Update streaming state
    if (isStreaming) {
      streamingFileStore.set({
        path: action.filePath,
        content,
      });
    } else {
      streamingFileStore.set(null);
    }

    // Update action status
    actionsStore.setKey(actionId, {
      ...actionsStore.get()[actionId],
      status: isStreaming ? "running" : "completed",
      content,
    });
  }
}

/**
 * Wait for tool call result (Chef pattern for onToolCall)
 */
export function waitOnToolCall(toolCallId) {
  return new Promise((resolve) => {
    // Check if we already have a result
    const existing = toolCallPromises.get(toolCallId);
    if (existing?.result !== undefined) {
      resolve({ result: existing.result });
      return;
    }

    // Wait for result
    const promise = { resolve, result: undefined };
    toolCallPromises.set(toolCallId, promise);
  });
}

/**
 * Resolve tool call with result
 */
export function resolveToolCall(toolCallId, result) {
  const promise = toolCallPromises.get(toolCallId);
  if (promise) {
    promise.result = result;
    promise.resolve({ result });
    toolCallPromises.delete(toolCallId);
  }
}

/**
 * Abort all pending actions
 */
export function abortAllActions() {
  const actions = actionsStore.get();
  for (const [id, action] of Object.entries(actions)) {
    if (action.status === "running" || action.status === "pending") {
      actionsStore.setKey(id, { ...action, status: "aborted" });
    }
  }
  streamingFileStore.set(null);
}

/**
 * Clear all actions for new generation
 */
export function clearActions() {
  actionsStore.set({});
  artifactsStore.set({});
  streamingFileStore.set(null);
}

/**
 * Get completed files from actions
 */
export function getCompletedFiles() {
  const actions = actionsStore.get();
  const files = [];

  for (const action of Object.values(actions)) {
    if (action.action?.type === "file" && action.status === "completed") {
      files.push({
        path: action.action.filePath,
        content: action.content || action.action.content,
      });
    }
  }

  return files;
}

// Export store object (Chef pattern)
export const workbenchStore = {
  files: filesStore,
  currentDocument: currentDocumentStore,
  artifacts: artifactsStore,
  actions: actionsStore,
  streamingFile: streamingFileStore,
  showWorkbench: showWorkbenchStore,

  // Methods
  setFile,
  getFile,
  getAllFiles,
  clearFiles,
  setCurrentDocument,
  addArtifact,
  updateArtifact,
  addAction,
  runAction,
  waitOnToolCall,
  resolveToolCall,
  abortAllActions,
  clearActions,
  getCompletedFiles,
};

export default workbenchStore;
