# Supabase Auth Implementation Plan

## Overview

Replace NextAuth with Supabase Auth for AI-generated apps to eliminate redirect URL issues in sandbox/preview environments.

**Created**: December 17, 2025  
**Status**: Planning  
**Priority**: High

---

## Problem Statement

NextAuth has inherent issues in sandbox/preview environments:

- Hardcoded `NEXTAUTH_URL` causes localhost redirects
- Auth callbacks go through app's domain which gets confused in proxied environments
- Complex cookie configuration required for iframes
- Session management issues in proxied environments (E2B, Fly.io)

## Solution

Adopt **Supabase Auth** - the same approach used by Lovable, Bolt.diy, and other premium AI app builders.

---

## Why Supabase Auth Solves the Problem

| Issue with NextAuth                                 | How Supabase Auth Fixes It                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Hardcoded `NEXTAUTH_URL` causes localhost redirects | Supabase dashboard allows **wildcard redirect URLs** (e.g., `https://**--*.e2b.app/**`) |
| Auth callbacks go through app's domain              | Auth happens on `*.supabase.co` domain, then redirects back                             |
| Complex cookie configuration for iframes            | Supabase `@supabase/ssr` handles cookies automatically                                  |
| Session management issues in proxied environments   | Cookie-based sessions work across any domain                                            |

---

## Implementation Phases

### Phase 1: Update System Prompt (`lib/services/writer.js`)

**Tasks:**

- [ ] Remove all NextAuth instructions from system prompt
- [ ] Add Supabase Auth boilerplate and file structure
- [ ] Include `@supabase/ssr` configuration patterns
- [ ] Add middleware template for session refresh
- [ ] Update environment variable guidance

**Files to modify:**

- `lib/services/writer.js`

### Phase 2: Create Supabase Auth File Templates

The AI should generate these files for auth apps:

```
lib/
├── supabase/
│   ├── client.js      # Browser client
│   ├── server.js      # Server component client
│   └── middleware.js  # Middleware client
middleware.js          # Next.js middleware for session refresh
app/
├── auth/
│   ├── callback/route.js  # Auth callback handler (PKCE flow)
│   ├── login/page.jsx     # Login page with form
│   ├── signup/page.jsx    # Signup page with form
│   └── signout/route.js   # Sign out handler
```

### Phase 3: Environment Variables Configuration

**Required Environment Variables:**

```env
NEXT_PUBLIC_SUPABASE_URL=<from-supabase-dashboard>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-dashboard>
```

**Removed (no longer needed):**

```env
# NEXTAUTH_SECRET - removed
# NEXTAUTH_URL - removed
```

### Phase 4: User Instructions for Supabase Dashboard

User must configure in Supabase Dashboard → Authentication → URL Configuration:

**Site URL:**

- Production: `https://your-production-domain.com`
- Development: `http://localhost:3000`

**Redirect URLs (with wildcards for preview environments):**

- `http://localhost:3000/**`
- `https://**.e2b.app/**` ← Matches ANY random E2B subdomain (e.g., `3000-abc123xyz.e2b.app`)
- `https://**.fly.dev/**`
- `https://**.vercel.app/**`
- `https://**.netlify.app/**`

> **Note:** The `**` (globstar) wildcard matches ANY characters including `.` and subdomain separators. This means every new sandbox preview will automatically be allowed, regardless of what random subdomain the provider assigns. No configuration changes needed when sandbox URLs change.

---

## Key Code Patterns

### 1. Supabase Browser Client

```javascript
// lib/supabase/client.js
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
```

### 2. Supabase Server Client

```javascript
// lib/supabase/server.js
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component - ignore
          }
        },
      },
    }
  );
}
```

### 3. Middleware for Session Refresh

```javascript
// middleware.js
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### 4. Auth Callback Route (PKCE Flow)

```javascript
// app/auth/callback/route.js
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to error page on failure
  return NextResponse.redirect(`${origin}/auth/error`);
}
```

### 5. Sign Up Function

```javascript
// In signup page or action
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

### 6. Sign In Function

```javascript
// In login page or action
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

if (!error) {
  router.push("/dashboard");
  router.refresh();
}
```

