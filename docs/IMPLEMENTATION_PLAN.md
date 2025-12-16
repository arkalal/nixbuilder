# 🚀 NixBuilder: Production-Grade AI App Builder Implementation Plan

> **Version:** 1.0  
> **Created:** December 15, 2024  
> **Status:** In Progress  
> **Goal:** Transform NixBuilder into a production-grade AI app builder comparable to Lovable.dev, Bolt.new, and v0.app

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Competitive Analysis](#competitive-analysis)
4. [Feature Comparison Matrix](#feature-comparison-matrix)
5. [Implementation Phases](#implementation-phases)
6. [Priority Summary](#priority-summary)
7. [Quick Wins](#quick-wins)
8. [Progress Tracking](#progress-tracking)

---

## Executive Summary

NixBuilder is an AI-powered app builder that enables users to create production-grade web applications through natural language prompts.

### Key Objectives

- Enable users to build **complex, multi-page production apps**
- Implement **agentic error recovery** for self-healing code generation
- Add **project persistence** and **version control**
- Integrate **one-click deployment** to production
- Provide **GitHub integration** for professional workflows

### Tech Stack

- **Frontend:** Next.js 16, React 18, JSX, SCSS
- **Backend:** Next.js API Routes, MongoDB
- **AI:** OpenRouter (Claude, GPT-4, etc.)
- **Sandbox:** Fly.io Machines
- **Auth:** NextAuth v4
- **Deployment Target:** Vercel

---

## Current Architecture Analysis

### ✅ What's Working Well

| Component            | Status  | Description                               |
| -------------------- | ------- | ----------------------------------------- |
| Chat Interface       | ✅ Done | SSE streaming with real-time updates      |
| Code Generation      | ✅ Done | File-by-file streaming with `<file>` tags |
| Live Preview         | ✅ Done | Fly.io sandbox with instant preview       |
| Code Editor          | ✅ Done | Syntax highlighting, file tabs            |
| Workbench UI         | ✅ Done | File generation progress display          |
| User Edit Protection | ✅ Done | Prevents AI from overwriting user edits   |
| Model Selection      | ✅ Done | OpenRouter integration, multiple models   |
| Conversation History | ✅ Done | Context for iterative edits               |

### ❌ Critical Gaps

| Gap                    | Impact                             | Priority    |
| ---------------------- | ---------------------------------- | ----------- |
| No Error Recovery      | Complex apps fail without auto-fix | 🔴 Critical |
| No Project Persistence | Work lost on refresh               | 🔴 Critical |
| No Version Control     | Can't undo AI mistakes             | 🔴 Critical |
| No Deployment Pipeline | Can't ship to production           | 🟠 High     |
| No GitHub Integration  | No professional workflow           | 🟠 High     |
| No Database Setup UI   | Manual Supabase/MongoDB config     | 🟠 High     |
| No Templates           | Cold start every time              | 🟡 Medium   |
| No Image Upload        | No vision AI for designs           | 🟡 Medium   |

---

## Competitive Analysis

### Lovable.dev

**Strengths:**

- Supabase integration with one-click database/auth setup
- GitHub two-way sync (changes sync bidirectionally)
- Multiplayer coding (real-time collaboration in v2)
- Smart context understanding of full project structure

**Tech Stack:** React, Tailwind, Vite, Supabase

### Bolt.new

**Strengths:**

- WebContainer (browser-based Node.js, no server needed)
- Multi-agent options (Claude Agent vs Legacy v1)
- Bolt Cloud (built-in hosting, database, custom domains)
- Figma/Stripe integrations

**Tech Stack:** Multi-framework support, WebContainer

### v0.app (Vercel)

**Strengths:**

- Agentic intelligence (plans, adjusts, improves automatically)
- Auto error checking (spots errors, compares implementations)
- Web inspection (can inspect live sites, take screenshots)
- Task management (tracks tasks, updates plans)

**Tech Stack:** React, Next.js, Vercel ecosystem

### Key Differentiators We Can Build

1. **Next.js + SCSS Focus** - Opinionated stack for production apps
2. **MongoDB Native** - First-class MongoDB support (vs Supabase-only)
3. **Fly.io Sandbox** - Full VM capabilities (not just WebContainer)
4. **Better Error Recovery** - More sophisticated auto-fix loop

---

## Feature Comparison Matrix

| Feature              | Lovable | Bolt | v0  | NixBuilder (Current) | NixBuilder (Target) |
| -------------------- | ------- | ---- | --- | -------------------- | ------------------- |
| Code Generation      | ✅      | ✅   | ✅  | ✅                   | ✅                  |
| Live Preview         | ✅      | ✅   | ✅  | ✅                   | ✅                  |
| Streaming Output     | ✅      | ✅   | ✅  | ✅                   | ✅                  |
| Error Auto-Fix       | ✅      | ⚠️   | ✅  | ✅                   | ✅                  |
| Project Persistence  | ✅      | ✅   | ✅  | ❌                   | ✅                  |
| Version Control      | ✅      | ✅   | ✅  | ❌                   | ✅                  |
| Database Integration | ✅      | ✅   | ✅  | ⚠️                   | ✅                  |
| One-Click Deploy     | ✅      | ✅   | ✅  | ❌                   | ✅                  |
| GitHub Integration   | ✅      | ✅   | ✅  | ❌                   | ✅                  |
| Image Upload         | ✅      | ✅   | ✅  | ❌                   | ✅                  |
| Multiplayer          | ✅      | ❌   | ❌  | ❌                   | 🔮 Future           |
| Templates            | ✅      | ✅   | ✅  | ❌                   | ✅                  |
| Mobile Export        | ❌      | ✅   | ❌  | ❌                   | 🔮 Future           |
| Custom Domains       | ✅      | ✅   | ✅  | ❌                   | ✅                  |

---

## Implementation Phases

### Phase 1: Critical Foundations (Weeks 1-3)

> **Goal:** Enable complex multi-page apps that don't fail on first error

#### 1.1 Error Recovery System (Week 1) ✅ COMPLETED

**Priority:** 🔴 CRITICAL  
**Estimated Effort:** 5 days  
**Status:** ✅ FULLY COMPLETED

**What Was Built:**

- Error capture from sandbox (npm, build, runtime errors)
- Error parser (stack trace → structured data with suggestions)
- Recovery loop (generate fix → retry up to 3 times)
- API endpoints for validation and auto-fix
- UI components with auto-fix button
- LogsPanel integration with expandable error details
- Studio page integration with error state management

**Files Created:**

- `lib/agent/errorCapture.js`
- `lib/agent/errorParser.js`
- `lib/agent/recoveryLoop.js`
- `lib/agent/index.js`
- `src/app/api/preview/validate/route.js`
- `src/app/api/preview/fix/route.js`
- `src/app/api/studio/files/route.js`
- `components/Studio/ErrorDisplay/ErrorDisplay.js`
- `components/Studio/ErrorDisplay/ErrorDisplay.module.scss`

**Error Types Captured:**
| Error Type | Source | Detection Method |
|------------|--------|------------------|
| NPM Install | npm install stderr | Parse "ERR!" messages |
| Compilation | Next.js build | Parse "Failed to compile" |
| Runtime | Browser console | Inject error handler |
| Hydration | React SSR | Parse "Hydration failed" |
| Import | Module resolution | Parse "Cannot find module" |

---

#### 1.2 Project Persistence (Week 1-2)

**Priority:** 🔴 CRITICAL  
**Estimated Effort:** 4 days  
**Status:** ⬜ Pending

**What to Build:**

- Project MongoDB schema with files, settings, messages
- API routes for CRUD operations
- Auto-save logic (debounced 2 seconds)
- Project list page showing all user's projects
- Load project on studio mount

**Key Features:**

- Save projects to MongoDB automatically
- Projects load on page refresh
- Create/rename/delete projects
- Conversation history persists
- Environment variables stored securely

---

#### 1.3 Version Control / Undo System (Week 2-3)

**Priority:** 🔴 CRITICAL  
**Estimated Effort:** 4 days  
**Status:** ⬜ Pending

**What to Build:**

- ProjectVersion MongoDB schema
- Auto-create versions after each AI generation
- Version history UI panel with timeline
- Diff viewer showing what changed
- Restore to any previous version

**When Versions Are Created:**
| Trigger | When | Message Format |
|---------|------|----------------|
| ai_generation | After each successful AI response | "AI: {first 50 chars of prompt}" |
| user_edit | When user edits file (debounced 30s) | "User edit: {filename}" |
| manual_save | User clicks "Save Version" | User-provided message |
| pre_deploy | Before deployment | "Pre-deployment snapshot" |

**Keyboard Shortcuts:**

- `Cmd/Ctrl + Z` - Undo to previous version
- `Cmd/Ctrl + Shift + Z` - Redo

---

### Phase 2: Deployment & Integrations (Weeks 4-6)

#### 2.1 One-Click Deployment to Vercel (Week 4)

**Priority:** 🟠 HIGH  
**Estimated Effort:** 4 days  
**Status:** ⬜ Pending

**What to Build:**

- Vercel API integration
- Deploy modal UI with status tracking
- Environment variables management
- Deployment history in project settings
- Build logs display

---

#### 2.2 GitHub Integration (Week 5)

**Priority:** 🟠 HIGH  
**Estimated Effort:** 5 days  
**Status:** ⬜ Pending

**What to Build:**

- GitHub OAuth provider in NextAuth
- Push to GitHub (create repo, push code)
- Import from GitHub (clone existing repo)
- Two-way sync (changes sync bidirectionally)
- Sync status UI

---

#### 2.3 Database Integration Helper (Week 6)

**Priority:** 🟠 HIGH  
**Estimated Effort:** 3 days  
**Status:** ⬜ Pending

**What to Build:**

- Supabase quick setup wizard
- MongoDB connection helper
- Auto-generate schema from prompts
- Credential injection UI

---

### Phase 3: Enhanced UX (Weeks 7-9)

#### 3.1 Template System (Week 7)

**Priority:** 🟡 MEDIUM  
**Estimated Effort:** 3 days  
**Status:** ⬜ Pending

**Starter Templates:**
| Template | Description | Includes |
|----------|-------------|----------|
| Blank | Empty Next.js project | Basic structure only |
| Landing Page | Marketing site | Hero, Features, CTA, Footer |
| Auth Starter | Login/Signup system | NextAuth, User model, Dashboard |
| SaaS Dashboard | Admin panel | Sidebar, Charts, Tables |
| E-commerce | Product store | Products, Cart, Checkout |
| Blog | Content site | Posts, MDX, Categories |
| Portfolio | Personal site | Projects, About, Contact |
| API Backend | REST API | Routes, Models, Auth |

---

#### 3.2 Image-to-Code (Week 8)

**Priority:** 🟡 MEDIUM  
**Estimated Effort:** 3 days  
**Status:** ⬜ Pending

**What to Build:**

- Image upload UI
- Vision AI integration (Claude 3.5 Sonnet)
- AI analyzes and describes UI components
- Generates matching React/SCSS code
- Side-by-side comparison preview

---

#### 3.3 Enhanced Code Editor (Week 9)

**Priority:** 🟡 MEDIUM  
**Estimated Effort:** 4 days  
**Status:** ⬜ Pending

**Features to Add:**

- File search (`Cmd+P`)
- Symbol search (`Cmd+Shift+O`)
- Multi-cursor editing
- Diff view before applying AI changes
- Inline error highlights
- Code folding
- Minimap

---

### Phase 4: Scale & Polish (Weeks 10-12)

#### 4.1 Usage Metering (Week 10)

**Priority:** 🟢 LOW  
**Estimated Effort:** 4 days  
**Status:** ⬜ Pending

**Metrics to Track:**

- Messages per user per month
- Sandbox minutes used
- Storage used (project files)
- Deployments

**Pricing Tiers:**
| Tier | Messages | Sandbox | Storage | Deploy | Price |
|------|----------|---------|---------|--------|-------|
| Free | 50/mo | 30 min/day | 100MB | 1 | $0 |
| Pro | 500/mo | Unlimited | 5GB | 10 | $20/mo |
| Team | 2000/mo | Unlimited | 20GB | Unlimited | $50/mo |

---

#### 4.2 Security Hardening (Week 11)

**Priority:** 🟢 LOW  
**Estimated Effort:** 3 days  
**Status:** ⬜ Pending

**Measures to Implement:**

- Rate limiting (per-user API limits)
- Input sanitization
- Sandbox network isolation
- Encrypted secrets storage
- CSRF protection
- Content Security Policy
- Audit logging

---

#### 4.3 Mobile & Polish (Week 12)

**Priority:** 🟢 LOW  
**Estimated Effort:** 3 days  
**Status:** ⬜ Pending

**What to Build:**

- Responsive studio layout
- Collapsible panels on mobile
- Touch-friendly editor
- Mobile preview mode
- Loading skeletons
- Smooth animations
- Error boundaries
- Accessibility (a11y)

---

## Priority Summary

### 🔴 Must Have (Launch Blockers)

| Feature             | Week | Effort | Status     |
| ------------------- | ---- | ------ | ---------- |
| Error Recovery Loop | 1    | 5 days | ✅ Done    |
| Project Persistence | 1-2  | 4 days | ⬜ Pending |
| Version Control     | 2-3  | 4 days | ⬜ Pending |

### 🟠 Should Have (Competitive Parity)

| Feature            | Week | Effort | Status     |
| ------------------ | ---- | ------ | ---------- |
| Vercel Deployment  | 4    | 4 days | ⬜ Pending |
| GitHub Integration | 5    | 5 days | ⬜ Pending |
| Database Helper    | 6    | 3 days | ⬜ Pending |

### 🟡 Nice to Have (Differentiation)

| Feature             | Week | Effort | Status     |
| ------------------- | ---- | ------ | ---------- |
| Templates           | 7    | 3 days | ⬜ Pending |
| Image-to-Code       | 8    | 3 days | ⬜ Pending |
| Editor Enhancements | 9    | 4 days | ⬜ Pending |

### 🟢 Future (Post-Launch)

| Feature                   | Notes                             |
| ------------------------- | --------------------------------- |
| Multiplayer Collaboration | Requires WebSocket infrastructure |
| Mobile App Export         | Expo/React Native integration     |
| Custom Domains            | DNS management                    |
| AI Model Fine-tuning      | Custom training on user patterns  |

---

## Quick Wins

**Implement This Week (Low Effort, High Impact):**

1. ⬜ **Error Display** - Show sandbox errors clearly in logs panel
2. ⬜ **Keyboard Shortcuts** - `Cmd+Enter` to send, `Cmd+K` command palette
3. ⬜ **Loading States** - Better progress indicators
4. ⬜ **File Search** - Quick filter in file tree
5. ⬜ **Copy Code Button** - One-click copy file contents
6. ⬜ **Last Saved Indicator** - Show when project was last saved

---

## Progress Tracking

### Phase 1: Critical Foundations

- [x] **1.1 Error Recovery System** ✅ FULLY COMPLETED

  - [x] Error capture from sandbox (npm, build, runtime)
  - [x] Error parser (stack trace → structured data)
  - [x] Recovery loop (generate fix → retry)
  - [x] API endpoints for validation and auto-fix
  - [x] Updated preview/start with error capture
  - [x] UI components with auto-fix button
  - [x] LogsPanel integration with error display
  - [x] Studio page integration with error state management
  - [x] Files API for refreshing after fix

- [x] **1.1b Iterative Editing Robustness** ✅ COMPLETED

  - [x] Enhanced system prompt with style preservation rules
  - [x] Added holistic thinking and conflict detection instructions
  - [x] Smart context selection (files mentioned + paired SCSS)
  - [x] Complete file enforcement (no partial outputs)
  - [x] Created fix plan document: `docs/ITERATIVE_EDITING_FIX_PLAN.md`

- [x] **1.1c Advanced Editing Infrastructure** ✅ COMPLETED

  - [x] Diff-based editing system with surgical edits
    - `lib/diff/diffParser.js` - Parse search/replace, unified diff, patch formats
    - `lib/diff/diffApplier.js` - Apply edits with fuzzy matching and rollback
    - `lib/diff/index.js` - Main exports
  - [x] File dependency graph system
    - `lib/services/dependencyGraph.js` - Track imports/exports between files
    - Auto-detect JSX ↔ SCSS pairings
    - Impact assessment for edits
  - [x] AI-powered context selection
    - `lib/services/contextSelector.js` - Smart file selection based on message
    - Relevance scoring algorithm
    - Keyword and topic extraction
  - [x] Chat summary system for long conversations
    - `lib/services/chatSummary.js` - Summarize older messages to save tokens
    - AI-powered summarization with fallback
    - Topic and project info extraction
  - [x] Integrated all systems with chat API route

- [ ] **1.2 Project Persistence**

  - [ ] Project MongoDB schema
  - [ ] API routes (CRUD)
  - [ ] Auto-save logic
  - [ ] Project list page
  - [ ] Load project on studio mount

- [ ] **1.3 Version Control**
  - [ ] ProjectVersion schema
  - [ ] Auto-create versions
  - [ ] Version history UI
  - [ ] Diff viewer
  - [ ] Restore functionality
  - [ ] Keyboard shortcuts

### Phase 2: Deployment & Integrations

- [ ] **2.1 Vercel Deployment**

  - [ ] Vercel API integration
  - [ ] Deploy modal UI
  - [ ] Environment variables
  - [ ] Deployment status tracking

- [ ] **2.2 GitHub Integration**

  - [ ] GitHub OAuth
  - [ ] Push to GitHub
  - [ ] Import from GitHub
  - [ ] Sync status UI

- [ ] **2.3 Database Helper**
  - [ ] Supabase setup wizard
  - [ ] MongoDB connection helper
  - [ ] Auto-generate schema

### Phase 3: Enhanced UX

- [ ] **3.1 Templates**

  - [ ] Template data structure
  - [ ] Template gallery UI
  - [ ] Use template flow

- [ ] **3.2 Image-to-Code**

  - [ ] Image upload UI
  - [ ] Vision AI integration
  - [ ] Side-by-side preview

- [ ] **3.3 Editor Enhancements**
  - [ ] File search
  - [ ] Symbol search
  - [ ] Diff view
  - [ ] Error highlights

### Phase 4: Scale & Polish

- [ ] **4.1 Usage Metering**

  - [ ] Usage tracking
  - [ ] Stripe integration
  - [ ] Billing UI

- [ ] **4.2 Security**

  - [ ] Rate limiting
  - [ ] Input sanitization
  - [ ] Audit logging

- [ ] **4.3 Polish**
  - [ ] Mobile responsive
  - [ ] Accessibility
  - [ ] Performance optimization

---

## Appendix

### Research Sources

1. **Lovable.dev** - https://lovable.dev
2. **Bolt.new** - https://bolt.new
3. **v0.app** - https://v0.app
4. **bolt.diy** (open source) - https://github.com/stackblitz-labs/bolt.diy

### Key Insights from Research

1. **Bolt.new Architecture:** Uses implicit tool calling (text-based file/command tags), not explicit function calling. Our current approach is correct.

2. **Error Recovery is Critical:** The #1 differentiator for complex apps. Simple builders fail on first error; professional builders auto-fix.

3. **Persistence is Non-Negotiable:** Users expect to save work. Session-only storage is a dealbreaker.

4. **Single Agent is Sufficient:** Multi-agent systems are overkill for 90% of use cases. Single agent with error recovery handles most apps.

5. **Context Management Matters:** For complex multi-page apps, AI needs to understand the full project structure.

### Competitive Positioning

**NixBuilder's Unique Advantages:**

- **Next.js + SCSS Focus** - Opinionated, production-ready stack
- **MongoDB Native** - First-class support (vs Supabase-only competition)
- **Fly.io Full VM** - More capabilities than WebContainer
- **Open Architecture** - Not locked into specific ecosystem

---

_Last Updated: December 15, 2024_  
_Next Review: After Phase 1 completion_
