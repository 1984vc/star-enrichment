import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";

let instance: DuckDBInstance | null = null;
let currentPath: string | null = null;

const DEFAULT_DB_PATH = "./data/stargazers.db";

export async function getDb(dbPath?: string): Promise<DuckDBInstance> {
  const resolvedPath = path.resolve(process.cwd(), dbPath || DEFAULT_DB_PATH);

  if (!instance || currentPath !== resolvedPath) {
    if (instance) {
      instance.closeSync();
    }
    instance = await DuckDBInstance.create(resolvedPath);
    currentPath = resolvedPath;
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    instance.closeSync();
    instance = null;
  }
}
