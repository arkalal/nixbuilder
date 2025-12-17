// In-memory Version Manager for undo/revert functionality
// Manages snapshots of project state without requiring database persistence

class VersionManager {
  constructor(options = {}) {
    this.versions = [];
    this.currentIndex = -1;
    this.maxVersions = options.maxVersions || 50;
    this.listeners = new Set();
  }

  /**
   * Create a snapshot of the current project state
   * @param {Object} files - Object of { path: content } pairs
   * @param {Object} metadata - Additional info about this version
   * @returns {Object} The created version object
   */
  createSnapshot(files, metadata = {}) {
    const version = {
      id: `v-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      files: this._deepClone(files),
      metadata: {
        type: metadata.type || "manual", // 'initial' | 'pre_ai_change' | 'post_ai_change' | 'manual'
        message: metadata.message || "",
        userPrompt: metadata.userPrompt || "",
        filesChanged: metadata.filesChanged || [],
        filesCreated: metadata.filesCreated || [],
        filesDeleted: metadata.filesDeleted || [],
      },
    };

    // If we're not at the end of the history, truncate forward history
    if (this.currentIndex < this.versions.length - 1) {
      this.versions = this.versions.slice(0, this.currentIndex + 1);
    }

    // Add new version
    this.versions.push(version);
    this.currentIndex = this.versions.length - 1;

    // Trim old versions if exceeding max
    if (this.versions.length > this.maxVersions) {
      const removeCount = this.versions.length - this.maxVersions;
      this.versions = this.versions.slice(removeCount);
      this.currentIndex = Math.max(0, this.currentIndex - removeCount);
    }

    this._notifyListeners("snapshot_created", version);
    return version;
  }

  /**
   * Revert to a specific version by ID
   * @param {string} versionId - The version ID to revert to
   * @returns {Object|null} The files from that version, or null if not found
   */
  revertTo(versionId) {
    const index = this.versions.findIndex((v) => v.id === versionId);
    if (index === -1) {
      console.warn(`[VersionManager] Version ${versionId} not found`);
      return null;
    }

    this.currentIndex = index;
    const version = this.versions[index];
    this._notifyListeners("reverted", version);
    return this._deepClone(version.files);
  }

  /**
   * Undo to the previous version
   * @returns {Object|null} The files from previous version, or null if at start
   */
  undo() {
    if (this.currentIndex <= 0) {
      console.warn("[VersionManager] Already at oldest version");
      return null;
    }

    this.currentIndex--;
    const version = this.versions[this.currentIndex];
    this._notifyListeners("undo", version);
    return this._deepClone(version.files);
  }

  /**
   * Redo to the next version (if available after undo)
   * @returns {Object|null} The files from next version, or null if at end
   */
  redo() {
    if (this.currentIndex >= this.versions.length - 1) {
      console.warn("[VersionManager] Already at latest version");
      return null;
    }

    this.currentIndex++;
    const version = this.versions[this.currentIndex];
    this._notifyListeners("redo", version);
    return this._deepClone(version.files);
  }

  /**
   * Get the current version
   * @returns {Object|null} Current version object
   */
  getCurrentVersion() {
    if (this.currentIndex < 0 || this.currentIndex >= this.versions.length) {
      return null;
    }
    return this.versions[this.currentIndex];
  }

  /**
   * Get all versions (for history UI)
   * @returns {Array} Array of version objects with metadata
   */
  getHistory() {
    return this.versions.map((v, index) => ({
      ...v,
      isCurrent: index === this.currentIndex,
      fileCount: Object.keys(v.files).length,
    }));
  }

  /**
   * Get version by ID
   * @param {string} versionId
   * @returns {Object|null}
   */
  getVersion(versionId) {
    return this.versions.find((v) => v.id === versionId) || null;
  }

  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   * @returns {boolean}
   */
  canRedo() {
    return this.currentIndex < this.versions.length - 1;
  }

  /**
   * Get the last pre-AI-change snapshot (for stop & revert)
   * @returns {Object|null}
   */
  getLastPreAISnapshot() {
    for (let i = this.versions.length - 1; i >= 0; i--) {
      if (this.versions[i].metadata.type === "pre_ai_change") {
        return this.versions[i];
      }
    }
    return null;
  }

  /**
   * Revert to the last pre-AI-change snapshot
   * @returns {Object|null} The files, or null if no pre-AI snapshot exists
   */
  revertToPreAI() {
    const preAI = this.getLastPreAISnapshot();
    if (!preAI) {
      console.warn("[VersionManager] No pre-AI snapshot found");
      return null;
    }
    return this.revertTo(preAI.id);
  }

  /**
   * Calculate diff between two versions
   * @param {string} fromId
   * @param {string} toId
   * @returns {Object} { added: [], modified: [], deleted: [] }
   */
  getDiff(fromId, toId) {
    const fromVersion = this.getVersion(fromId);
    const toVersion = this.getVersion(toId);

    if (!fromVersion || !toVersion) {
      return { added: [], modified: [], deleted: [] };
    }

    const fromFiles = fromVersion.files;
    const toFiles = toVersion.files;

    const added = [];
    const modified = [];
    const deleted = [];

    // Find added and modified
    for (const path of Object.keys(toFiles)) {
      if (!(path in fromFiles)) {
        added.push(path);
      } else if (fromFiles[path] !== toFiles[path]) {
        modified.push(path);
      }
    }

    // Find deleted
    for (const path of Object.keys(fromFiles)) {
      if (!(path in toFiles)) {
        deleted.push(path);
      }
    }

    return { added, modified, deleted };
  }

  /**
   * Subscribe to version manager events
   * @param {Function} callback - Called with (eventType, version)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Clear all versions (for new project)
   */
  clear() {
    this.versions = [];
    this.currentIndex = -1;
    this._notifyListeners("cleared", null);
  }

  /**
   * Get summary stats
   * @returns {Object}
   */
  getStats() {
    return {
      totalVersions: this.versions.length,
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      oldestTimestamp: this.versions[0]?.timestamp || null,
      newestTimestamp:
        this.versions[this.versions.length - 1]?.timestamp || null,
    };
  }

  // Private helpers
  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _notifyListeners(eventType, version) {
    for (const listener of this.listeners) {
      try {
        listener(eventType, version);
      } catch (e) {
        console.error("[VersionManager] Listener error:", e);
      }
    }
  }
}

// Create global instance for studio use
const globalVersionManager = new VersionManager({ maxVersions: 50 });

export { VersionManager, globalVersionManager };
