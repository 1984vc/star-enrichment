# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub Stargazers Enrichment Worker - a TypeScript worker that fetches stargazers from a GitHub repo, stores them in DuckDB, and enriches profiles using GitHub API + LLM extraction.

## Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Development with watch mode
pnpm dev

# Run the worker once (for testing)
pnpm run-once

# Production start
pnpm start

# Build TypeScript
pnpm build
```

## Architecture

```
/src
  /db          # DuckDB connection singleton and schema definitions
  /github      # GitHub API client with rate limiting
  /enrichment  # OpenRouter/Vercel AI SDK integration for LLM extraction
  /worker      # Main worker logic (fetch stargazers, enrich, store)
  index.ts     # Entry point with hourly scheduler
/data
  stargazers.db  # DuckDB database file (gitignored)
```

## Key Technologies

- **Database**: DuckDB via `@duckdb/node-api`
- **LLM**: Vercel AI SDK (`ai` package) with OpenRouter provider (`@openrouter/ai-sdk-provider`)
- **Schema Validation**: Zod for LLM response parsing
- **Runtime**: tsx for TypeScript execution

## Environment Variables

Required in `.env`:
- `GITHUB_TOKEN` - GitHub API token
- `OPENROUTER_API_KEY` - OpenRouter API key
- `GITHUB_REPO_OWNER` - Target repo owner
- `GITHUB_REPO_NAME` - Target repo name

## Database Tables

- `stargazers` - GitHub users who starred the repo (id, username, starred_at, enrichment_status)
- `enriched_profiles` - LLM-extracted data (country, employers, linkedin_url, website_url, university)

## Implementation Notes

- Worker runs hourly via `setInterval`, also runs immediately on start
- Enrichment limited to 50 profiles per run to avoid rate limits/costs
- GitHub API uses `Accept: application/vnd.github.star+json` header to get star timestamps
- Handle GitHub rate limiting by checking `X-RateLimit-Remaining` header
