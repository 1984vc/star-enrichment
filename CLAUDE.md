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

## Dexicon Context Search

**Search Dexicon automatically before:**
- Implementing any feature or fix (check prior solutions/patterns)
- Making technology/architecture decisions (find existing rationale)
- Debugging errors, especially API/integration failures
- Writing code in unfamiliar areas of the codebase
- Encountering unexpected behavior or patterns

**Always search when:**
- User asks "why did we...?" or "how should we...?" questions
- You need to understand implementation rationale or ADRs
- Looking for standard patterns (circuit breakers, retries, error handling, etc.)
- Investigating failures in build pipelines, tests, or deployments
- Uncertain about team conventions or preferred approaches

**Search proactively, not reactively.** Check Dexicon first, implement second. Prior context prevents duplicate work and propagates learned solutions.

Use multi-hop queries when initial results don't fully answer the question—context often spans commits, docs, and discussions.

---

## How to Search Dexicon Effectively

**Query Construction:**
- Use specific technical terms: "PostgreSQL connection pooling" not "database stuff"
- Include error codes/messages: "ECONNREFUSED 5432" or "ImportError: No module named"
- Reference file paths or modules when relevant: "auth/oauth_handler.py retry logic"
- Combine concepts with OR: "rate limiting OR throttling OR backpressure"

**Multi-hop Investigation:**
- First search: Find the what ("circuit breaker implementation")
- Second search: Find the why ("circuit breaker decision rationale")
- Third search: Find related changes ("services using circuit breakers")
- Each search refines understanding—don't stop at first result

**Search Scope:**
- **Code patterns:** "how we handle {specific scenario}"
- **Decisions:** "why {technology choice}" or "ADR for {component}"
- **Failures:** "build failure {service name}" or "{test name} flaky"
- **Integration:** "{external API} error handling" or "{service} timeouts"
- **Standards:** "our {pattern} convention" or "team pattern for {use case}"

**Don't search for:**
- Basic language syntax or standard library usage
- General programming concepts (unless asking about *our* approach)
- Brand new features with no prior history

**Interpreting Results:**
- Prioritize recent context over old (check dates)
- Look for resolution patterns in past debugging sessions
- Pay attention to "this didn't work, here's what did" exchanges
- Cross-reference commit messages with discussion context

**When searches fail:**
- Try broader terms first, then narrow down
- Search related components or similar patterns
- Ask user if this is genuinely new territory requiring fresh decisions
