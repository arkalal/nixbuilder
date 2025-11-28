import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { globalVFS } from "../../../../../lib/vfs";

export async function POST(request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filePath, content } = await request.json();

    if (!filePath || typeof filePath !== "string") {
      return Response.json({ error: "filePath is required" }, { status: 400 });
    }

    if (typeof content !== "string") {
      return Response.json(
        { error: "content must be a string" },
        { status: 400 }
      );
    }

    // Update the file in VFS
    globalVFS.writeFile(filePath, content);
    console.log(`[API] 🔄 VFS synced: ${filePath} (${content.length} chars)`);

    return Response.json({
      success: true,
      message: `File ${filePath} synced to VFS`,
    });
  } catch (error) {
    console.error("[API] Sync file error:", error);
    return Response.json({ error: "Failed to sync file" }, { status: 500 });
  }
}
