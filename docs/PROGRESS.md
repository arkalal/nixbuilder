# nixbuilder.dev – Project Progress Summary

Last updated: [auto]

## Overview

- Goal: Lovable-style AI app builder that plans, generates, and previews full Next.js 16 apps with iterative editing.
- Core stack: Next.js 16 (App Router, JS/JSX), SCSS, MongoDB, NextAuth, Vercel AI SDK + OpenRouter, npm.
- Sandbox: Fly.io Machines (planned integration hooks in API), VFS backed by MongoDB/GridFS.
- UX: Chat-based flow with live streaming code, file tree construction, right-panel code tabs, and activity timeline.

## What’s Implemented

- Explanation-first streaming: The assistant’s initial explanation is emitted and rendered before any code streaming.
- Client-side file parsing & streaming (open-lovable style):
  - Parse `<file path="...">...</file>` blocks from raw stream to build files incrementally.
  - Detect `currentFile` from the last opened (not yet closed) `<file>` tag and stream partial content live.
- Persistent conversation/build history:
  - Each assistant turn stores a `completedFilesSnapshot` and `postContent` (final summary) so previous code blocks remain visible permanently.
  - Latest assistant turn shows live streaming; older turns render their persisted snapshots.
- Iterative development (no rewrite from scratch):
  - Writer no longer clears the VFS.
  - Backend constructs project context (existing file list, key file contents, and recent chat history) and passes it to the model.
  - Writer system prompt now contains an “Iterative Editing Mode” section instructing minimal, incremental changes.
- UI/UX streaming improvements:
  - Right panel opens and streams the currently active file; spinner and partial content show while streaming.
  - Left panel message timeline auto-scrolls as new activity and file blocks appear.
  - Activities/spinners stop cleanly at completion; `stage` transitions are consistent.
- Final assistant summary:
  - The model’s final summary is attached to the message and rendered after all code blocks at the bottom of that turn.

## Key Architectural Decisions

- Follow open-lovable for streaming protocol and client-side parsing.
- Maintain a Virtual File System (VFS) in memory with planned persistence via MongoDB/GridFS.
- Keep Next.js 16 App Router, JavaScript only, SCSS modules, NextAuth, and npm per project rules.

## Backend Changes

- File: `lib/services/writer.js`
  - Added “Iterative Editing Mode”:
    - Do not clear VFS for subsequent prompts.
    - Honor existing project context and make minimal edits.
    - Always output full file content within `<file>` tags for modified/added files only.
  - Prepended optional PROJECT CONTEXT and recent chat history to the user prompt.
- File: `src/app/api/chat/route.js`
  - Accepts `history` from the client.
  - Builds PROJECT CONTEXT from VFS: list of files + selected key file contents (`package.json`, `next.config.mjs`, `jsconfig.json`, `app/layout.jsx`, `app/page.jsx`, `app/globals.scss`).
  - Explanation gating: buffers `<explanation>` chunks and emits them before any `rawStream`.
  - Activity events: emits file start/complete activities for UI feedback (no per-file content payloads; content is parsed on the client).
  - `complete` event bundles a final summary and a fallback map of files (used only if client parsing failed) and writes to VFS.

## Frontend Changes

- File: `src/app/(studio)/studio/page.js`
  - SSE handler honors ordering: explanation → stream → complete.
  - Client-side parser extracts completed files and determines `currentFile` from the last open `<file>` without a closing tag.
  - Uses `filesRef` to avoid dependency loops and infinite re-renders.
  - Preserves `files` across generations (iterative behavior) while resetting only per-generation streaming state.
  - On `complete`: marks activities done, snaps `completedFiles` into message, attaches `postContent`, keeps `files` intact.
  - Sends lightweight `history` (last ~8 messages) with each prompt to guide iterative updates.
- File: `components/Studio/MessageTimeline/MessageTimeline.js`
  - Renders live `StreamingCodeDisplay` for the latest assistant message.
  - Renders persisted `completedFilesSnapshot` and `postContent` for prior assistant messages to keep the entire build history visible.
  - Bottom sentinel to auto-scroll as content is appended.
- File: `components/Studio/StreamingCodeDisplay/StreamingCodeDisplay.js`
  - Accepts `postContent` and renders the final AI summary at the bottom of file blocks.
- File: `components/Studio/CodeViewer/CodeViewer.js`
  - Shows spinner/partial content for `currentFile` even if it already exists in `files`.
- File: `components/Studio/Composer/Composer.js`
  - Auto-scrolls the timeline panel while streaming content arrives.

## Current Behavior (E2E)

1. User sends a prompt.
2. Explanation renders first in the left panel.
3. Code starts streaming:
   - Files appear incrementally; right panel focuses `currentFile` tab and streams contents.
   - Activities log starts/finishes per file.
4. Generation completes:
   - Spinner stops; all activities marked complete.
   - Final summary text renders after all file blocks for that turn.
   - The entire build flow for that turn persists in the timeline.
5. User sends another prompt (iteration):
   - Backend passes existing project context + recent history to the model.
   - Only changed/added files are emitted; existing files are preserved and updated incrementally.

## Constraints Honored

- No TypeScript, no Tailwind; JSX + SCSS only.
- Next.js 16 App Router.
- npm-only.
- Client components include `"use client"` where hooks are used.

## Verification Checklist

- Explanation appears before code streaming.
- Code streams to the right panel and tabs open during generation.
- Left panel retains all previous code blocks and summaries after completion.
- Iterative prompts modify the existing project instead of rebuilding from scratch.
- Activities transition from in-progress to completed; stage becomes `done`.

## Next Steps

- Implement Fly.io Machines sandbox endpoints and log streaming.
- Persist VFS with MongoDB/GridFS; connect to projects and users.
- /api/projects CRUD and UI for project management.
- NextAuth (Google) and protected routes for studio/dashboard.
- Dodo Payments integration (subscription + credit top-ups) and token cost tracking.
- Export ZIP and Deploy to Vercel.

## Files Touched (recent)

- `lib/services/writer.js`
- `src/app/api/chat/route.js`
- `src/app/(studio)/studio/page.js`
- `components/Studio/MessageTimeline/MessageTimeline.js`
- `components/Studio/StreamingCodeDisplay/StreamingCodeDisplay.js`
- `components/Studio/CodeViewer/CodeViewer.js`
- `components/Studio/Composer/Composer.js`

## Changelog (High-level)

- Added iterative editing support (context + prompt rules).
- Switched to client-side file parsing; explanation-first gating.
- Persisted per-turn code blocks with final summaries.
- Stabilized streaming and removed infinite re-renders.
- Cleaned up activity lifecycle and stage transitions.
