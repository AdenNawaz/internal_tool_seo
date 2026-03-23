# CLAUDE.md

## Project Overview

This is an internal SEO writing tool for a content team. It handles keyword research, keyword cluster building, article writing via a BlockNote editor, cannibalization checking, and performance tracking. Users are internal SEO writers — this is not a public-facing product. The stack is Next.js 14 App Router, TypeScript, Tailwind CSS, MongoDB with Prisma, and the BlockNote editor. Ahrefs data is fetched through the Ahrefs MCP server at `https://api.ahrefs.com/mcp/mcp`.

## Architecture

Next.js App Router serves both the frontend and all API routes in a single project. All data is persisted through Prisma connected to MongoDB. Ahrefs MCP is called exclusively from API routes via `@modelcontextprotocol/sdk` — never from the frontend or client components. Upstash Redis caches all Ahrefs MCP responses with a 7-day TTL by default. There is no separate backend process, no n8n, and no external job queue. Cron jobs run via Vercel cron (configured in `vercel.json`) when deployed, and are triggered manually via API route in development.

## Folder Structure

```
app/
  (auth)/
  articles/
  articles/[id]/        ← editor page
  dashboard/
  research/             ← keyword research & cluster reports
  clusters/
  api/
    articles/
    keywords/lookup/
    research/run/
    cannibalization/
    brief/generate/
    cron/rankings/
components/
  editor/               ← BlockNote setup
  sidebar/              ← keyword panel, checklist, brief
  dashboard/
lib/
  db.ts                 ← Prisma singleton
  ahrefs.ts             ← MCP client wrapper
  ahrefs-cached.ts      ← Redis cache layer
  ahrefs-types.ts       ← typed shapes for all Ahrefs MCP responses
  redis.ts              ← Upstash client
  text-analysis.ts      ← local readability/density utils
prisma/
  schema.prisma
```

## Key Conventions

### API Routes

All Ahrefs MCP calls go through `lib/ahrefs-cached.ts` — never called directly inline in a route. Every API route validates its request body with Zod before touching the DB or calling any external service. API routes return consistent error shapes: `{ error: string, code?: string }`. Streaming routes use `ReadableStream` with `text/event-stream` content type.

### Database

Import the Prisma client only from `lib/db.ts` using the singleton pattern to avoid connection exhaustion in development with hot reload. MongoDB ObjectId fields use `@id @default(auto()) @map("_id") @db.ObjectId`. Never use raw MongoDB queries — always go through Prisma.

### Editor

BlockNote stores content as JSON in the `articles.content` field (`Json?` type in Prisma). For any text analysis (density, readability), extract plain text from the BlockNote JSON first — never analyse the raw JSON structure. Autosave debounce is 1500ms on both title and content changes.

### Caching

Cache key format: `ahrefs:{toolName}:{JSON.stringify(args)}`. Default TTL is 7 days (604800 seconds). The rankings cron uses a 1-day TTL override since position data needs to be fresher. Never bypass the cache in production. In development, the cache can be cleared manually via `/api/dev/clear-cache` (that route only exists in development).

### Components

Use shadcn/ui for all UI primitives. No inline styles — Tailwind classes only. Components are server components by default; add `"use client"` only when the component needs state, effects, or browser APIs.

### TypeScript

Strict mode is on. No `any` types — if a type is unknown, use `unknown` and narrow it. All Ahrefs MCP response shapes are typed in `lib/ahrefs-types.ts`.

## Environment Variables

```
DATABASE_URL                  — MongoDB connection string
AHREFS_API_KEY                — Bearer token for Ahrefs MCP
OPENAI_API_KEY                — Used in brief generator and cluster builder
SERPAPI_KEY                   — SERP competitor finding and PAA questions
FIRECRAWL_API_KEY             — Competitor page scraping
UPSTASH_REDIS_REST_URL        — Upstash Redis endpoint
UPSTASH_REDIS_REST_TOKEN      — Upstash Redis auth token
NEXTAUTH_SECRET               — (not yet active, added when auth is built)
NEXTAUTH_URL                  — (not yet active, added when auth is built)
CRON_SECRET                   — Protects /api/cron/* routes from public access
OWN_DOMAIN                    — The company's domain, e.g. 10pearls.com
OWN_BLOG_URL                  — The company's blog URL for Jina scraping
COMPANY_PROFILE               — JSON string of company services and known topics, passed to every Claude/OpenAI prompt for grounding
```

## Ahrefs MCP — Tools Reference

```
keywords-explorer-matching-terms        — keyword ideas from a seed term
keywords-explorer-overview              — full data card for one keyword
keywords-explorer-search-volumes        — monthly volume trends for a keyword list
site-explorer-organic-keywords          — keywords a domain ranks for
site-explorer-top-pages                 — top traffic pages for a domain
site-explorer-organic-competitors       — SEO competitors ranked by keyword overlap
site-explorer-backlinks-stats           — DR, referring domains, backlink count
site-explorer-domain-rating-history     — DR over time for a domain
site-explorer-linked-anchors-external   — anchor texts from external backlinks
rank-tracker-competitors-metrics        — Share of Voice vs competitors
site-audit-issues                       — technical SEO issues from latest crawl
site-audit-page-explorer                — crawl data for individual pages
```

## Current Build Status

Nothing is built yet. Day 1 target:

- Next.js project scaffolded with Tailwind and shadcn
- Prisma connected to MongoDB
- `/articles` list page
- `/articles/[id]` editor page with BlockNote
- Autosave working
- No auth, no sidebar, no Ahrefs calls yet

Update this section at the end of each build session with what was completed and what is next.

## What NOT to Do

- Do not call Ahrefs MCP from the frontend or from client components.
- Do not create separate Express or Fastify server files — everything is Next.js API routes.
- Do not use `localStorage` or `sessionStorage`.
- Do not add placeholder components with TODO comments — only build what works end to end.
- Do not use n8n webhooks or any external automation platform.
- Do not add auth until the core editor and research features are working and explicitly requested.
- Do not install a different editor library — BlockNote is the chosen editor, not Tiptap, Quill, or Slate.
- Do not use `WidthType.PERCENTAGE` in any docx generation — it breaks rendering in Google Docs.
