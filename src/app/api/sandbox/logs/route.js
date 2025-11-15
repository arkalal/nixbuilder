import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { getFlyClient } from "../../../../../lib/fly";
import { createSSEStream, createSSEResponse } from "../../../../../lib/sse";

export async function GET(request) {
  try {
    console.log("[Sandbox Logs] Request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get("machineId");

    if (!machineId) {
      return Response.json({ error: "machineId is required" }, { status: 400 });
    }

    console.log(`[Sandbox Logs] Streaming logs for machine: ${machineId}`);

    const flyClient = getFlyClient();

    // Verify ownership
    const machine = await flyClient.getMachine(machineId);
    if (machine.config?.metadata?.nixbuilder_user_id !== session.user.email) {
      return Response.json(
        { error: "Unauthorized access to machine" },
        { status: 403 }
      );
    }

    // Create SSE stream
    const { stream, send, close } = createSSEStream();

    // Start streaming logs in the background
    (async () => {
      try {
        send("connected", { machineId, timestamp: new Date().toISOString() });

        // Track log file position
        let logPosition = 0;
        const pollInterval = 2000; // Poll every 2 seconds
        let isFirstPoll = true;

        while (true) {
          try {
            // Get machine status
            const currentMachine = await flyClient.getMachine(machineId);

            if (currentMachine.state === "destroyed") {
              send("log", {
                level: "info",
                message: "Machine has been destroyed",
                timestamp: new Date().toISOString(),
              });
              break;
            }

            if (currentMachine.state === "stopped") {
              if (isFirstPoll) {
                send("log", {
                  level: "info",
                  message: "Machine stopped",
                  timestamp: new Date().toISOString(),
                });
                isFirstPoll = false;
              }
              // Keep polling in case it restarts
              await new Promise((resolve) => setTimeout(resolve, pollInterval));
              continue;
            }

            if (currentMachine.state === "started") {
              // Try to read application logs from /app/logs or stdout
              try {
                // Ensure exec endpoint is ready; tolerate failures silently
                try {
                  await flyClient.waitForExecReady(machineId, 30000);
                } catch {}
                // Check if app is running and get logs
                const logCmd = `
                  if [ -f /app/deploy.log ]; then 
                    tail -n +${logPosition + 1} /app/deploy.log
                  elif [ -f /app/.next/trace ]; then
                    echo "Build complete - Next.js ready"
                  else
                    echo "Machine running - waiting for deployment"
                  fi
                `;

                const result = await flyClient.exec(machineId, logCmd.trim());
                const output =
                  typeof result === "string"
                    ? result
                    : result?.stdout || result?.output || "";
                if (output) {
                  const logLines = output.trim().split("\n");
                  for (const line of logLines) {
                    if (line && line.length > 0) {
                      // Parse log level from line
                      const level =
                        line.includes("error") || line.includes("ERROR")
                          ? "error"
                          : line.includes("warn") || line.includes("WARN")
                          ? "warning"
                          : "info";

                      send("log", {
                        level,
                        message: line,
                        timestamp: new Date().toISOString(),
                      });
                      logPosition++;
                    }
                  }
                } else if (isFirstPoll) {
                  send("log", {
                    level: "info",
                    message: "Machine started - ready for deployment",
                    timestamp: new Date().toISOString(),
                  });
                }

                isFirstPoll = false;
              } catch (execError) {
                console.error("[Sandbox Logs] Exec error:", execError);
                if (isFirstPoll) {
                  send("log", {
                    level: "info",
                    message: "Machine started",
                    timestamp: new Date().toISOString(),
                  });
                  isFirstPoll = false;
                }
              }
            }

            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          } catch (pollError) {
            console.error("[Sandbox Logs] Poll error:", pollError);
            send("error", {
              message: "Error polling machine status",
              timestamp: new Date().toISOString(),
            });
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }
        }
      } catch (error) {
        console.error("[Sandbox Logs] Streaming error:", error);
        send("error", {
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      } finally {
        close();
      }
    })();

    return createSSEResponse(stream);
  } catch (error) {
    console.error("[Sandbox Logs] Error:", error);
    return Response.json(
      {
        error: "Failed to stream logs",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
