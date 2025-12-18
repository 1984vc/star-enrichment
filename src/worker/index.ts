import "dotenv/config";
import { getDb } from "../db/index.js";
import { GitHubClient } from "../github/index.js";
import { extractProfileData } from "../enrichment/index.js";

const ENRICHMENT_BATCH_SIZE = 500;

export interface FetchOptions {
  owner: string;
  repo: string;
  dbPath: string;
  limit?: number;
}

export interface EnrichOptions {
  dbPath: string;
  limit?: number;
  sample?: number; // 0.0-1.0, percentage of pending to randomly sample
}

function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");
  return token;
}

function getOpenRouterKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }
}


/**
 * Fetch stargazers from GitHub and save to database.
 * Does NOT fetch user profiles or run enrichment.
 */
export async function runFetch(options: FetchOptions): Promise<{ total: number; new: number }> {
  const { owner, repo, dbPath, limit } = options;
  const token = getGitHubToken();
  const db = await getDb(dbPath);
  const connection = await db.connect();
  const github = new GitHubClient(token);

  let newCount = 0;

  try {
    console.log(`Fetching stargazers for ${owner}/${repo}...`);
    let stargazers = await github.getAllStargazers(owner, repo);
    console.log(`Found ${stargazers.length} total stargazers`);

    // Apply limit if specified (take most recent N)
    if (limit && limit > 0 && stargazers.length > limit) {
      console.log(`Limiting to last ${limit} stargazers`);
      stargazers = stargazers.slice(-limit);
    }

    // Get existing IDs from database
    const existingIds = new Set<number>();
    const existingQuery = await connection.run("SELECT id FROM stargazers");
    const rows = await existingQuery.getRows();
    for (const row of rows) {
      existingIds.add(row[0] as number);
    }

    // Insert new stargazers
    for (const stargazer of stargazers) {
      if (!existingIds.has(stargazer.user.id)) {
        await connection.run(
          `INSERT INTO stargazers (id, username, starred_at) VALUES (?, ?, ?)`,
          [stargazer.user.id, stargazer.user.login, stargazer.starred_at]
        );
        newCount++;
      }
    }

    if (newCount > 0) {
      console.log(`Inserted ${newCount} new stargazers`);
    } else {
      console.log("No new stargazers found");
    }

    return { total: stargazers.length, new: newCount };
  } finally {
    connection.closeSync();
  }
}

/**
 * Enrich pending profiles with GitHub profile data and LLM extraction.
 */
export async function runEnrich(options: EnrichOptions): Promise<{ enriched: number; failed: number; pending: number }> {
  const { dbPath, limit, sample } = options;
  const token = getGitHubToken();
  getOpenRouterKey(); // Validate key exists

  const db = await getDb(dbPath);
  const connection = await db.connect();
  const github = new GitHubClient(token);

  let enriched = 0;
  let failed = 0;

  try {
    // Count total pending
    const countResult = await connection.run(
      `SELECT COUNT(*) FROM stargazers WHERE enrichment_status = 'pending'`
    );
    const countRows = await countResult.getRows();
    const totalPending = Number(countRows[0][0]);

    // Determine batch size
    let batchSize: number;
    if (sample !== undefined && sample > 0 && sample <= 1) {
      batchSize = Math.max(1, Math.round(totalPending * sample));
      console.log(`Sampling ${(sample * 100).toFixed(1)}% of ${totalPending} pending profiles (${batchSize} profiles)`);
    } else {
      batchSize = limit ?? ENRICHMENT_BATCH_SIZE;
    }

    // Get pending profiles - use random ordering for sampling
    const query = sample !== undefined && sample > 0 && sample <= 1
      ? `SELECT id, username FROM stargazers WHERE enrichment_status = 'pending' ORDER BY RANDOM() LIMIT ?`
      : `SELECT id, username FROM stargazers WHERE enrichment_status = 'pending' LIMIT ?`;

    const pendingResult = await connection.run(query, [batchSize]);
    const pendingRows = await pendingResult.getRows();

    console.log(`Found ${totalPending} pending profiles, processing ${pendingRows.length}`);

    for (const row of pendingRows) {
      const id = row[0] as number;
      const username = row[1] as string;

      try {
        console.log(`Enriching profile: ${username}`);

        // Fetch GitHub profile
        const profile = await github.getUserProfile(username);

        // If email missing, try to find it from commits
        let candidateEmails: string[] = [];
        if (!profile.email) {
          try {
            const repos = await github.getUserRepos(username);
            const ownedRepo = repos.find((r) => r.owner.login === username && !r.fork);
            if (ownedRepo) {
              const commits = await github.getRepoCommits(ownedRepo.owner.login, ownedRepo.name, username);
              candidateEmails = [
                ...new Set(
                  commits
                    .flatMap((c) => [c.commit.author?.email, c.commit.committer?.email])
                    .filter((e): e is string => !!e && !e.includes("noreply"))
                ),
              ];
            }
          } catch (emailError) {
            console.warn(`Could not fetch commit emails for ${username}:`, emailError);
          }
        }

        // Fetch social accounts
        let socialAccounts: Array<{ provider: string; url: string }> = [];
        try {
          socialAccounts = await github.getUserSocialAccounts(username);
        } catch (socialError) {
          console.warn(`Could not fetch social accounts for ${username}:`, socialError);
        }

        // Extract data with LLM
        const enrichedData = await extractProfileData(profile, candidateEmails);

        // Insert enriched profile
        await connection.run(
          `INSERT INTO enriched_profiles (
            github_id, name, bio, location, company, country, employers,
            linkedin_url, website_url, university, email, twitter_username, social_accounts, raw_github_profile
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            enrichedData.email,
            profile.twitter_username,
            JSON.stringify(socialAccounts),
            JSON.stringify(profile),
          ]
        );

        // Update status
        await connection.run(
          `UPDATE stargazers SET enrichment_status = 'completed', enriched_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [id]
        );

        enriched++;
        // Rate limiting is handled by GitHubClient
      } catch (error) {
        console.error(`Failed to enrich ${username}:`, error);

        await connection.run(
          `UPDATE stargazers SET enrichment_status = 'failed' WHERE id = ?`,
          [id]
        );

        failed++;
      }
    }

    const remainingPending = totalPending - enriched - failed;
    console.log(`Enrichment completed: ${enriched} enriched, ${failed} failed, ${remainingPending} remaining`);
    return { enriched, failed, pending: remainingPending };
  } finally {
    connection.closeSync();
  }
}

