#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { fetchCommand } from "./commands/fetch.js";
import { enrichCommand } from "./commands/enrich.js";
import { dumpCommand } from "./commands/dump.js";

const program = new Command();

program
  .name("star-enrichment")
  .description("GitHub Stargazers Enrichment Tool")
  .version("1.0.0");

program
  .command("fetch <repo>")
  .description("Fetch stargazers from a GitHub repo (format: owner/repo)")
  .option("-d, --data-dir <path>", "Base data directory", "./data")
  .option("-l, --limit <n>", "Limit to last N stargazers", parseInt)
  .action(fetchCommand);

program
  .command("enrich <repo>")
  .description("Enrich pending profiles with GitHub data and LLM extraction")
  .option("-d, --data-dir <path>", "Base data directory", "./data")
  .option("-l, --limit <n>", "Limit number of profiles to enrich", parseInt)
  .option("-s, --sample <fraction>", "Random sample fraction (0.0-1.0, e.g. 0.1 for 10%)", parseFloat)
  .action(enrichCommand);

program
  .command("dump <repo>")
  .description("Export enriched profiles to CSV")
  .option("-d, --data-dir <path>", "Base data directory", "./data")
  .option("-o, --output <path>", "Output file path (default: <data-dir>/<repo>/export.csv, use - for stdout)")
  .action(dumpCommand);

program.parse();
