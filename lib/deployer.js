// Deployment utilities for packaging and deploying code to Fly.io machines
import * as tar from "tar";
import { Readable } from "stream";
import path from "path";
import { tmpdir } from "os";
import { mkdir, writeFile, rm } from "fs/promises";

/**
 * Package VFS files into a tarball buffer
 * @param {Object} files - Map of file paths to content
 * @returns {Promise<Buffer>} - Tarball buffer
 */
export async function packageFilesToTarball(files) {
  const tempDir = path.join(tmpdir(), `nixbuilder-${Date.now()}`);
  const tarballPath = path.join(tempDir, "app.tar.gz");

  try {
    // Create temp directory
    await mkdir(tempDir, { recursive: true });

    // Write all files to temp directory
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, "app", filePath);
      const dir = path.dirname(fullPath);
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    }

    // Create tarball
    await tar.create(
      {
        gzip: true,
        file: tarballPath,
        cwd: tempDir,
      },
      ["app"]
    );

    // Read tarball into buffer
    const { readFile } = await import("fs/promises");
    const buffer = await readFile(tarballPath);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });

    return buffer;
  } catch (error) {
    // Cleanup on error
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {}
    throw error;
  }
}

/**
 * Generate a build and start script for the machine
 * @returns {string} - Shell script content
 */
export function generateBuildScript() {
  return `#!/bin/sh
set -e

echo "[nixbuilder] Starting deployment..."
cd /app

# Install dependencies
echo "[nixbuilder] Installing dependencies..."
npm install --production=false

# Build the app
echo "[nixbuilder] Building application..."
npm run build

# Start the app
echo "[nixbuilder] Starting application..."
npm start
`;
}

/**
 * Generate a Dockerfile for the machine
 * @returns {string} - Dockerfile content
 */
export function generateDockerfile() {
  return `FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production=false

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]
`;
}

/**
 * Create a deployment package with all necessary files
 * @param {Object} files - VFS files
 * @returns {Object} - Package with tarball and metadata
 */
export async function createDeploymentPackage(files) {
  // Ensure we have package.json
  if (!files["package.json"]) {
    throw new Error("package.json is required for deployment");
  }

  // Add Dockerfile if not present
  if (!files["Dockerfile"]) {
    files["Dockerfile"] = generateDockerfile();
  }

  // Add .dockerignore if not present
  if (!files[".dockerignore"]) {
    files[".dockerignore"] = `node_modules
.next
.git
.env.local
.DS_Store
*.log
`;
  }

  // Package into tarball
  const tarball = await packageFilesToTarball(files);

  return {
    tarball,
    size: tarball.length,
    fileCount: Object.keys(files).length,
  };
}

/**
 * Upload tarball to Fly.io machine via exec
 * This is a simplified approach - in production you'd use volumes or build-time injection
 * @param {Object} flyClient - Fly.io client instance
 * @param {string} machineId - Target machine ID
 * @param {Buffer} tarball - Tarball buffer
 */
export async function uploadToMachine(flyClient, machineId, tarball) {
  // Convert buffer to base64 for exec transmission
  const base64Data = tarball.toString("base64");

  // Helper: robust exec with retries for transient guest readiness glitches
  async function execWithRetry(cmd, maxAttempts = 6) {
    let delay = 400;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await flyClient.exec(machineId, cmd);
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        const transient =
          msg.includes("control.sock") ||
          msg.includes("connection reset") ||
          msg.includes("connection refused") ||
          msg.includes("failed_precondition") ||
          msg.includes("vmm not running") ||
          msg.includes("/v1/exec") ||
          msg.includes("timeout") ||
          msg.includes("deadline_exceeded");
        if (!transient || attempt === maxAttempts) {
          throw e;
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(2000, Math.floor(delay * 1.6));
      }
    }
  }

  // Prepare target and clean previous temp files
  const results = [];
  const preCommands = [
    "mkdir -p /app /tmp",
    "rm -f /tmp/app.b64 /tmp/app.tar.gz",
  ];
  for (const cmd of preCommands) {
    try {
      const result = await execWithRetry(cmd);
      results.push({ cmd, success: true, result });
    } catch (error) {
      results.push({ cmd, success: false, error: error.message });
      throw new Error(`Failed to execute: ${cmd} - ${error.message}`);
    }
  }

  // Append base64 data in chunks to avoid ARG_MAX and payload limits
  const chunkSize = 16384; // 16KB chunks are safe
  for (let i = 0; i < base64Data.length; i += chunkSize) {
    const chunk = base64Data.slice(i, i + chunkSize);
    // Safe single-quoted string: replace ' with '\'' pattern
    const safe = chunk.replace(/'/g, "'\\''");
    const cmd = `printf %s '${safe}' >> /tmp/app.b64`;
    try {
      const result = await execWithRetry(cmd);
      results.push({ cmd: `append_chunk_${i}`, success: true, result });
    } catch (error) {
      results.push({
        cmd: `append_chunk_${i}`,
        success: false,
        error: error.message,
      });
      throw new Error(
        `Failed to append data chunk at offset ${i} - ${error.message}`
      );
    }
  }

  // Decode and extract
  const postCommands = [
    // Decode base64 file to tarball
    "base64 -d /tmp/app.b64 > /tmp/app.tar.gz",
    // Ensure filesystem buffers are flushed
    "sync",
    // Extract into root (/app directory is inside archive)
    "tar -xzf /tmp/app.tar.gz -C /",
    // Cleanup
    "rm -f /tmp/app.b64 /tmp/app.tar.gz",
    // Verify
    "ls -la /app",
  ];
  for (const cmd of postCommands) {
    try {
      const result = await execWithRetry(cmd);
      results.push({ cmd, success: true, result });
    } catch (error) {
      results.push({ cmd, success: false, error: error.message });
      throw new Error(`Failed to execute: ${cmd} - ${error.message}`);
    }
  }

  return results;
}

/**
 * Build and start the application on the machine
 * @param {Object} flyClient - Fly.io client instance
 * @param {string} machineId - Target machine ID
 * @returns {Promise<Object>} - Build result
 */
export async function buildAndStart(flyClient, machineId) {
  // Create a bootstrap script and run it in the background to avoid exec timeouts
  const script = generateBuildScript();
  const b64 = Buffer.from(script, "utf-8").toString("base64");
  const commands = [
    "mkdir -p /app",
    `echo "${b64}" | base64 -d > /app/bootstrap.sh`,
    "chmod +x /app/bootstrap.sh",
    // Run bootstrap in background and stream output to deploy.log
    "nohup /bin/sh /app/bootstrap.sh > /app/deploy.log 2>&1 & echo bootstrap_started",
  ];
  const joined = commands.join(" && ");
  try {
    const result = await flyClient.exec(machineId, joined);
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
