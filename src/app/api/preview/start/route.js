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

function ensurePackageJson(files) {
  const out = { ...files };
  const defaultPkg = {
    name: "nextjs-app",
    version: "1.0.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: {
      next: "16.0.1",
      react: "19.2.0",
      "react-dom": "19.2.0",
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
    if (!pkg.dependencies.next) pkg.dependencies.next = "16.0.1";
    if (!pkg.dependencies.react) pkg.dependencies.react = "19.2.0";
    if (!pkg.dependencies["react-dom"])
      pkg.dependencies["react-dom"] = "19.2.0";
    out["package.json"] = JSON.stringify(pkg, null, 2);
  } catch {
    out["package.json"] = JSON.stringify(defaultPkg, null, 2);
  }
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
