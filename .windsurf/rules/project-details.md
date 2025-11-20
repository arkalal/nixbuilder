Project Name: nixbuilder.dev

⸻

High-level Goal

Build a Lovable-style AI app builder where users describe the app they want in a chat interface, and nixbuilder.dev automatically: 1. Plans the app 2. Generates a full Next.js 16 full-stack codebase 3. Spins up a live preview sandbox using Fly.io 4. Lets users test the app end-to-end (auth, backend, MongoDB, UI) 5. Allows editing, regenerating, exporting, and deploying

We want to use the architecture of firecrawl/open-lovable as a reference only (workflow, concepts, env structure, sandbox idea), but implement our own codebase and architecture tailored to our tech stack and business logic.

⸻

Tech Stack (hard requirements)
• Framework: Next.js v16, App Router, full-stack features
• Language: JavaScript only (no TypeScript)
• Components: JSX (React)
• Styling: SCSS / SCSS modules (no Tailwind)
• Package manager: npm (not pnpm or yarn)

AI Integration
• OpenRouter as the LLM provider
• Use Vercel AI SDK (ai / @ai-sdk/\*) to call OpenRouter
• Supports: streaming responses, tool calling, JSON mode

Database & Storage
• MongoDB Atlas (official Node driver)
• Use MongoDB / GridFS to store generated project files as a Virtual File System (VFS)

Auth
• NextAuth.js (Credentials provider is fine for v1)

Payments
• Dodo Payments for:
• Subscriptions (e.g. $20/month)
• Usage top-ups for LLM credits

Preview Sandbox
• e2b Machines as the sandbox provider for live previews

Hosting
• Main nixbuilder.dev app hosted on Vercel

⸻

Architecture Inspiration (from open-lovable)

Use this repo as reference:
• https://github.com/firecrawl/open-lovable

Take inspiration from:
• The idea: prompt → plan → generate code → run in sandbox → preview link
• The environment variable structure (SANDBOX_PROVIDER, sandbox provider keys, etc.)
• The notion of a “sandbox provider” abstraction (we’ll implement ours around Fly.io)

Important: Use open-lovable as conceptual and architectural reference (pipeline, env patterns, organization). We implement our own code.

⸻

Core Features to Implement

1. Chat-based builder (Lovable-style flow)
   • Route: /app/(studio)/studio/page.jsx
   • Features:
   • Chat UI where user prompts:
   “Build a SaaS with auth, pricing, dashboard, and MongoDB backend.”
   • Visible stages: Planning → Generating → Previewing → Done
   • Messages stream from the AI (Vercel AI SDK + OpenRouter)
   • Activity log items like:
   • “Created app/layout.jsx”
   • “Generated app/api/auth/[…nextauth]/route.js”

⸻

2. Planning Phase (Plan JSON)
   • First call a Planner LLM through OpenRouter using Vercel AI SDK.
   • Output must be strict JSON describing the app:
   • Routes:
   • { path, type: "page" | "api" | "layout", description }
   • Files:
   • { path, kind: "page" | "component" | "lib" | "api" | "config" | "schema" | "util", purpose }
   • Dependencies: frontend + backend npm packages
   • Env vars required: e.g. MONGODB_URI, NEXTAUTH_SECRET, etc.
   • Validate the JSON plan in the backend (manual validation / simple schema in JS).

⸻

3. Codegen Phase (file generation via tools)
   • Use a Writer LLM via OpenRouter + Vercel AI SDK with tool calling.

Tools the model can call:
• emit_file(path: string, contents: string)
• append_file(path: string, contents: string)
• read_file(path: string)
• list_files()

Implement these tools on the server in Next.js route handlers.

Virtual File System (VFS):
• In-memory map for fast generation
• Backed by MongoDB / GridFS for persistence across sessions and users

The AI must generate a full Next.js 16 project using:
• JSX (+ plain JS), not TypeScript
• SCSS / SCSS modules for styling
• npm scripts (npm install, npm run dev, npm run build)

