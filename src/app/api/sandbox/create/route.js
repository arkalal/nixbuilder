import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import {
  getFlyClient,
  createNextJsSandboxConfig,
} from "../../../../../lib/fly";

export async function POST(request) {
  try {
    console.log("[Sandbox Create] Request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }

    console.log(`[Sandbox Create] Creating machine for project: ${projectId}`);

    // Get Fly client
    const flyClient = getFlyClient();
    // Ensure the app has public IPs so *.fly.dev DNS resolves
    try {
      await flyClient.ensurePublicIPs();
    } catch (e) {
      console.warn("[Sandbox Create] ensurePublicIPs warning:", e?.message);
      // Non-fatal: app may already have IPs
    }

    // Check if there's an existing machine for this project (reuse if stopped)
    const existingMachines = await flyClient.listMachines();
    const projectMachine = existingMachines.find(
      (m) =>
        m.config?.metadata?.nixbuilder_project_id === projectId &&
        m.config?.metadata?.nixbuilder_user_id === session.user.email
    );

    if (projectMachine && projectMachine.state === "stopped") {
      console.log(
        `[Sandbox Create] Reusing stopped machine: ${projectMachine.id}`
      );
      return Response.json({
        machineId: projectMachine.id,
        status: projectMachine.state,
        reused: true,
      });
    }

    if (projectMachine && projectMachine.state !== "destroyed") {
      console.log(
        `[Sandbox Create] Machine already exists and is active: ${projectMachine.id}`
      );
      return Response.json({
        machineId: projectMachine.id,
        status: projectMachine.state,
        reused: true,
      });
    }

    // Create new machine
    const machineConfig = createNextJsSandboxConfig(
      projectId,
      session.user.email
    );
    // Create new machine without auto-start; we'll explicitly start later
    const machine = await flyClient.createMachine(machineConfig);

    console.log(`[Sandbox Create] Machine created: ${machine.id}`);

    return Response.json(
      {
        machineId: machine.id,
        status: machine.state,
        name: machine.name,
        region: machine.region,
        privateIp: machine.private_ip,
        reused: false,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Sandbox Create] Error:", error);
    return Response.json(
      {
        error: "Failed to create sandbox",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
