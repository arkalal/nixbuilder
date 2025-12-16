// API to get all files from VFS
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
