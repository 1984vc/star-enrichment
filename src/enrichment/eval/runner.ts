import "dotenv/config";
import { fixtures, type EvalFixture } from "./fixtures.js";
import { extractProfileData } from "../extractor.js";
import type { EnrichedProfile, Employer } from "../types.js";

interface FieldResult {
  field: string;
  expected: unknown;
  actual: unknown;
  match: boolean;
}

interface EvalResult {
  fixture: string;
  description: string;
  passed: boolean;
  fields: FieldResult[];
  error?: string;
}

function normalizeString(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return s.toLowerCase().trim();
}

// Country name variations that should be considered equivalent
const countryAliases: Record<string, string[]> = {
  "united states": ["us", "usa", "united states of america", "u.s.", "u.s.a."],
  "united kingdom": ["uk", "great britain", "england", "gb"],
  "germany": ["deutschland"],
};

function normalizeCountry(country: string | null): string | null {
  if (!country) return null;
  const normalized = country.toLowerCase().trim();

  // Check if it's an alias
  for (const [canonical, aliases] of Object.entries(countryAliases)) {
    if (normalized === canonical || aliases.includes(normalized)) {
      return canonical;
    }
  }
  return normalized;
}

function normalizeEmployerName(name: string): string {
  // Remove @ prefix, normalize casing
  return name.replace(/^@/, "").toLowerCase().trim();
}

function employerMatches(expected: Employer, actual: Employer): boolean {
  const expectedName = normalizeEmployerName(expected.name);
  const actualName = normalizeEmployerName(actual.name);

  const nameMatch =
    expectedName === actualName ||
    actualName.includes(expectedName) ||
    expectedName.includes(actualName);
  return nameMatch && expected.current === actual.current;
}

function compareEmployers(expected: Employer[], actual: Employer[]): { match: boolean; details: string } {
  if (expected.length === 0 && actual.length === 0) {
    return { match: true, details: "both empty" };
  }

  const matchedExpected = new Set<number>();
  const matchedActual = new Set<number>();

  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < actual.length; j++) {
      if (!matchedActual.has(j) && employerMatches(expected[i], actual[j])) {
        matchedExpected.add(i);
        matchedActual.add(j);
        break;
      }
    }
  }

  const allExpectedMatched = matchedExpected.size === expected.length;
  const precision = actual.length > 0 ? matchedActual.size / actual.length : 1;

  const match = allExpectedMatched && precision >= 0.5;

  const unmatchedExpected = expected.filter((_, i) => !matchedExpected.has(i));
  const unmatchedActual = actual.filter((_, i) => !matchedActual.has(i));

  let details = `matched ${matchedExpected.size}/${expected.length} expected`;
  if (unmatchedExpected.length > 0) {
    details += `, missing: ${unmatchedExpected.map((e) => e.name).join(", ")}`;
  }
  if (unmatchedActual.length > 0) {
    details += `, extra: ${unmatchedActual.map((e) => e.name).join(", ")}`;
  }

  return { match, details };
}

function compareField(
  field: keyof EnrichedProfile,
  expected: EnrichedProfile,
  actual: EnrichedProfile
): FieldResult {
  const expectedVal = expected[field];
  const actualVal = actual[field];

  if (field === "employers") {
    const { match, details } = compareEmployers(
      expectedVal as Employer[],
      actualVal as Employer[]
    );
    return {
      field,
      expected: JSON.stringify(expectedVal),
      actual: `${JSON.stringify(actualVal)} (${details})`,
      match,
    };
  }

  // Special handling for country field - normalize country names
  if (field === "country") {
    const normalizedExpected = normalizeCountry(expectedVal as string | null);
    const normalizedActual = normalizeCountry(actualVal as string | null);
    const match = normalizedExpected === normalizedActual;
    return { field, expected: expectedVal, actual: actualVal, match };
  }

  // For string fields, do fuzzy matching
  if (typeof expectedVal === "string" && typeof actualVal === "string") {
    const normalizedExpected = normalizeString(expectedVal);
    const normalizedActual = normalizeString(actualVal);
    const match =
      normalizedExpected === normalizedActual ||
      (normalizedActual?.includes(normalizedExpected ?? "") ?? false) ||
      (normalizedExpected?.includes(normalizedActual ?? "") ?? false);
    return { field, expected: expectedVal, actual: actualVal, match };
  }

  // For null comparisons
  if (expectedVal === null && actualVal === null) {
    return { field, expected: expectedVal, actual: actualVal, match: true };
  }

  // If we expected null but got a value, that's extra info (acceptable)
  if (expectedVal === null && actualVal !== null) {
    return {
      field,
      expected: expectedVal,
      actual: actualVal,
      match: true, // Extra info is okay
    };
  }

  // If we expected a value but got null, that's a miss
  if (expectedVal !== null && actualVal === null) {
    return { field, expected: expectedVal, actual: actualVal, match: false };
  }

  return {
    field,
    expected: expectedVal,
    actual: actualVal,
    match: JSON.stringify(expectedVal) === JSON.stringify(actualVal),
  };
}

async function runFixture(fixture: EvalFixture): Promise<EvalResult> {
  const fields: FieldResult[] = [];

  try {
    const actual = await extractProfileData(fixture.input, fixture.candidateEmails);

    const fieldNames: (keyof EnrichedProfile)[] = [
      "country",
      "employers",
      "linkedin_url",
      "website_url",
      "university",
      "email",
    ];

    for (const field of fieldNames) {
      fields.push(compareField(field, fixture.expected, actual));
    }

    const passed = fields.every((f) => f.match);

    return {
      fixture: fixture.name,
      description: fixture.description,
      passed,
      fields,
    };
  } catch (error) {
    return {
      fixture: fixture.name,
      description: fixture.description,
      passed: false,
      fields,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResult(result: EvalResult): void {
  const status = result.passed ? "✓ PASS" : "✗ FAIL";
  console.log(`\n${status}: ${result.fixture}`);
  console.log(`  ${result.description}`);

  if (result.error) {
    console.log(`  ERROR: ${result.error}`);
    return;
  }

  for (const field of result.fields) {
    const icon = field.match ? "  ✓" : "  ✗";
    console.log(`${icon} ${field.field}:`);
    console.log(`      expected: ${field.expected}`);
    console.log(`      actual:   ${field.actual}`);
  }
}

async function runEval(): Promise<void> {
  console.log("=".repeat(60));
  console.log("LLM Extraction Eval");
  console.log("=".repeat(60));
  console.log(`Running ${fixtures.length} fixtures...\n`);

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    console.log(`Running: ${fixture.name}...`);
    const result = await runFixture(fixture);
    results.push(result);

    // Small delay between API calls
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n" + "=".repeat(60));
  console.log("Results");
  console.log("=".repeat(60));

  for (const result of results) {
    printResult(result);
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Pass rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  // Field-level stats
  const fieldStats: Record<string, { pass: number; fail: number }> = {};
  for (const result of results) {
    for (const field of result.fields) {
      if (!fieldStats[field.field]) {
        fieldStats[field.field] = { pass: 0, fail: 0 };
      }
      if (field.match) {
        fieldStats[field.field].pass++;
      } else {
        fieldStats[field.field].fail++;
      }
    }
  }

  console.log("\nField-level accuracy:");
  for (const [field, stats] of Object.entries(fieldStats)) {
    const total = stats.pass + stats.fail;
    const rate = ((stats.pass / total) * 100).toFixed(1);
    console.log(`  ${field}: ${rate}% (${stats.pass}/${total})`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runEval().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
