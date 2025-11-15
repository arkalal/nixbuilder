import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import {
  getFlyClient,
  createNextJsSandboxConfig,
} from "../../../../../lib/fly";

export async function POST(request) {
  try {
    console.log("[Sandbox Start] Request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { machineId } = body;

    if (!machineId) {
      return Response.json({ error: "machineId is required" }, { status: 400 });
    }

    console.log(`[Sandbox Start] Starting machine: ${machineId}`);

    const flyClient = getFlyClient();

    // Verify ownership
    let machine = await flyClient.getMachine(machineId);
    if (machine.config?.metadata?.nixbuilder_user_id !== session.user.email) {
      return Response.json(
        { error: "Unauthorized access to machine" },
        { status: 403 }
      );
    }

    // If the machine was destroyed (race or auto-destroy), recreate and start
    if (machine.state === "destroyed") {
      const projectId =
        machine.config?.metadata?.nixbuilder_project_id ||
        `project-${Date.now()}`;
      console.warn(
        `[Sandbox Start] Machine is destroyed. Recreating new machine for project: ${projectId}`
      );
      const newMachine = await flyClient.createMachine(
        createNextJsSandboxConfig(projectId, session.user.email)
      );
      // Wait until it is provisioned
      try {
        await flyClient.waitForState(newMachine.id, "stopped", 30000);
      } catch (e) {
        console.warn(
          "[Sandbox Start] New machine did not reach 'stopped' in time; attempting start anyway"
        );
      }
      await flyClient.startMachine(newMachine.id);
      const started = await flyClient.waitForState(
        newMachine.id,
        "started",
        30000
      );
      return Response.json({
        machineId: started.id,
        status: started.state,
        privateIp: started.private_ip,
        region: started.region,
        replaced: true,
      });
    }

    // Handle state machine rules robustly:
    // - If 'created' or 'starting', wait until 'stopped' or 'started'
    // - If 'stopped', call start
    // - If 'started', return
    if (machine.state === "created" || machine.state === "starting") {
      console.log(
        `[Sandbox Start] Waiting for machine to leave '${machine.state}'...`
      );
      const ready = await flyClient.waitForStates(
        machineId,
        ["stopped", "started"],
        120000
      );
      if (ready.state === "started") {
        return Response.json({
          machineId: ready.id,
          status: ready.state,
          privateIp: ready.private_ip,
          region: ready.region,
        });
      }
      // fallthrough with state 'stopped'
      machine = ready;
    }
    if (machine.state === "stopped") {
      try {
        await flyClient.startMachine(machineId);
        console.log(`[Sandbox Start] Machine starting: ${machineId}`);
      } catch (e) {
        // If we hit 412 due to a race, wait for 'stopped' and retry once
        console.warn(
          "[Sandbox Start] Start failed once, retrying after wait:",
          e?.message
        );
        const ready = await flyClient.waitForStates(
          machineId,
          ["stopped", "started"],
          60000
        );
        if (ready.state !== "started") {
          await flyClient.startMachine(machineId);
        } else {
          machine = ready;
        }
      }
    }

    // Wait for machine to be started (with timeout)
    const startedMachine = await flyClient.waitForState(
      machineId,
      "started",
      120000
    );

    console.log(`[Sandbox Start] Machine started: ${machineId}`);

    return Response.json({
      machineId: startedMachine.id,
      status: startedMachine.state,
      privateIp: startedMachine.private_ip,
      region: startedMachine.region,
    });
  } catch (error) {
    console.error("[Sandbox Start] Error:", error);
    return Response.json(
      {
        error: "Failed to start sandbox",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
