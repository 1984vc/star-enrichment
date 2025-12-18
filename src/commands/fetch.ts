import { mkdirSync } from "fs";
import path from "path";
import { getDb, initializeSchema, closeDb } from "../db/index.js";
import { runFetch } from "../worker/index.js";

export interface FetchCommandOptions {
  dataDir?: string;
  limit?: number;
}

export function getRepoDataDir(repo: string, baseDir: string = "./data"): string {
  const parts = repo.split("/");
  if (parts.length !== 2) {
    throw new Error("Repository must be in format owner/repo");
  }
  const [owner, repoName] = parts;
  return path.join(baseDir, `${owner}-${repoName}`);
}

export function getRepoDbPath(repo: string, baseDir?: string): string {
  return path.join(getRepoDataDir(repo, baseDir), "stargazers.db");
}

export async function fetchCommand(repo: string, options: FetchCommandOptions): Promise<void> {
  const parts = repo.split("/");
  if (parts.length !== 2) {
    console.error("Error: Repository must be in format owner/repo");
    process.exit(1);
  }

  const [owner, repoName] = parts;
  const dataDir = getRepoDataDir(repo, options.dataDir);
  const dbPath = path.join(dataDir, "stargazers.db");

  try {
    // Ensure data directory exists
    mkdirSync(dataDir, { recursive: true });
    console.log(`Using data directory: ${dataDir}`);

    // Initialize database
    const db = await getDb(dbPath);
    await initializeSchema(db);

    // Fetch stargazers (no enrichment)
    const stats = await runFetch({
      owner,
      repo: repoName,
      dbPath,
      limit: options.limit,
    });

    console.log("\nDone:");
    console.log(`  Total stargazers: ${stats.total}`);
    console.log(`  New: ${stats.new}`);
  } catch (error) {
    console.error("Fetch failed:", error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}
