import { Sandbox } from "@e2b/code-interpreter";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class E2BSandboxProvider {
  constructor() {
    this.sandbox = null;
    this.sandboxId = null;
    this.url = null;
    this.workdir = process.env.E2B_WORKDIR || "/home/user/app";
    this.devPort = Number(process.env.E2B_DEV_PORT || 3000);
    this.timeoutMs = Math.max(
      1,
      (Number(process.env.E2B_TIMEOUT_MINUTES || 30) || 30) * 60 * 1000
    );
    this.state = "idle";
  }

  async readFileAbsolute(absPath) {
    if (!this.sandbox) throw new Error("No active sandbox");
    const result = await this.sandbox.runCode(`
try:
  with open(${JSON.stringify(absPath)}, 'r') as f:
    print(f.read())
except Exception as e:
  print('')
`);
    return (
      (result.logs && result.logs.stdout
        ? result.logs.stdout.join("\n")
        : "") || ""
    );
  }

  async tailFile(absPath, lines = 200) {
    if (!this.sandbox) throw new Error("No active sandbox");
    const result = await this.sandbox.runCode(`
import subprocess
res = subprocess.run(['bash','-lc', 'tail -n ${lines} '+${JSON.stringify(
      absPath
    )}], capture_output=True, text=True)
print(res.stdout)
`);
    return (
      (result.logs && result.logs.stdout
        ? result.logs.stdout.join("\n")
        : "") || ""
    );
  }

  async getDevLog() {
    const log = await this.tailFile("/tmp/next-dev.log", 500);
    return log || "(no dev output captured)";
  }

  async createSandbox() {
    if (this.sandbox) {
      try {
        await this.terminate();
      } catch {}
      this.sandbox = null;
    }
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) throw new Error("Missing E2B_API_KEY");
    this.sandbox = await Sandbox.create({ apiKey, timeoutMs: this.timeoutMs });
    this.sandboxId = this.sandbox?.sandboxId || String(Date.now());
    const host = this.sandbox.getHost(this.devPort);
    this.url = `https://${host}`;
    if (typeof this.sandbox.setTimeout === "function") {
      this.sandbox.setTimeout(this.timeoutMs);
    }
    return { sandboxId: this.sandboxId, url: this.url };
  }

  async writeFile(path, content) {
    if (!this.sandbox) throw new Error("No active sandbox");
    const full = path.startsWith("/") ? path : `${this.workdir}/${path}`;
    if (this.sandbox.files && typeof this.sandbox.files.write === "function") {
      await this.sandbox.files.write(full, Buffer.from(content));
      return;
    }
    await this.sandbox.runCode(`
import os
os.makedirs(os.path.dirname(${JSON.stringify(full)}), exist_ok=True)
open(${JSON.stringify(full)}, 'w').write(${JSON.stringify(content)})
`);
  }

  async writeFiles(filesMap) {
    const entries = Object.entries(filesMap || {});
    for (const [p, c] of entries) {
      await this.writeFile(p, c);
    }
  }

  async runShell(commandArr, cwd) {
    if (!this.sandbox) throw new Error("No active sandbox");
    const args = JSON.stringify(commandArr);
    const dir = cwd || this.workdir;
    const result = await this.sandbox.runCode(`
import subprocess, os
os.chdir(${JSON.stringify(dir)})
res = subprocess.run(${args}, capture_output=True, text=True)
print(res.stdout)
print("__E2B_SEP__")
print(res.stderr)
print("__E2B_SEP__")
print(res.returncode)
`);
    const out = result.logs.stdout.join("\n");
    const parts = out.split("__E2B_SEP__\n");
    const stdout = parts[0] || "";
    const stderr = parts[1] || "";
    const exitCode = Number((parts[2] || "").trim() || 0);
    return { stdout, stderr, exitCode };
  }

  async installDependencies() {
    // For preview reliability, always use install with legacy peer deps to tolerate ecosystem mismatches
    const args = [
      "npm",
      "install",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
      "--legacy-peer-deps",
    ];
    this.state = "installing";
    return this.runShell(args);
  }

  async startDevServer() {
    this.state = "starting";
    // Kill any existing dev server fast
    await this.runShell(["pkill", "-f", "next dev"], this.workdir).catch(
      () => {}
    );
    await sleep(300);

    // Start dev server detached and return immediately
    await this.sandbox.runCode(`
import subprocess, os
os.chdir(${JSON.stringify(this.workdir)})
try:
  subprocess.run(['pkill','-f','next dev'], capture_output=True)
except Exception:
  pass
log_path = '/tmp/next-dev.log'
env = os.environ.copy()
env['FORCE_COLOR'] = '0'
env['NEXT_TELEMETRY_DISABLED'] = env.get('NEXT_TELEMETRY_DISABLED','1')
env['PREVIEW_NO_AUTH'] = env.get('PREVIEW_NO_AUTH','true')
with open(log_path, 'ab') as f:
  subprocess.Popen(['npm','run','dev','--','-p', str(${
    this.devPort
  }), '-H', '0.0.0.0'], stdout=f, stderr=subprocess.STDOUT, env=env)
print('OK')
`);

    // Poll readiness from Node with short, fast runCode calls to avoid long timeouts
    const deadline = Date.now() + 60_000; // 60s
    while (Date.now() < deadline) {
      const probe = await this.sandbox.runCode(`
import socket
s = socket.socket(); s.settimeout(1)
try:
  s.connect(('127.0.0.1', ${this.devPort})); s.close(); print('READY')
except Exception:
  print('WAIT')
`);
      const probeOut =
        (probe.logs && probe.logs.stdout ? probe.logs.stdout.join("\n") : "") ||
        "";
      if (probeOut.includes("READY")) {
        this.state = "running";
        return;
      }
      await sleep(1000);
    }

    this.state = "error";
    // Attach last log tail to error context for diagnostics
    const tail = await this.getDevLog().catch(() => "(no logs)");
    throw new Error(
      `Dev server failed to bind to port ${this.devPort}. Logs:\n${tail}`
    );
  }

  async restartDevServer() {
    await this.runShell(["pkill", "-f", "next dev"], this.workdir).catch(
      () => {}
    );
    await sleep(1500);
    return this.startDevServer();
  }

  getInfo() {
    return { sandboxId: this.sandboxId, url: this.url, state: this.state };
  }

  async terminate() {
    if (this.sandbox) {
      try {
        await this.sandbox.kill();
      } catch {}
      this.sandbox = null;
      this.sandboxId = null;
      this.url = null;
      this.state = "stopped";
    }
  }
}
