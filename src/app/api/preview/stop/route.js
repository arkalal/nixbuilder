import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { terminateSandbox } from "../../../../../lib/sandbox/manager";

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

    await terminateSandbox(session.user.email, projectId);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[Preview Stop] Error:", error);
    return Response.json(
      { error: error.message || "Failed to stop preview" },
      { status: 500 }
    );
  }
}
