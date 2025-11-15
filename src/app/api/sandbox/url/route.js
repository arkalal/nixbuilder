import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getFlyClient } from "../../../../../lib/fly";

export async function GET(request) {
  try {
    console.log("[Sandbox URL] Request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get("machineId");

    if (!machineId) {
      return Response.json(
        { error: "machineId is required" },
        { status: 400 }
      );
    }

    console.log(`[Sandbox URL] Getting URL for machine: ${machineId}`);

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

    // Check if machine is running
    if (machine.state !== "started") {
      return Response.json(
        {
          error: "Machine is not running",
          status: machine.state,
        },
        { status: 400 }
      );
    }

    // Construct the preview URL
    // Fly.io apps are accessible at: https://<app-name>.fly.dev
    const appName = process.env.FLY_APP_NAME;
    const previewUrl = `https://${appName}.fly.dev`;

    console.log(`[Sandbox URL] Preview URL: ${previewUrl}`);

    return Response.json({
      machineId: machine.id,
      previewUrl,
      status: machine.state,
      region: machine.region,
    });
  } catch (error) {
    console.error("[Sandbox URL] Error:", error);
    return Response.json(
      {
        error: "Failed to get sandbox URL",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

