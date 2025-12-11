import type { DuckDBInstance } from "@duckdb/node-api";

export async function initializeSchema(db: DuckDBInstance): Promise<void> {
  const connection = await db.connect();

  try {
    await connection.run(`
      CREATE TABLE IF NOT EXISTS stargazers (
        id INTEGER PRIMARY KEY,
        username VARCHAR NOT NULL UNIQUE,
        starred_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        enriched_at TIMESTAMP,
        enrichment_status VARCHAR DEFAULT 'pending'
      )
    `);

    await connection.run(`
      CREATE TABLE IF NOT EXISTS enriched_profiles (
        github_id INTEGER PRIMARY KEY,
        name VARCHAR,
        bio TEXT,
        location VARCHAR,
        company VARCHAR,
        country VARCHAR,
        employers TEXT,
        linkedin_url VARCHAR,
        website_url VARCHAR,
        university VARCHAR,
        twitter_username VARCHAR,
        raw_github_profile TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } finally {
    connection.closeSync();
  }
}
