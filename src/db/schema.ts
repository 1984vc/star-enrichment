import type { DuckDBInstance } from "@duckdb/node-api";

export async function initializeSchema(db: DuckDBInstance): Promise<void> {
  const connection = await db.connect();

  try {
    await connection.run(`
      CREATE TABLE IF NOT EXISTS stargazers (
        id INTEGER PRIMARY KEY,
        username VARCHAR NOT NULL UNIQUE,
        starred_at TIMESTAMP,
        join_date TIMESTAMP,
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
        email VARCHAR,
        twitter_username VARCHAR,
        social_accounts TEXT,
        raw_github_profile TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add social_accounts column if it doesn't exist (for existing databases)
    await connection.run(`
      ALTER TABLE enriched_profiles ADD COLUMN IF NOT EXISTS social_accounts TEXT
    `);

    // Add join_date column if it doesn't exist (for existing databases)
    await connection.run(`
      ALTER TABLE stargazers ADD COLUMN IF NOT EXISTS join_date TIMESTAMP
    `);
  } finally {
    connection.closeSync();
  }
}
