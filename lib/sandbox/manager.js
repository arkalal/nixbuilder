const instances = new Map();

function key(userId, projectId) {
  return `${userId || "anon"}:${projectId || "default"}`;
}

export function getSandbox(userId, projectId) {
  const k = key(userId, projectId);
  return instances.get(k) || null;
}

export function setSandbox(userId, projectId, provider) {
  const k = key(userId, projectId);
  instances.set(k, { provider, lastAccessed: Date.now() });
}

export async function terminateSandbox(userId, projectId) {
  const k = key(userId, projectId);
  const entry = instances.get(k);
  if (entry) {
    try {
      await entry.provider.terminate();
    } catch {}
    instances.delete(k);
  }
}

export async function cleanup(options = {}) {
  const idleMs = Math.max(
    1,
    (Number(process.env.PREVIEW_IDLE_MINUTES || 15) || 15) * 60 * 1000
  );
  const now = Date.now();
  for (const [k, v] of instances.entries()) {
    if (now - (v.lastAccessed || now) > idleMs) {
      try {
        await v.provider.terminate();
      } catch {}
      instances.delete(k);
    }
  }
}

export function touch(userId, projectId) {
  const k = key(userId, projectId);
  const v = instances.get(k);
  if (v) v.lastAccessed = Date.now();
}
