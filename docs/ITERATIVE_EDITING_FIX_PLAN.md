# Iterative Editing Fix Plan

> **Issue:** Styles breaking during iterations (buttons, components losing styles)  
> **Root Cause:** Incomplete context, no style preservation rules, partial file outputs  
> **Status:** Planning → Implementation

---

## Research Findings

### What Premium AI Builders Do Differently

| Feature            | Bolt.new/Lovable                                  | NixBuilder (Current)       | Gap                        |
| ------------------ | ------------------------------------------------- | -------------------------- | -------------------------- |
| Context Selection  | AI-powered selection of relevant files (max 5-10) | Static key files only      | Missing smart selection    |
| Style Preservation | Explicit "don't alter styling unless asked" rule  | No explicit rule           | Missing instruction        |
| File Completeness  | "Always write full file, no diffs"                | Implicit only              | Needs stronger enforcement |
| Holistic Thinking  | "Consider ALL files before changes"               | Not emphasized             | Missing instruction        |
| Paired Files       | JSX + its SCSS always together                    | SCSS often missing         | Missing pairing logic      |
| Conflict Detection | Pause if change might break things                | No detection               | Missing safeguard          |
| Chat Summary       | Compressed summary for long chats                 | Full history (token heavy) | Could optimize             |

### Key Insights from bolt.diy Source Code

1. **`select-context.ts`**: Uses AI to dynamically select which files to include in context (max 5 files)
2. **`prompts.ts`**: Contains rule "WebContainer CANNOT execute diff or patch editing so always write your code in full"
3. **Context Buffer**: Includes/excludes files based on relevance to current request
4. **Summary System**: Creates summaries of long conversations to save tokens

### Key Insight from Reddit Best Practices

> "Only make the exact changes I request—do not modify, remove, or alter any other code, styling, or page elements unless explicitly instructed."

---

## Solution Architecture

### Phase A: Enhanced System Prompt (Priority: HIGH, Effort: LOW)

Update `lib/services/writer.js` with stronger iterative editing rules:

**New Rules to Add:**

1. **Style Preservation Rule**

   - "NEVER modify CSS/SCSS styling unless explicitly requested"
   - "Preserve all existing class names, styles, and visual properties"

2. **Holistic Thinking Rule**

   - "Before making changes, consider how they affect the ENTIRE project"
   - "If editing a component, check if its styles need updating too"

3. **Complete File Rule**

   - "ALWAYS output COMPLETE files - never partial or truncated"
   - "Include ALL existing code plus your changes"

4. **Conflict Warning Rule**

   - "If your change might break existing functionality, explain the risk BEFORE making changes"

5. **Paired File Rule**
   - "When modifying a component file, include its SCSS module if styles are affected"

---

### Phase B: Smart Context Selection (Priority: HIGH, Effort: MEDIUM)

Create `lib/services/contextSelector.js`:

**Logic:**

1. Parse user's message for file references
2. Auto-include paired files (JSX ↔ SCSS module)
3. Include files that import/export the target file
4. Limit to 8-10 most relevant files
5. Prioritize recently modified files

**File Pairing Rules:**

- `components/Button/Button.jsx` → also include `components/Button/Button.module.scss`
- `app/page.jsx` → also include `app/globals.scss` if global styles mentioned
- Any component → include its parent layout if layout mentioned

---

### Phase C: File Dependency Graph (Priority: MEDIUM, Effort: MEDIUM)

Create `lib/services/dependencyGraph.js`:

**Features:**

1. Build import/export graph on project load
2. When editing file X, include files that depend on X
3. Warn if editing a heavily-imported file
4. Track which files are "stable" (user-edited, shouldn't change)

---

### Phase D: Diff-Based Editing (Priority: LOW, Effort: HIGH)

Future enhancement for surgical edits instead of full rewrites.

---

## Implementation Checklist

### Phase A: Enhanced System Prompt ✅ COMPLETED

- [x] Update `writer.js` with enhanced style preservation rules
- [x] Update `writer.js` with holistic thinking instruction
- [x] Update `writer.js` with complete file enforcement
- [x] Update chat API to include paired SCSS files in context

### Phase B: Smart Context Selection ✅ COMPLETED

- [x] Create `contextSelector.js` for smart file selection
- [x] Add file pairing logic (JSX ↔ SCSS)
- [x] Add dependency detection for imports
- [x] Relevance scoring based on user message
- [x] Keyword and topic extraction

### Phase C: File Dependency Mapping ✅ COMPLETED

- [x] Build dependency graph system (`lib/services/dependencyGraph.js`)
- [x] Parse imports/exports from all file types
- [x] Track which files import which
- [x] Impact assessment for edits

### Phase D: Diff-Based Editing ✅ COMPLETED

- [x] Diff parser module (`lib/diff/diffParser.js`)
  - Search/replace block format (Aider-style)
  - Unified diff format
  - Patch format
  - File block format (current)
- [x] Diff applier module (`lib/diff/diffApplier.js`)
  - Fuzzy matching for context drift
  - Rollback support
  - Detailed error reporting
- [x] Main exports (`lib/diff/index.js`)

### Phase E: Chat Summary System ✅ COMPLETED

- [x] Add chat summary for long conversations (`lib/services/chatSummary.js`)
- [x] AI-powered summarization with fallback
- [x] Topic and project info extraction
- [x] Integrated with chat API

---

## Success Metrics

After implementation, these issues should NOT occur:

1. ❌ Button styles disappearing after iteration
2. ❌ Component losing its visual appearance
3. ❌ SCSS files being regenerated without reason
4. ❌ Partial/truncated file outputs
5. ❌ Unrelated files being modified

---

_Created: December 16, 2024_
