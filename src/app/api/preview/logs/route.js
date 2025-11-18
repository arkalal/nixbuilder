import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getSandbox, touch } from "../../../../../lib/sandbox/manager";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }

    const entry = getSandbox(session.user.email, projectId);
    const provider = entry?.provider;
    if (!provider) {
      return Response.json({ error: "No active sandbox" }, { status: 400 });
    }

    const logs =
      typeof provider.getDevLog === "function"
        ? await provider.getDevLog()
        : "(logs unavailable)";
    touch(session.user.email, projectId);

    return Response.json({ success: true, logs });
  } catch (error) {
    console.error("[Preview Logs] Error:", error);
    return Response.json(
      { error: error.message || "Failed to fetch preview logs" },
      { status: 500 }
    );
  }
}
