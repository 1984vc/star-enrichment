import path from "path";
import { getDb, initializeSchema, closeDb } from "../db/index.js";
import { runEnrich } from "../worker/index.js";
import { getRepoDataDir } from "./fetch.js";

export interface EnrichCommandOptions {
  dataDir?: string;
  limit?: number;
  sample?: number;
}

export async function enrichCommand(repo: string, options: EnrichCommandOptions): Promise<void> {
  const dataDir = getRepoDataDir(repo, options.dataDir);
  const dbPath = path.join(dataDir, "stargazers.db");

  try {
    // Initialize database (in case it doesn't exist)
    const db = await getDb(dbPath);
    await initializeSchema(db);

    // Run enrichment
    const stats = await runEnrich({
      dbPath,
      limit: options.limit,
      sample: options.sample,
    });

    console.log("\nDone:");
    console.log(`  Enriched: ${stats.enriched}`);
    console.log(`  Failed: ${stats.failed}`);
    console.log(`  Remaining: ${stats.pending}`);
  } catch (error) {
    console.error("Enrich failed:", error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}
