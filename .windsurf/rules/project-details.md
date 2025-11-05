---
trigger: always_on
---

Project Name: nixbuilder.dev

Goal:
Build a full-stack, chat-based AI platform where users can describe the app they want to build (e.g., “Build a SaaS with auth, pricing, and MongoDB”) — and the system automatically codes, previews, and deploys a complete Next.js full-stack application (frontend, backend, APIs, authentication, and database) in real-time — just like Lovable.

Core Tech Stack:
• Framework: Next.js v16 (App Router, full-stack rendering)
• Language: JavaScript (no TypeScript)
• Styling: SCSS modules (no Tailwind)
• Package Manager: npm
• AI Integration: OpenRouter APIs (Planner + Writer models) using Vercel AI SDK for streaming and structured outputs
• Database: MongoDB (Atlas) — official Node driver, using GridFS for generated file storage
• Preview Environment: Fly.io Machines (ephemeral micro-VMs to run the generated Next.js app with full Node runtime)
• Hosting: Vercel (main nixbuilder.dev app)
• Authentication: NextAuth.js (Credentials provider)
• Payments: Dodo Payments API (for user plans, credits, and subscriptions)
• Storage: Vercel Blob or MongoDB GridFS for generated app files

Core User Flow (Like Lovable): 1. Chat Interface:
• User enters: “Build a social app with auth and dashboard.”
• System responds by planning → coding → showing live progress (“Creating app/page.jsx… done ✅”). 2. Plan Phase:
• AI (Planner model) outputs a strict JSON plan describing the project structure (routes, components, APIs, dependencies, env vars). 3. Codegen Phase:
• AI (Writer model) uses tool-calling (emit_file, append_file, read_file, list_files) to generate every file in the Next.js project.
• Files are stored in a Virtual File System (VFS) (in-memory, then saved in GridFS). 4. Preview Phase:
• The generated VFS is bundled into a .tar.gz archive and deployed to Fly.io Machine.
• Machine runs npm install && npm run dev, exposing a live HTTPS preview URL.
• The system streams “Building preview…” → “Preview ready: https://.fly.dev”. 5. Edit / Regenerate Phase:
• Each file is editable inside a built-in Monaco editor.
• Users can click “Regenerate this file” → LLM rewrites that file via tool-calls. 6. Export / Deploy Phase:
• “Export ZIP” → bundles current VFS to downloadable zip.
• “Deploy to Vercel” → uses Vercel Deployments API for permanent hosting.

Backend APIs to Implement:
• /api/chat → orchestrates LLM planning + generation (streams progress via SSE).
• /api/vfs → handles virtual filesystem CRUD (get/set/list files).
• /api/preview/start → bundles VFS → uploads → spins Fly Machine → returns preview URL.
• /api/preview/reload → redeploys updated tarball.
• /api/preview/stop → shuts down Fly Machine.
• /api/export → zips and streams the generated project.
• /api/files/[...path] → CRUD endpoints for file editing.
• /api/projects → manage user projects (save, rename, clone, delete).
• /api/payments → integrate Dodo Payments for credit and subscription plans.

Preview Runner (Fly.io Microservice):
• Dockerfile: Node 20 + npm
• Entry script (init.sh): downloads .tar.gz, writes .env, installs deps, and runs npm run dev.
• Environment Variables:
• MONGODB_URI, NEXTAUTH_SECRET, TARBALL_URL, PREVIEW_MODE=dev
• Auto-shutdown after 10 min idle (for cost control).

OpenRouter AI Flow (via Vercel AI SDK):
• Planner model: response_format: { type: "json_object" } → generates structured Plan JSON.
• Writer model: uses tools (emit_file, append_file, read_file, list_files) with parallel_tool_calls: true → generates files.
• Prompt rules:
• Language: pure JS (no TS)
• Styling: SCSS modules
• Framework: Next.js App Router
• Package Manager: npm
• Keep dependencies minimal (allowlist): next, react, react-dom, mongodb, next-auth, zod, scss, autoprefixer, bcryptjs, zustand (optional)
• Temperature: 0.1–0.2 for deterministic code.

MongoDB Schema:
• projects: { \_id, userId, name, createdAt, updatedAt, planJson, runnerId, previewUrl }
• files: { projectId, path, size, sha, contents } (contents in GridFS)
• builds: { projectId, model, tokensUsed, time, cost, status }
• users: { email, passwordHash, credits, plan }
• payments: { userId, plan, amount, status } (linked with Dodo Payments)

App Pages:
• /app/(studio)/studio → chat interface (real-time plan + build + logs).
• /app/(studio)/editor → Monaco editor, preview iframe, deploy/export buttons.
• /app/auth/login and /app/auth/register → user authentication.
• /app/dashboard → saved projects + build history.

UI / UX Design:
• No Tailwind. Use SCSS modules with modern minimalist layout.
• Simple dark/light toggle.
• Chat area with typewriter effect for AI responses.
• Progress panel (Planning → Generating → Previewing → Done).
• Editor panel with file tree + code view.
• Toast notifications for build progress and preview readiness.

Deployment Setup:
• Main App: Deployed to Vercel.
• Preview Runners: Managed on Fly.io Machines via API.
• Database: MongoDB Atlas (M0 free tier initially).
• Object Storage: Vercel Blob (for tarballs).

Final Outcome:
nixbuilder.dev will be an AI-powered Lovable-style builder that autonomously plans, codes, and previews complete Next.js full-stack MVPs in real-time — with working authentication, backend APIs, and MongoDB — all integrated with OpenRouter LLMs and Fly.io ephemeral previews, monetized via Dodo Payments.
