// API to get all files from VFS and perform file operations
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { globalVFS } from "../../../../../lib/vfs";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const files = globalVFS.getAllFiles();

    return Response.json({
      success: true,
      files,
      count: Object.keys(files).length,
    });
  } catch (error) {
    console.error("[API] Files fetch error:", error);
    return Response.json(
      { error: error.message || "Failed to fetch files" },
      { status: 500 }
    );
  }
}

// Handle file operations: create, delete, rename
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { operation, path, newPath, content } = body;

    if (!operation || !path) {
      return Response.json(
        { error: "Missing required fields: operation and path" },
        { status: 400 }
      );
    }

    switch (operation) {
      case "create": {
        // Create new file or folder
        const isFolder = path.endsWith("/");
        if (isFolder) {
          // For folders, we just need to ensure the path exists in our structure
          // VFS handles this implicitly when files are created under it
          console.log(`[API] Created folder: ${path}`);
          return Response.json({
            success: true,
            message: `Folder created: ${path}`,
            path,
          });
        } else {
          // Create file with content (empty string if not provided)
          const fileContent = content !== undefined ? content : "";
          globalVFS.writeFile(path, fileContent);
          console.log(`[API] Created file: ${path}`);
          return Response.json({
            success: true,
            message: `File created: ${path}`,
            path,
            content: fileContent,
          });
        }
      }

      case "delete": {
        // Delete file
        const existingContent = globalVFS.readFile(path);
        if (existingContent === null) {
          return Response.json(
            { error: `File not found: ${path}` },
            { status: 404 }
          );
        }
        globalVFS.deleteFile(path);
        console.log(`[API] Deleted file: ${path}`);
        return Response.json({
          success: true,
          message: `File deleted: ${path}`,
          path,
        });
      }

      case "rename": {
        // Rename file (move from path to newPath)
        if (!newPath) {
          return Response.json(
            { error: "Missing newPath for rename operation" },
            { status: 400 }
          );
        }
        const fileContent = globalVFS.readFile(path);
        if (fileContent === null) {
          return Response.json(
            { error: `File not found: ${path}` },
            { status: 404 }
          );
        }
        // Create new file with same content
        globalVFS.writeFile(newPath, fileContent);
        // Delete old file
        globalVFS.deleteFile(path);
        console.log(`[API] Renamed file: ${path} -> ${newPath}`);
        return Response.json({
          success: true,
          message: `File renamed: ${path} -> ${newPath}`,
          oldPath: path,
          newPath,
        });
      }

      case "update": {
        // Update file content
        if (content === undefined) {
          return Response.json(
            { error: "Missing content for update operation" },
            { status: 400 }
          );
        }
        globalVFS.writeFile(path, content);
        console.log(`[API] Updated file: ${path}`);
        return Response.json({
          success: true,
          message: `File updated: ${path}`,
          path,
        });
      }

      default:
        return Response.json(
          { error: `Unknown operation: ${operation}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[API] File operation error:", error);
    return Response.json(
      { error: error.message || "File operation failed" },
      { status: 500 }
    );
  }
}
