# Implementation Plan: GitHub Stargazers Enrichment Worker

## Overview
Build a TypeScript worker that runs hourly to fetch new stargazers from a GitHub repo, stores them in DuckDB, enriches profiles via GitHub API, and uses an LLM to extract structured data.

---

## Project Setup

### Initialize Project
1. Create new directory and initialize with `npm init -y`
2. Install TypeScript: `npm install -D typescript tsx @types/node`
3. Create `tsconfig.json` with:
   - `target: "ES2022"`
   - `module: "NodeNext"`
   - `moduleResolution: "NodeNext"`
   - `strict: true`
   - `outDir: "./dist"`

### Dependencies
```
npm install duckdb @duckdb/node-api dotenv ai @openrouter/ai-sdk-provider zod
```

### Environment Variables (.env.example)
```
GITHUB_TOKEN=
OPENROUTER_API_KEY=
GITHUB_REPO_OWNER=
GITHUB_REPO_NAME=
```

---

## File Structure
```
/src
  /db
    schema.ts       # DuckDB schema definitions and migrations
    client.ts       # DuckDB connection singleton
  /github
    client.ts       # GitHub API wrapper
    types.ts        # GitHub API response types
  /enrichment
    llm.ts          # OpenRouter/Vercel AI SDK setup
    extractor.ts    # LLM-based profile enrichment
    types.ts        # Enriched profile types (Zod schemas)
  /worker
    index.ts        # Main worker logic
  index.ts          # Entry point, scheduler
/data
  stargazers.db     # DuckDB file (gitignored)
```

---

## Database Schema (DuckDB)

### Tables

**stargazers**
```sql
CREATE TABLE IF NOT EXISTS stargazers (
  id INTEGER PRIMARY KEY,           -- GitHub user ID
  username VARCHAR NOT NULL UNIQUE,
  starred_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  enriched_at TIMESTAMP,
  enrichment_status VARCHAR DEFAULT 'pending'  -- pending, completed, failed
);
```

**enriched_profiles**
```sql
CREATE TABLE IF NOT EXISTS enriched_profiles (
  github_id INTEGER PRIMARY KEY REFERENCES stargazers(id),
  name VARCHAR,
  bio TEXT,
  location VARCHAR,
  company VARCHAR,
  country VARCHAR,                  -- LLM extracted
  employers TEXT,                   -- JSON array string
  linkedin_url VARCHAR,
  website_url VARCHAR,
  university VARCHAR,               -- LLM extracted
  twitter_username VARCHAR,
  raw_github_profile TEXT,          -- Full JSON for debugging
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Implementation Steps

### Step 1: Database Layer (`/src/db/`)

**client.ts**
- Export async function `getDb()` that returns DuckDB connection
- Use singleton pattern - create connection once, reuse
- Database file path: `./data/stargazers.db`

**schema.ts**
- Export `initializeSchema(db)` function
- Run CREATE TABLE IF NOT EXISTS for both tables
- Call on startup

---

### Step 2: GitHub Client (`/src/github/`)

**types.ts**
- Define `GitHubStargazer` type: `{ user: { id, login }, starred_at }`
- Define `GitHubUserProfile` type with all profile fields

**client.ts**
- Export `GitHubClient` class
- Constructor takes token from env
- Methods:
  - `getStargazers(owner, repo, page, perPage)`: GET `/repos/{owner}/{repo}/stargazers` with `Accept: application/vnd.github.star+json` header for timestamps
  - `getAllStargazers(owner, repo)`: Paginate through all stargazers
  - `getUserProfile(username)`: GET `/users/{username}`
- Handle rate limiting: check `X-RateLimit-Remaining` header, wait if needed
- Use native fetch (no axios needed)

---

### Step 3: LLM Enrichment (`/src/enrichment/`)

**types.ts**
```typescript
import { z } from 'zod';

export const EnrichedProfileSchema = z.object({
  country: z.string().nullable(),
  employers: z.array(z.object({
    name: z.string(),
    current: z.boolean(),
  })),
  linkedin_url: z.string().url().nullable(),
  website_url: z.string().url().nullable(),
  university: z.string().nullable(),
});
```

**llm.ts**
```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

**extractor.ts**
- Export `extractProfileData(githubProfile: GitHubUserProfile)`
- Use `generateObject` from `ai` package with Zod schema
- Model usage: `openrouter('anthropic/claude-3-haiku')` or `openrouter('google/gemini-flash-1.5-8b')`
- Prompt should instruct LLM to extract:
  - Country (infer from location field if needed)
  - Past and current employers (parse company field, bio)
  - LinkedIn URL (look in bio, blog field)
  - Personal website (blog field, bio)
  - University (look in bio)
- Return typed enriched data

Example usage:
```typescript
import { generateObject } from 'ai';
import { openrouter } from './llm';
import { EnrichedProfileSchema } from './types';

export async function extractProfileData(profile: GitHubUserProfile) {
  const { object } = await generateObject({
    model: openrouter('anthropic/claude-3-haiku'),
    schema: EnrichedProfileSchema,
    prompt: `Extract structured data from this GitHub profile...`,
  });
  return object;
}
```

---

### Step 4: Worker Logic (`/src/worker/index.ts`)

**Main Function: `runWorker()`**

1. **Fetch current stargazers from GitHub**
   - Call `getAllStargazers(owner, repo)`
   
2. **Identify new stargazers**
   - Query existing IDs from `stargazers` table
   - Filter to only new ones (not in DB)
   
3. **Insert new stargazers**
   - Batch insert into `stargazers` table
   - Log count of new stargazers found

4. **Enrich pending profiles**
   - Query stargazers where `enrichment_status = 'pending'`
   - Limit to 50 per run (avoid rate limits/costs)
   - For each:
     - Fetch GitHub profile via API
     - Call LLM extractor
     - Insert into `enriched_profiles`
     - Update `enrichment_status = 'completed'` and `enriched_at`
     - On error: set `enrichment_status = 'failed'`, log error
   - Add small delay between API calls (100-200ms)

5. **Return summary stats**

---

### Step 5: Entry Point & Scheduler (`/src/index.ts`)

```typescript
import { initializeSchema } from './db/schema';
import { getDb } from './db/client';
import { runWorker } from './worker';

async function main() {
  const db = await getDb();
  await initializeSchema(db);
  
  // Run immediately on start
  await runWorker();
  
  // Then run every hour
  setInterval(async () => {
    console.log(`[${new Date().toISOString()}] Running worker...`);
    await runWorker();
  }, 60 * 60 * 1000);
}

main().catch(console.error);
```

---

### Step 6: Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "run-once": "tsx src/worker/index.ts"
  }
}
```

---

## Error Handling Requirements

1. Wrap all external API calls in try/catch
2. Log errors with context (username, step that failed)
3. Don't let single profile failure stop batch processing
4. Implement exponential backoff for rate limits (GitHub returns 403)
5. Validate env vars exist on startup, exit with clear error if missing

---

## Testing Notes

- Create a `run-once` script that just runs the worker once for testing
- Start with a small repo to test pagination
- Verify DuckDB file persists between runs
- Check that re-running doesn't duplicate stargazers

---

## Optional Enhancements (Out of Scope but Nice)

- Add a simple CLI to query the database
- Export to CSV command
- Webhook/notification when high-value stargazers appear
- Track star/unstar events over time

---

This plan should give the coding agent everything needed to implement the full solution. Each section is modular and can be implemented and tested independently.
