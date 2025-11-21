import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../auth";
import { E2BSandboxProvider } from "../../../../../lib/sandbox/e2b";
import {
  getSandbox,
  setSandbox,
  touch,
} from "../../../../../lib/sandbox/manager";

function computeCSP() {
  const allowOrigins =
    process.env.PREVIEW_FRAME_ORIGINS ||
    "http://localhost:3000 https://localhost:3000 https://nixbuilder.dev http://nixbuilder.dev";
  return `frame-ancestors 'self' ${allowOrigins}`;
}

// Remove invalid deps accidentally inferred from local aliases or bad names
function sanitizeInvalidDeps(files) {
  const out = { ...files };
  if (!out["package.json"]) return out;
  try {
    const pkg = JSON.parse(out["package.json"] || "{}");
    const clean = (obj = {}) => {
      const result = {};
      for (const [name, ver] of Object.entries(obj)) {
        const hasUpper = /[A-Z]/.test(name);
        const aliasPrefixes = ["@components", "@lib", "@utils", "@", "@app"];
        const isAlias = aliasPrefixes.some(
          (p) => name === p || name.startsWith(p + "/")
        );
        if (hasUpper || isAlias) continue; // drop invalid
        result[name] = ver;
      }
      return result;
    };
    pkg.dependencies = clean(pkg.dependencies);
    pkg.devDependencies = clean(pkg.devDependencies);
    out["package.json"] = JSON.stringify(pkg, null, 2);
  } catch {}
  return out;
}

