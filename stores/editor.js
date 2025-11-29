/**
 * EditorStore - Chef-style editor state management using nanostores
 * Based on: https://github.com/get-convex/chef/blob/main/app/lib/stores/editor.ts
 */

import { atom, map, computed } from "nanostores";

/**
 * EditorStore manages:
 * - Selected file
 * - Editor documents (content + scroll position)
 * - Following streamed code state
 */
class EditorStore {
  // Currently selected file path
  selectedFile = atom(undefined);

  // Documents map: { [filePath]: { value, filePath, scroll } }
  documents = map({});

  // Whether to auto-follow streaming code
  followingStreamedCode = atom(true);

  // Computed: current document based on selected file
  currentDocument = computed(
    [this.documents, this.selectedFile],
    (documents, selectedFile) => {
      if (!selectedFile) {
        return undefined;
      }
      return documents[selectedFile];
    }
  );

  /**
   * Sync documents with files array
   * @param {Array} files - Array of file objects { path, content, type }
   */
  setDocuments(files) {
    const previousDocuments = this.documents.get();

    const newDocuments = {};
    for (const file of files) {
      if (!file.path || !file.content) continue;

      const previousDocument = previousDocuments[file.path];

      newDocuments[file.path] = {
        value: file.content,
        filePath: file.path,
        scroll: previousDocument?.scroll,
      };
    }

    this.documents.set(newDocuments);
  }

  /**
   * Set selected file
   * @param {string|undefined} filePath
   */
  setSelectedFile(filePath) {
    this.selectedFile.set(filePath);
  }

  /**
   * Update scroll position for a file
   * @param {string} filePath
   * @param {Object} position - { top, left }
   */
  updateScrollPosition(filePath, position) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    this.documents.setKey(filePath, {
      ...documentState,
      scroll: position,
    });
  }

  /**
   * Update file content (from editor changes)
   * @param {string} filePath
   * @param {string} newContent
   */
  updateFile(filePath, newContent) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    const currentContent = documentState.value;
    const contentChanged = currentContent !== newContent;

    if (contentChanged) {
      this.documents.setKey(filePath, {
        ...documentState,
        value: newContent,
      });
    }
  }

  /**
   * Add or update a single document (for streaming)
   * @param {string} filePath
   * @param {string} content
   */
  setStreamingDocument(filePath, content) {
    const documents = this.documents.get();
    const existing = documents[filePath];

    this.documents.setKey(filePath, {
      value: content,
      filePath,
      scroll: existing?.scroll,
    });

    // Auto-select streaming file if following
    if (this.followingStreamedCode.get()) {
      this.selectedFile.set(filePath);
    }
  }

  /**
   * Clear all documents
   */
  clear() {
    this.documents.set({});
    this.selectedFile.set(undefined);
    this.followingStreamedCode.set(true);
  }
}

// Singleton instance
export const editorStore = new EditorStore();

// Export atoms for direct subscription
export const $selectedFile = editorStore.selectedFile;
export const $documents = editorStore.documents;
export const $currentDocument = editorStore.currentDocument;
export const $followingStreamedCode = editorStore.followingStreamedCode;