### 7. Sign Out Function

```javascript
// Sign out and redirect
await supabase.auth.signOut();
router.push("/");
router.refresh();
```

### 8. Get Current User (Server Component)

```javascript
// In any server component
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <div>Welcome, {user.email}</div>;
}
```

### 9. Get Current User (Client Component)

```javascript
// In any client component
"use client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export default function UserInfo() {
  const [user, setUser] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  return user ? <p>Logged in as {user.email}</p> : <p>Not logged in</p>;
}
```

---

## Package Dependencies

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

---

## Migration Checklist

### Code Changes

- [ ] Update `lib/services/writer.js` - Remove NextAuth, add Supabase Auth
- [ ] Add Supabase Auth file templates to system prompt
- [ ] Add `@supabase/ssr` and `@supabase/supabase-js` to default dependencies
- [ ] Update environment variable guidance in system prompt
- [ ] Remove NextAuth cookie configuration from system prompt
- [ ] Add middleware template for session refresh
- [ ] Add auth callback route template

### Testing

- [ ] Test auth flow in local development (localhost:3000)
- [ ] Test auth flow in E2B sandbox preview
- [ ] Test auth flow in Fly.io sandbox preview
- [ ] Verify sign up works
- [ ] Verify sign in works
- [ ] Verify sign out works
- [ ] Verify protected routes work
- [ ] Verify session persistence across page refreshes

### Documentation

- [ ] Update user-facing docs for Supabase setup
- [ ] Add Supabase dashboard configuration instructions
- [ ] Document wildcard redirect URL patterns

---

## Comparison: NextAuth vs Supabase Auth

| Feature               | NextAuth                   | Supabase Auth                     |
| --------------------- | -------------------------- | --------------------------------- |
| Redirect handling     | Complex, URL-dependent     | Wildcard support, domain-agnostic |
| Sandbox compatibility | ❌ Requires URL injection  | ✅ Works out of the box           |
| Setup complexity      | Medium                     | Low                               |
| Database integration  | Separate adapter needed    | Built-in with Supabase DB         |
| Row-Level Security    | Manual implementation      | Native RLS support                |
| OAuth providers       | Configured per-app in code | Configured in Supabase dashboard  |
| Session storage       | JWT or database            | Cookie-based with auto-refresh    |
| Email templates       | Must build yourself        | Built-in with customization       |

---

## User Instructions (Post-Implementation)

When users want to build an auth app in the Studio, they need to:

1. **Create a Supabase Project**

   - Go to [database.new](https://database.new)
   - Create a new project

2. **Get API Credentials**

   - Go to Project Settings → API
   - Copy `Project URL` and `anon/public key`

3. **Configure Redirect URLs**

   - Go to Authentication → URL Configuration
   - Add wildcard URLs for preview environments

4. **Add Environment Variables**

   - In the Studio, update `.env` with Supabase credentials

5. **Start Building**
   - The AI will generate all necessary auth files

---

## Risks and Mitigations

| Risk                        | Mitigation                               |
| --------------------------- | ---------------------------------------- |
| User needs Supabase account | Provide clear setup instructions         |
| Supabase free tier limits   | Document limits, suggest upgrade path    |
| Email confirmation delays   | Default to no email confirmation for dev |
| Learning curve for RLS      | AI generates basic RLS policies          |

---

## Success Criteria

1. ✅ Auth apps work in E2B/Fly.io sandbox preview without errors
2. ✅ No "localhost redirect" issues
3. ✅ Sign up, sign in, sign out all work seamlessly
4. ✅ Protected routes properly restrict access
5. ✅ Session persists across page refreshes
6. ✅ Works in iframe preview mode

---

## Timeline Estimate

| Phase                     | Estimated Time |
| ------------------------- | -------------- |
| Phase 1: Update writer.js | 2-3 hours      |
| Phase 2: Testing          | 1-2 hours      |
| Phase 3: Documentation    | 1 hour         |
| **Total**                 | **4-6 hours**  |

---

## References

- [Supabase Auth Docs - Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase SSR Package](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [PKCE Flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
