import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getFlyClient } from "../../../../../lib/fly";
import { globalVFS } from "../../../../../lib/vfs";
import {
  createDeploymentPackage,
  uploadToMachine,
  buildAndStart,
} from "../../../../../lib/deployer";

export async function POST(request) {
  try {
    console.log("[Sandbox Deploy] Request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { machineId, projectId } = body;

    if (!machineId) {
      return Response.json({ error: "machineId is required" }, { status: 400 });
    }

    console.log(`[Sandbox Deploy] Deploying to machine: ${machineId}`);

    const flyClient = getFlyClient();

    // Verify ownership
    const machine = await flyClient.getMachine(machineId);
    if (machine.config?.metadata?.nixbuilder_user_id !== session.user.email) {
      return Response.json(
        { error: "Unauthorized access to machine" },
        { status: 403 }
      );
    }

    // Get all files from VFS
    const files = globalVFS.getAllFiles();
    const fileCount = Object.keys(files).length;

    if (fileCount === 0) {
      return Response.json({ error: "No files to deploy" }, { status: 400 });
    }

    console.log(`[Sandbox Deploy] Packaging ${fileCount} files...`);

    // Create deployment package
    const pkg = await createDeploymentPackage(files);
    console.log(
      `[Sandbox Deploy] Package created: ${pkg.size} bytes, ${pkg.fileCount} files`
    );

    // Upload to machine
    console.log(`[Sandbox Deploy] Uploading to machine...`);
    try {
      // Ensure exec is responsive inside the guest before running commands
      await flyClient.waitForExecReady(machineId, 180000);
      await uploadToMachine(flyClient, machineId, pkg.tarball);
      console.log(`[Sandbox Deploy] Upload complete`);
    } catch (uploadError) {
      console.error("[Sandbox Deploy] Upload failed:", uploadError);
      return Response.json(
        {
          error: "Failed to upload files",
          message: uploadError.message,
          phase: "upload",
        },
        { status: 500 }
      );
    }

    // Build and start
    console.log(`[Sandbox Deploy] Building and starting application...`);
    try {
      const buildResult = await buildAndStart(flyClient, machineId);

      if (!buildResult.success) {
        console.error("[Sandbox Deploy] Build failed:", buildResult.error);
        return Response.json(
          {
            error: "Build failed",
            message: buildResult.error,
            phase: "build",
          },
          { status: 500 }
        );
      }

      console.log(`[Sandbox Deploy] Deployment complete`);

      return Response.json({
        success: true,
        machineId,
        filesDeployed: pkg.fileCount,
        packageSize: pkg.size,
        buildOutput: buildResult.output,
      });
    } catch (buildError) {
      console.error("[Sandbox Deploy] Build error:", buildError);
      return Response.json(
        {
          error: "Failed to build application",
          message: buildError.message,
          phase: "build",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Sandbox Deploy] Error:", error);
    return Response.json(
      {
        error: "Deployment failed",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
