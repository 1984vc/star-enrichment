import "dotenv/config";
import { getDb, initializeSchema } from "../db/index.js";
import { GitHubClient } from "../github/index.js";
import { extractProfileData } from "../enrichment/index.js";

const ENRICHMENT_BATCH_SIZE = 50;
const ENRICHMENT_DELAY_MS = 150;

function validateEnv(): { owner: string; repo: string; token: string } {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");
  if (!owner) throw new Error("GITHUB_REPO_OWNER environment variable is required");
  if (!repo) throw new Error("GITHUB_REPO_NAME environment variable is required");
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY environment variable is required");

  return { owner, repo, token };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWorker(): Promise<{ newStargazers: number; enriched: number; failed: number }> {
  const { owner, repo, token } = validateEnv();
  const db = await getDb();
  const connection = await db.connect();
  const github = new GitHubClient(token);

  let newStargazers = 0;
  let enriched = 0;
  let failed = 0;

  try {
    // Step 1: Fetch all stargazers from GitHub
    console.log(`Fetching stargazers for ${owner}/${repo}...`);
    const stargazers = await github.getAllStargazers(owner, repo);
    console.log(`Found ${stargazers.length} total stargazers`);

    // Step 2: Get existing IDs from database
    const existingIds = new Set<number>();
    const existingQuery = await connection.run("SELECT id FROM stargazers");
    const rows = await existingQuery.getRows();
    for (const row of rows) {
      existingIds.add(row[0] as number);
    }

    // Step 3: Insert new stargazers
    for (const stargazer of stargazers) {
      if (!existingIds.has(stargazer.user.id)) {
        await connection.run(
          `INSERT INTO stargazers (id, username, starred_at) VALUES (?, ?, ?)`,
          [stargazer.user.id, stargazer.user.login, stargazer.starred_at]
        );
        newStargazers++;
      }
    }

    if (newStargazers > 0) {
      console.log(`Inserted ${newStargazers} new stargazers`);
    }

    // Step 4: Enrich pending profiles
    const pendingResult = await connection.run(
      `SELECT id, username FROM stargazers WHERE enrichment_status = 'pending' LIMIT ?`,
      [ENRICHMENT_BATCH_SIZE]
    );
    const pendingRows = await pendingResult.getRows();

    console.log(`Found ${pendingRows.length} profiles to enrich`);

    for (const row of pendingRows) {
      const id = row[0] as number;
      const username = row[1] as string;

      try {
        console.log(`Enriching profile: ${username}`);

        // Fetch GitHub profile
        const profile = await github.getUserProfile(username);

        // Extract data with LLM
        const enrichedData = await extractProfileData(profile);

        // Insert enriched profile
        await connection.run(
          `INSERT INTO enriched_profiles (
            github_id, name, bio, location, company, country, employers,
            linkedin_url, website_url, university, twitter_username, raw_github_profile
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            profile.name,
            profile.bio,
            profile.location,
            profile.company,
            enrichedData.country,
            JSON.stringify(enrichedData.employers),
            enrichedData.linkedin_url,
            enrichedData.website_url,
            enrichedData.university,
            profile.twitter_username,
            JSON.stringify(profile),
          ]
        );

        // Update status
        await connection.run(
          `UPDATE stargazers SET enrichment_status = 'completed', enriched_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [id]
        );

        enriched++;
        await sleep(ENRICHMENT_DELAY_MS);
      } catch (error) {
        console.error(`Failed to enrich ${username}:`, error);

        await connection.run(
          `UPDATE stargazers SET enrichment_status = 'failed' WHERE id = ?`,
          [id]
        );

        failed++;
      }
    }

    console.log(`Worker completed: ${newStargazers} new, ${enriched} enriched, ${failed} failed`);
    return { newStargazers, enriched, failed };
  } finally {
    connection.closeSync();
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker()
    .then((stats) => {
      console.log("Final stats:", stats);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Worker failed:", error);
      process.exit(1);
    });
}
