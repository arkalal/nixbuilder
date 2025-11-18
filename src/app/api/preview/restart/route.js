import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getSandbox, touch } from "../../../../../lib/sandbox/manager";

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { projectId } = body || {};
    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }

    const entry = getSandbox(session.user.email, projectId);
    const provider = entry?.provider;
    if (!provider) {
      return Response.json({ error: "No active sandbox" }, { status: 400 });
    }

    if (typeof provider.restartDevServer === "function") {
      await provider.restartDevServer();
    } else if (typeof provider.startDevServer === "function") {
      await provider.startDevServer();
    }

    touch(session.user.email, projectId);
    const info = provider.getInfo ? provider.getInfo() : null;

    return Response.json({ ok: true, info });
  } catch (error) {
    console.error("[Preview Restart] Error:", error);
    return Response.json(
      { error: error.message || "Failed to restart preview" },
      { status: 500 }
    );
  }
}
