import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getFlyClient } from "../../../../../lib/fly";

export async function POST(request) {
  try {
    console.log("[Sandbox Stop] Request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { machineId, force = false } = body;

    if (!machineId) {
      return Response.json(
        { error: "machineId is required" },
        { status: 400 }
      );
    }

    console.log(`[Sandbox Stop] Stopping machine: ${machineId}`);

    const flyClient = getFlyClient();

    // Verify ownership
    const machine = await flyClient.getMachine(machineId);
    if (
      machine.config?.metadata?.nixbuilder_user_id !== session.user.email
    ) {
      return Response.json(
        { error: "Unauthorized access to machine" },
        { status: 403 }
      );
    }

    // Stop the machine
    if (machine.state !== "stopped" && machine.state !== "destroyed") {
      await flyClient.stopMachine(machineId, force ? "SIGKILL" : "SIGTERM");
      console.log(`[Sandbox Stop] Machine stopped: ${machineId}`);
    } else {
      console.log(
        `[Sandbox Stop] Machine already in state: ${machine.state}`
      );
    }

    return Response.json({
      machineId: machine.id,
      status: "stopped",
    });
  } catch (error) {
    console.error("[Sandbox Stop] Error:", error);
    return Response.json(
      {
        error: "Failed to stop sandbox",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

