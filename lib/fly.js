// Fly.io Machines API client
// Docs: https://fly.io/docs/machines/api/

const FLY_API_BASE = "https://api.machines.dev/v1";

class FlyClient {
  constructor(apiToken, appName) {
    if (!apiToken) {
      throw new Error("Fly.io API token is required");
    }
    if (!appName) {
      throw new Error("Fly.io app name is required");
    }
    this.apiToken = apiToken;
    this.appName = appName;
    this.headers = {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    };
  }

  // GraphQL helper (Fly platform API)
  async _graphql(query, variables = {}) {
    const response = await fetch("https://api.fly.io/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (!response.ok || json.errors) {
      const err =
        json.errors && json.errors.length
          ? json.errors[0].message
          : response.statusText;
      throw new Error(`Fly GraphQL error: ${err}`);
    }
    return json.data;
  }

  async _getAppId() {
    const q = `query($name:String!){ app(name:$name){ id name } }`;
    const data = await this._graphql(q, { name: this.appName });
    const id = data?.app?.id;
    if (!id) throw new Error(`App ${this.appName} not found in GraphQL`);
    return id;
  }

  async ensurePublicIPs() {
    const appId = await this._getAppId();
    const alloc = `mutation($input:AllocateIPAddressInput!){ allocateIpAddress(input:$input){ ipAddress{ address type } } }`;
    // IPv6
    try {
      await this._graphql(alloc, { input: { appId, type: "v6" } });
    } catch {}
    // Shared IPv4 (some schemas may not accept 'shared'; ignore errors)
    try {
      await this._graphql(alloc, {
        input: { appId, type: "v4", shared: true },
      });
    } catch {}
  }

  async request(endpoint, options = {}) {
    const url = `${FLY_API_BASE}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Fly.io API error (${response.status}): ${
          errorText || response.statusText
        }`
      );
    }

    // Some endpoints return empty 204
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  }

  // List all machines for the app
  async listMachines() {
    return this.request(`/apps/${this.appName}/machines`);
  }

  // Get a single machine
  async getMachine(machineId) {
    return this.request(`/apps/${this.appName}/machines/${machineId}`);
  }

  // Create a new machine
  async createMachine(config) {
    return this.request(`/apps/${this.appName}/machines`, {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  // Start a machine
  async startMachine(machineId) {
    return this.request(`/apps/${this.appName}/machines/${machineId}/start`, {
      method: "POST",
    });
  }

  // Stop a machine
  async stopMachine(machineId, signal = "SIGTERM") {
    return this.request(`/apps/${this.appName}/machines/${machineId}/stop`, {
      method: "POST",
      body: JSON.stringify({ signal }),
    });
  }

  // Delete a machine
  async deleteMachine(machineId, force = false) {
    return this.request(
      `/apps/${this.appName}/machines/${machineId}?force=${force}`,
      {
        method: "DELETE",
      }
    );
  }

  // Wait for machine to reach a specific state
  async waitForState(machineId, targetState, timeoutMs = 60000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const machine = await this.getMachine(machineId);
      if (machine.state === targetState) {
        return machine;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
      `Timeout waiting for machine ${machineId} to reach state ${targetState}`
    );
  }

  // Wait for machine to reach one of multiple acceptable states
  async waitForStates(machineId, targetStates, timeoutMs = 60000) {
    const statesSet = new Set(targetStates);
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const machine = await this.getMachine(machineId);
      if (statesSet.has(machine.state)) {
        return machine;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
      `Timeout waiting for machine ${machineId} to reach states ${targetStates.join(
        ", "
      )}`
    );
  }

  // Get machine logs (uses different endpoint)
  async getMachineLogs(machineId) {
    // Note: This returns NATS stream URL, not direct logs
    // For real-time logs, we'll need to implement NATS streaming or use exec
    return this.request(`/apps/${this.appName}/machines/${machineId}/logs`);
  }

  // Execute command in machine
  async exec(machineId, command, timeoutSec = 30) {
    // The Machines exec API expects:
    // - cmd: string (not array)
    // - timeout: integer seconds (max 60)
    const cmdString = Array.isArray(command)
      ? command.filter(Boolean).join(" && ")
      : String(command || "").trim();
    const secs = Math.max(
      1,
      Math.min(60, Number.parseInt(timeoutSec, 10) || 30)
    );
    const body = { cmd: cmdString, timeout: secs };
    return this.request(`/apps/${this.appName}/machines/${machineId}/exec`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Wait until exec endpoint is responsive inside the guest
  async waitForExecReady(machineId, timeoutMs = 60000) {
    const startTime = Date.now();
    // Poll quickly then backoff to 1s
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let delay = 300;
    while (Date.now() - startTime < timeoutMs) {
      try {
        await this.exec(machineId, "echo ready", 5);
        return true;
      } catch (e) {
        // Common transient errors while the control socket is not ready
        const msg = String(e?.message || "").toLowerCase();
        const transient =
          msg.includes("control.sock") ||
          msg.includes("connection refused") ||
          msg.includes("reset by peer") ||
          msg.includes("/v1/exec") ||
          msg.includes("failed_precondition") ||
          msg.includes("vmm not running") ||
          msg.includes("precondition");
        if (!transient) {
          // Non-transient, bubble up
          throw e;
        }
        await sleep(delay);
        delay = Math.min(1000, Math.floor(delay * 1.5));
      }
    }
    throw new Error(
      `Timeout waiting for exec readiness on machine ${machineId}`
    );
  }
}

// Singleton instance
let flyClientInstance = null;

export function getFlyClient() {
  if (!flyClientInstance) {
    const token = process.env.FLY_API_TOKEN;
    const appName = process.env.FLY_APP_NAME;

    if (!token || !appName) {
      throw new Error(
        "Missing Fly.io configuration. Please set FLY_API_TOKEN and FLY_APP_NAME in .env"
      );
    }

    flyClientInstance = new FlyClient(token, appName);
  }

  return flyClientInstance;
}

// Helper to generate machine config for Next.js sandbox
export function createNextJsSandboxConfig(projectId, userId) {
  return {
    name: `nixbuilder-${projectId}-${Date.now()}`,
    auto_destroy: false, // keep machine around; we manage lifecycle
    config: {
      image: "node:20-alpine", // We'll use a base Node image for now
      init: {
        // Keep the container process alive so exec is always possible
        exec: ["tail", "-f", "/dev/null"],
      },
      guest: {
        cpu_kind: "shared",
        cpus: 1,
        memory_mb: 512,
      },
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        PROJECT_ID: projectId,
      },
      metadata: {
        nixbuilder_project_id: projectId,
        nixbuilder_user_id: userId,
        created_at: new Date().toISOString(),
      },
      services: [
        {
          ports: [
            {
              port: 443,
              handlers: ["tls", "http"],
            },
            {
              port: 80,
              handlers: ["http"],
            },
          ],
          protocol: "tcp",
          internal_port: 3000,
        },
      ],
    },
  };
}

export { FlyClient };