Required base files AI should create:
• package.json
• next.config.mjs
• jsconfig.json (for JS path aliases)
• .env.example
• app/layout.jsx, app/page.jsx
• app/(auth)/login/page.jsx, app/(auth)/register/page.jsx
• app/dashboard/page.jsx (protected route)
• app/api/auth/[...nextauth]/route.js (NextAuth config)
• lib/db.js (MongoDB client with connection caching)
• styles/global.scss + SCSS modules for main components
• README.md with basic “npm install && npm run dev” instructions

⸻

4. Sandbox / Preview (e2b)

We will use e2b as the sandbox provider for live previews.

⸻

5. File Editor & Export
   • Route: /app/(studio)/editor/page.jsx

Features:
• File tree populated from VFS (paths read from MongoDB)
• Monaco-style editor with JS / JSX / SCSS syntax highlighting
• Edit & save files back to VFS via /api/files/[...path]
• “Regenerate this file” button:
• Sends current file + instructions to Writer LLM
• LLM emits a new version via emit_file for that path
• “Export ZIP”:
• Backend packs VFS into a ZIP archive and streams it for download
• “Deploy to Vercel” (later):
• Use Vercel Deployments API to create a production deployment from the generated code

⸻

6. Auth & Payments (Dodo)

Auth
• Use NextAuth.js with google authentication
• Protect routes:
• /app/dashboard
• /app/(studio)/\*

Payments – Dodo
• Handle:
• Subscription to base plan (e.g. $20/month)
• Additional LLM usage credit top-ups (sold at cost, no margin)

On subscription start:
• user.baseSubscriptionActive = true
• user.creditBalance = 10 (this is the $10 usage credit portion dedicated to LLM/API cost)

LLM cost tracking:
• Track tokens used per model (Claude Sonnet 3.7, Sonnet 4.5, GPT-5)
• Compute cost per call (based on price per 1K tokens)
• Deduct from user.creditBalance
• When creditBalance <= 0:
• Block heavy builds / regenerations
• Show “Top up credits via Dodo Payments”

⸻

7. LLM Cost Model (Business Logic)
   • Every user on the base plan pays $20/month:
   • $10 = fixed profit (software fee for nixbuilder.dev)
   • $10 = LLM usage credit (covers OpenRouter API costs; no margin)
   • Users can choose any model at any time:
   • Claude Sonnet 3.7
   • Claude Sonnet 4.5
   • GPT-5
   • For each build or regeneration:
   • Calculate actual OpenRouter API cost from tokens used and model price
   • Subtract that amount from creditBalance
   • When creditBalance <= 0:
   • Prevent new full builds or large regenerations
   • Show prompt to buy top-up credits via Dodo (1:1 cost, no markup)

For now we can stub model prices in config; just design the system to support per-model pricing and token logging.

⸻

Backend Endpoints to Implement (Next.js App Router)
• /api/chat
• Uses Vercel AI SDK + OpenRouter to orchestrate:
• Planning (JSON output)
• Codegen with tool-calls (emit_file, append_file, etc.)
• Streams progress events to frontend via SSE or similar:
• plan, file_write, preview_start, preview_ready, error
• /api/vfs
• Basic CRUD for virtual filesystem entries
• Works with an in-memory map + MongoDB/GridFS persistence
• /api/preview/start, /api/preview/status, /api/preview/stop
• Integrate with Fly.io Machines API (not E2B, not Vercel Sandbox) for sandbox lifecycle
• /api/export
• Streams a ZIP archive of the current VFS
• /api/files/[...path]
• GET: read file
• PUT: write/update file
• /api/projects
• CRUD for saved projects:
• { id, userId, name, createdAt, updatedAt, planJson, sandboxId, previewUrl }
• /api/payments
• Integrate Dodo Payments (webhooks, subscription creation, credit top-ups)
• Update user.baseSubscriptionActive and user.creditBalance accordingly

⸻

Key Constraints & Style
• Use Next.js 16 App Router with route handlers (no Pages Router)
• Use JS/JSX + SCSS, no TypeScript, no Tailwind
• Use npm in all scripts, docs, and generated projects
• Use OpenRouter via Vercel AI SDK for all LLM calls
• Use Fly.io as the sandbox provider (SANDBOX_PROVIDER=fly)
• Treat firecrawl/open-lovable only as conceptual reference for architecture & env, not as a direct codebase copy