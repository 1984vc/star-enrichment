import "dotenv/config";
import path from "path";
import { getDb, initializeSchema, closeDb } from "./db/index.js";
import { runFetch, runEnrich } from "./worker/index.js";

const HOUR_MS = 60 * 60 * 1000;

function getEnvConfig(): { owner: string; repo: string; dbPath: string } {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!owner) throw new Error("GITHUB_REPO_OWNER environment variable is required");
  if (!repo) throw new Error("GITHUB_REPO_NAME environment variable is required");

  const dbPath = path.resolve(process.cwd(), "data", `${owner}-${repo}`, "stargazers.db");
  return { owner, repo, dbPath };
}

async function runCycle(owner: string, repo: string, dbPath: string): Promise<void> {
  // Fetch new stargazers
  await runFetch({ owner, repo, dbPath });
  // Enrich pending profiles
  await runEnrich({ dbPath });
}

async function main(): Promise<void> {
  console.log("Starting GitHub Stargazers Enrichment Worker...");

  const { owner, repo, dbPath } = getEnvConfig();

  // Initialize database
  const db = await getDb(dbPath);
  await initializeSchema(db);
  console.log("Database initialized");

  // Run immediately on start
  console.log(`[${new Date().toISOString()}] Running initial cycle...`);
  await runCycle(owner, repo, dbPath);

  // Then run every hour
  setInterval(async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled cycle...`);
    try {
      await runCycle(owner, repo, dbPath);
    } catch (error) {
      console.error("Scheduled cycle failed:", error);
    }
  }, HOUR_MS);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await closeDb();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\nShutting down...");
    await closeDb();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
