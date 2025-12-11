import "dotenv/config";
import { getDb, initializeSchema, closeDb } from "./db/index.js";
import { runWorker } from "./worker/index.js";

const HOUR_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  console.log("Starting GitHub Stargazers Enrichment Worker...");

  // Initialize database
  const db = await getDb();
  await initializeSchema(db);
  console.log("Database initialized");

  // Run immediately on start
  console.log(`[${new Date().toISOString()}] Running initial worker...`);
  await runWorker();

  // Then run every hour
  setInterval(async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled worker...`);
    try {
      await runWorker();
    } catch (error) {
      console.error("Scheduled worker failed:", error);
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
