import { generateObject } from "ai";
import { getOpenRouter } from "./llm.js";
import { EnrichedProfileSchema, type EnrichedProfile } from "./types.js";
import type { GitHubUserProfile } from "../github/types.js";

export async function extractProfileData(profile: GitHubUserProfile): Promise<EnrichedProfile> {
  const openrouter = getOpenRouter();

  const { object } = await generateObject({
    model: openrouter("google/gemini-2.5-flash-lite"),
    schema: EnrichedProfileSchema,
    prompt: `Extract structured data from this GitHub profile. Be conservative - only extract information you're confident about.

GitHub Profile:
- Username: ${profile.login}
- Name: ${profile.name || "N/A"}
- Bio: ${profile.bio || "N/A"}
- Location: ${profile.location || "N/A"}
- Company: ${profile.company || "N/A"}
- Blog/Website: ${profile.blog || "N/A"}
- Twitter: ${profile.twitter_username || "N/A"}

Extract:
1. country: Infer the country from the location field if possible. Return null if uncertain.
2. employers: Extract past and current employers from the company field and bio. Mark current employer as current=true.
3. linkedin_url: Look for LinkedIn URLs in the bio or blog field. Return null if not found.
4. website_url: Extract personal website URL from the blog field (ignore LinkedIn, Twitter, or GitHub links). Return null if not found.
5. university: Look for university/college names in the bio. Return null if not found.

Return null for any field you cannot confidently determine.`,
  });

  return object;
}
