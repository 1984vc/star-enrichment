import { writeFileSync } from "fs";
import path from "path";
import { getDb, initializeSchema, closeDb } from "../db/index.js";
import { getRepoDataDir } from "./fetch.js";

export interface DumpOptions {
  dataDir?: string;
  output?: string;
}

export async function dumpCommand(repo: string, options: DumpOptions): Promise<void> {
  const dataDir = getRepoDataDir(repo, options.dataDir);
  const dbPath = path.join(dataDir, "stargazers.db");
  const defaultOutput = path.join(dataDir, "export.csv");

  try {
    const db = await getDb(dbPath);
    await initializeSchema(db);
    const connection = await db.connect();

    const query = await connection.run(`
      SELECT
        s.username,
        s.starred_at,
        e.name,
        e.email,
        e.country,
        e.employers,
        e.linkedin_url,
        e.website_url,
        e.university,
        e.twitter_username,
        e.social_accounts
      FROM stargazers s
      LEFT JOIN enriched_profiles e ON s.id = e.github_id
      ORDER BY s.starred_at DESC
    `);

    const rows = await query.getRows();
    connection.closeSync();

    // CSV header
    const headers = [
      "username",
      "starred_at",
      "name",
      "email",
      "country",
      "current_employer",
      "past_employers",
      "linkedin_url",
      "twitter_url",
      "website_url",
      "university",
      "other_socials",
    ];

    // Escape CSV value
    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Parse employers JSON and split into current/past
    const parseEmployers = (employersJson: unknown): { current: string; past: string } => {
      if (!employersJson) return { current: "", past: "" };
      try {
        const employers = JSON.parse(String(employersJson)) as Array<{ name: string; current?: boolean }>;
        const current = employers.filter((e) => e.current).map((e) => e.name);
        const past = employers.filter((e) => !e.current).map((e) => e.name);
        return {
          current: current.join(", "),
          past: past.join(", "),
        };
      } catch {
        return { current: "", past: "" };
      }
    };

    // Parse social accounts JSON and extract linkedin, twitter, and other socials separately
    const parseSocialAccounts = (
      socialJson: unknown,
      existingLinkedin: unknown,
      existingTwitter: unknown
    ): { linkedin: string; twitter: string; others: string } => {
      let linkedin = existingLinkedin ? String(existingLinkedin) : "";
      let twitter = existingTwitter ? String(existingTwitter) : "";
      const others: string[] = [];

      if (socialJson) {
        try {
          const accounts = JSON.parse(String(socialJson)) as Array<{ provider: string; url: string }>;
          for (const account of accounts) {
            const provider = account.provider.toLowerCase();
            if (provider === "linkedin") {
              // Only use from socials if dedicated field is empty
              if (!linkedin) linkedin = account.url;
            } else if (provider === "twitter") {
              // Only use from socials if dedicated field is empty
              // Convert twitter_username to URL if it's just a username
              if (!twitter) twitter = account.url;
            } else {
              // All other socials go in the others field
              others.push(`${account.provider}: ${account.url}`);
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      // If twitter is just a username (no URL), convert it
      if (twitter && !twitter.startsWith("http")) {
        twitter = `https://twitter.com/${twitter}`;
      }

      return { linkedin, twitter, others: others.join(", ") };
    };

    // Build CSV
    const lines: string[] = [headers.join(",")];

    for (const row of rows) {
      // row: [username, starred_at, name, email, country, employers, linkedin_url, website_url, university, twitter_username, social_accounts]
      const { current, past } = parseEmployers(row[5]);
      // Pass linkedin_url (row[6]), twitter_username (row[9]), and social_accounts (row[10])
      const { linkedin, twitter, others } = parseSocialAccounts(row[10], row[6], row[9]);
      const values = [
        escapeCSV(row[0]), // username
        escapeCSV(row[1]), // starred_at
        escapeCSV(row[2]), // name
        escapeCSV(row[3]), // email
        escapeCSV(row[4]), // country
        escapeCSV(current), // current_employer
        escapeCSV(past), // past_employers
        escapeCSV(linkedin), // linkedin_url (from dedicated field or social_accounts)
        escapeCSV(twitter), // twitter_url (from dedicated field or social_accounts)
        escapeCSV(row[7]), // website_url
        escapeCSV(row[8]), // university
        escapeCSV(others), // other_socials (excludes linkedin and twitter)
      ];
      lines.push(values.join(","));
    }

    const csv = lines.join("\n");

    // Output - use explicit output path, or default to repo data dir
    const outputPath = options.output === "-" ? null : (options.output || defaultOutput);

    if (outputPath) {
      writeFileSync(outputPath, csv);
      console.error(`Exported ${rows.length} rows to ${outputPath}`);
    } else {
      console.log(csv);
    }
  } catch (error) {
    console.error("Dump failed:", error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}
