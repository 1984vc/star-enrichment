import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";

let instance: DuckDBInstance | null = null;

export async function getDb(): Promise<DuckDBInstance> {
  if (!instance) {
    const dbPath = path.resolve(process.cwd(), "data", "stargazers.db");
    instance = await DuckDBInstance.create(dbPath);
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    instance.closeSync();
    instance = null;
  }
}