// Auto-add missing dependencies based on import/require usage in JS files
function ensureDependenciesFromImports(files) {
  const out = { ...files };
  const pkg = out["package.json"]
    ? JSON.parse(out["package.json"])
    : { dependencies: {}, devDependencies: {} };
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};

  const nodeCore = new Set([
    "fs",
    "path",
    "url",
    "crypto",
    "http",
    "https",
    "os",
    "util",
    "stream",
    "zlib",
    "events",
    "buffer",
    "assert",
    "timers",
    "child_process",
    "process",
  ]);
  const ignore = new Set(["next", "react", "react-dom"]);

  const imported = new Set();
  const importRegex = /import\s+[^'"\n]*from\s*["']([^"']+)["']/g;
  const requireRegex = /require\(\s*["']([^"']+)["']\s*\)/g;

  // Collect top-level folders to help recognize common alias targets
  const topDirs = new Set(
    Object.keys(out)
      .map((p) => String(p))
      .filter((p) => p.includes("/"))
      .map((p) => p.split("/")[0])
  );

  // Load declared aliases from jsconfig.json if present
  const declaredAliases = new Set();
  try {
    if (out["jsconfig.json"]) {
      const js = JSON.parse(out["jsconfig.json"] || "{}");
      const paths = (js.compilerOptions && js.compilerOptions.paths) || {};
      for (const key of Object.keys(paths)) {
        // normalize keys like '@components/*' -> '@components'
        declaredAliases.add(key.replace(/\/*\*?$/, ""));
      }
    }
  } catch {}

  for (const [path, content] of Object.entries(out)) {
    if (!/\.(js|jsx|mjs|cjs)$/i.test(path)) continue;
    const code = String(content || "");
    let m;
    while ((m = importRegex.exec(code))) imported.add(m[1]);
    while ((m = requireRegex.exec(code))) imported.add(m[1]);
  }

  for (const spec of imported) {
    if (spec.startsWith(".") || spec.startsWith("/") || spec.includes(":"))
      continue; // local or protocol
    if (spec.startsWith("@types/")) continue;
    if (ignore.has(spec)) continue;
    if (nodeCore.has(spec)) continue;
    // Heuristic: treat '@<alias>/...' as local alias if top-level dir exists
    if (spec.startsWith("@")) {
      const parts = spec.split("/");
      const aliasBase = parts[0]; // e.g. '@components'
      const after = parts.slice(1).join("/");
      const candidateDirs = [
        "components",
        "lib",
        "utils",
        "styles",
        "src",
        "app",
        "hooks",
        "store",
      ];
      const looksLikeAlias =
        declaredAliases.has(aliasBase) ||
        aliasBase === "@" ||
        candidateDirs.some((d) => topDirs.has(d)) ||
        /^[A-Za-z0-9_-]+$/.test(aliasBase.slice(1));
      if (looksLikeAlias) {
        // Do not add as dependency; alias will be resolved via jsconfig
        continue;
      }
    }
    // scoped subpath imports like `package/sub`: depend on base
    const base = spec.split("/")[0].startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    const name = base;
    if (!pkg.dependencies[name] && !pkg.devDependencies[name]) {
      // default to dependencies with latest; preview-only resolution
      pkg.dependencies[name] = "latest";
    }
  }

  out["package.json"] = JSON.stringify(pkg, null, 2);
  return out;
}

// Ensure jsconfig.json has path aliases for common patterns used by generated code
function ensureJSConfigPaths(files) {
  const out = { ...files };
  const js = out["jsconfig.json"]
    ? JSON.parse(out["jsconfig.json"])
    : { compilerOptions: { baseUrl: ".", paths: {} } };
  js.compilerOptions = js.compilerOptions || { baseUrl: ".", paths: {} };
  js.compilerOptions.baseUrl = js.compilerOptions.baseUrl || ".";
  js.compilerOptions.paths = js.compilerOptions.paths || {};

  const hasDir = (d) => Object.keys(out).some((p) => p.startsWith(`${d}/`));

  if (hasDir("components") && !js.compilerOptions.paths["@components/*"]) {
    js.compilerOptions.paths["@components/*"] = ["components/*"];
  }
  if (hasDir("lib") && !js.compilerOptions.paths["@lib/*"]) {
    js.compilerOptions.paths["@lib/*"] = ["lib/*"];
  }
  if (hasDir("utils") && !js.compilerOptions.paths["@utils/*"]) {
    js.compilerOptions.paths["@utils/*"] = ["utils/*"];
  }
  if (hasDir("src") && !js.compilerOptions.paths["@/*"]) {
    js.compilerOptions.paths["@/*"] = ["src/*"];
  }

  out["jsconfig.json"] = JSON.stringify(js, null, 2);
  return out;
}

// Ensure files that import client-only libraries are marked as client components
function ensureClientComponentsForImports(files) {
  const out = { ...files };
  const clientOnlyImports = [
    "@hello-pangea/dnd",
    "react-beautiful-dnd",
    "framer-motion",
    "react-dnd",
    "@dnd-kit/core",
  ];
  const importRegexes = clientOnlyImports.map((name) => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `from\\s+["']${esc}["']|require\\(\\s*["']${esc}["']\\s*\\)`,
      "g"
    );
  });

  for (const path of Object.keys(out)) {
    if (!/\.(js|jsx|mjs|cjs)$/i.test(path)) continue;
    const code = String(out[path] || "");
    const hasClientDirective = /^\s*["']use client["'];?/.test(code);
    const importsClientOnly = importRegexes.some((re) => re.test(code));
    if (importsClientOnly && !hasClientDirective) {
      out[path] = `'use client';\n` + code;
    }
  }
  return out;
}

function injectPreviewHeaders(files) {
  const out = { ...files };
  const cspValue = computeCSP();

  // Inject headers() into next.config.mjs if missing
  if (out["next.config.mjs"]) {
    let cfg = out["next.config.mjs"];
    const hasHeaders = /headers\s*\(/.test(cfg) || /headers:\s*\(/.test(cfg);
    const hasFrameAncestors = /frame-ancestors/i.test(cfg);
    if (!hasFrameAncestors) {
      if (/export\s+default\s*\{/.test(cfg)) {
        cfg = cfg.replace(
          /export\s+default\s*\{/,
          (m) =>
            `${m}\n  async headers() {\n    return [\n      {\n        source: '/:path*',\n        headers: [\n          { key: 'Content-Security-Policy', value: '${cspValue}' },\n          { key: 'X-Frame-Options', value: 'ALLOWALL' }\n        ]\n      }\n    ];\n  },`
        );
      } else if (!/export\s+default/.test(cfg)) {
        cfg += `\n\n/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  async headers() {\n    return [\n      {\n        source: '/:path*',\n        headers: [\n          { key: 'Content-Security-Policy', value: '${cspValue}' },\n          { key: 'X-Frame-Options', value: 'ALLOWALL' }\n        ]\n      }\n    ];\n  },\n};\n\nexport default nextConfig;\n`;
      }
      out["next.config.mjs"] = cfg;
    }
  }

  // Always inject a preview-safe middleware that sets CSP/iframe headers and bypasses any auth redirects
  out["middleware.js"] = `import { NextResponse } from 'next/server';

export function middleware(req) {
  // In preview, do not block or redirect any routes; just set headers
  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'ALLOWALL');
  res.headers.set("Content-Security-Policy", "${cspValue}");
  return res;
}

export const config = { matcher: ['/:path*'] };`;

  return out;
}

// Preview-time compatibility sanitizer
// - Replaces deprecated/incompatible libs with React 19-compatible alternatives
// - Driven by a mapping so it works for many cases without special-casing code elsewhere
function sanitizePackagesAndImports(files) {
  const out = { ...files };
  // Map of package name -> replacement
  const compatMap = {
    "react-beautiful-dnd": "@hello-pangea/dnd",
  };
  try {
    if (out["package.json"]) {
      const pkg = JSON.parse(out["package.json"] || "{}");
      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      let changed = false;

      for (const [from, to] of Object.entries(compatMap)) {
        if (deps[from]) {
          delete deps[from];
          deps[to] = deps[to] || "latest";
          changed = true;
        }
        if (devDeps[from]) {
          delete devDeps[from];
          devDeps[to] = devDeps[to] || "latest";
          changed = true;
        }
      }

      if (changed) {
        pkg.dependencies = deps;
        pkg.devDependencies = devDeps;
        out["package.json"] = JSON.stringify(pkg, null, 2);
      }
    }

    // Rewrite imports in JS files
    const replaceImport = (code) => {
      let outCode = String(code);
      for (const [from, to] of Object.entries(compatMap)) {
        const fromEsc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        outCode = outCode
          .replace(
            new RegExp(`from\\s+["']${fromEsc}["']`, "g"),
            `from '${to}'`
          )
          .replace(
            new RegExp(`require\\(\\s*["']${fromEsc}["']\\s*\\)`, "g"),
            `require('${to}')`
          );
      }
      return outCode;
    };

    for (const path of Object.keys(out)) {
      if (/\.(js|jsx|mjs|cjs)$/i.test(path)) {
        try {
          const before = out[path];
          const after = replaceImport(String(before));
          if (after !== before) out[path] = after;
        } catch {}
      }
    }
  } catch {}
  return out;
}

function ensurePackageJson(files) {
  const out = { ...files };
  const defaultPkg = {
    name: "nextjs-app",
    version: "1.0.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: {
      next: "^14.2.10",
      react: "^18.2.0",
      "react-dom": "^18.2.0",
    },
  };

  if (!out["package.json"]) {
    out["package.json"] = JSON.stringify(defaultPkg, null, 2);
    return out;
  }

  try {
    const pkg = JSON.parse(out["package.json"] || "{}");
    pkg.scripts = pkg.scripts || {};
    if (!pkg.scripts.dev) pkg.scripts.dev = "next dev";
    pkg.dependencies = pkg.dependencies || {};
    if (!pkg.dependencies.next) pkg.dependencies.next = "^14.2.10";
    if (!pkg.dependencies.react) pkg.dependencies.react = "^18.2.0";
    if (!pkg.dependencies["react-dom"])
      pkg.dependencies["react-dom"] = "^18.2.0";
    out["package.json"] = JSON.stringify(pkg, null, 2);
  } catch {
    out["package.json"] = JSON.stringify(defaultPkg, null, 2);
  }
  return out;
}

// Force preview framework versions for compatibility (Next 14 + React 18)
function ensurePreviewFrameworkVersions(files) {
  const out = { ...files };
  if (!out["package.json"]) return out;
  try {
    const pkg = JSON.parse(out["package.json"] || "{}");
    pkg.dependencies = pkg.dependencies || {};
    pkg.devDependencies = pkg.devDependencies || {};
    pkg.dependencies.next = "^14.2.10";
    pkg.dependencies.react = "^18.2.0";
    pkg.dependencies["react-dom"] = "^18.2.0";
    out["package.json"] = JSON.stringify(pkg, null, 2);
  } catch {}
  return out;
}

function ensurePreviewBypass(files) {
  const out = { ...files };
  // Stub /api/auth/session to avoid next-auth client JSON parse errors when next-auth isn't configured
  const sessionRouteSrc = "src/app/api/auth/session/route.js";
  const sessionRouteRoot = "app/api/auth/session/route.js";
  if (!out[sessionRouteSrc] && !out[sessionRouteRoot]) {
    out[
      sessionRouteSrc
    ] = `export async function GET() {\n  return Response.json(null);\n}\n`;
  }

  // Ensure a root page exists so preview / doesn't 404
  if (!out["src/app/page.jsx"] && !out["app/page.jsx"]) {
    out[
      "src/app/page.jsx"
    ] = `export default function Page() {\n  return (\n    <main style={{padding:'24px',fontFamily:'sans-serif'}}>\n      <h1>Preview Running</h1>\n      <p>This is a fallback page rendered during preview.</p>\n    </main>\n  );\n}\n`;
  }

  // Ensure a basic layout if missing
  if (!out["src/app/layout.jsx"] && !out["app/layout.jsx"]) {
    out[
      "src/app/layout.jsx"
    ] = `export const metadata = { title: 'Preview' };\nexport default function RootLayout({ children }) {\n  return (\n    <html><body>{children}</body></html>\n  );\n}\n`;
  }
  return out;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { projectId, files = {} } = body || {};
    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }

    // Reuse or create sandbox per user+project
    let entry = getSandbox(session.user.email, projectId);
    let provider = entry?.provider;
    if (!provider) {
      provider = new E2BSandboxProvider();
      await provider.createSandbox();
      setSandbox(session.user.email, projectId, provider);
    }

    // Prepare files with preview headers/middleware and write
    let filesWithHeaders = injectPreviewHeaders(files);
    filesWithHeaders = ensurePreviewBypass(filesWithHeaders);
    // Ensure package.json & dev script exist so next is available
    filesWithHeaders = ensurePackageJson(filesWithHeaders);
    // Apply preview-time compatibility fixes for known problematic libs
    filesWithHeaders = sanitizePackagesAndImports(filesWithHeaders);
    // Force framework versions for preview compatibility (Next 14 + React 18)
    filesWithHeaders = ensurePreviewFrameworkVersions(filesWithHeaders);
    // Ensure any imported packages are present in package.json for preview install
    filesWithHeaders = ensureDependenciesFromImports(filesWithHeaders);
    // Drop invalid deps accidentally inferred from local aliases
    filesWithHeaders = sanitizeInvalidDeps(filesWithHeaders);
    // Ensure client-only imports are marked with 'use client' so interactivity works
    filesWithHeaders = ensureClientComponentsForImports(filesWithHeaders);
    // Add jsconfig path aliases if needed so local aliases resolve during preview
    filesWithHeaders = ensureJSConfigPaths(filesWithHeaders);
    await provider.writeFiles(filesWithHeaders);

    // Install dependencies, start dev server
    const install = await provider.installDependencies();
    if (!install || install.exitCode !== 0) {
      const logs = `${install?.stdout || ""}\n${install?.stderr || ""}`.trim();
      throw new Error(
        `npm install failed with exit code ${
          install?.exitCode ?? "unknown"
        }\n${logs}`
      );
    }
    await provider.startDevServer();

    const info = provider.getInfo();
    touch(session.user.email, projectId);

    return Response.json({
      success: true,
      sandboxId: info.sandboxId,
      url: info.url,
      state: info.state,
    });
  } catch (error) {
    console.error("[Preview Start] Error:", error);
    return Response.json(
      { error: error.message || "Failed to start preview" },
      { status: 500 }
    );
  }
}
