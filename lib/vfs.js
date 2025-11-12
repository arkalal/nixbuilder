// In-memory Virtual File System (VFS)
// Will be persisted to MongoDB/GridFS in M3

class VirtualFileSystem {
  constructor() {
    this.files = new Map(); // path -> { content, updatedAt }
  }

  writeFile(path, content) {
    this.files.set(path, {
      content,
      updatedAt: new Date().toISOString(),
    });
  }

  readFile(path) {
    const file = this.files.get(path);
    return file ? file.content : null;
  }

  listFiles() {
    return Array.from(this.files.keys());
  }

  deleteFile(path) {
    this.files.delete(path);
  }

  getAllFiles() {
    const result = {};
    for (const [path, data] of this.files.entries()) {
      result[path] = data.content;
    }
    return result;
  }

  clear() {
    this.files.clear();
  }
}

// Create a global VFS instance (in production, this will be per-project)
const globalVFS = new VirtualFileSystem();

export { VirtualFileSystem, globalVFS };
