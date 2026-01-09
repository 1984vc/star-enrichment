import { generateObject } from "ai";
import { getOpenRouter } from "./llm.js";
import { EnrichedProfileSchema, type EnrichedProfile } from "./types.js";
import type { GitHubUserProfile } from "../github/types.js";
import { standardizeCountry } from "./country.js";

export async function extractProfileData(
  profile: GitHubUserProfile,
  candidateEmails?: string[]
): Promise<EnrichedProfile> {
  const openrouter = getOpenRouter();

  const emailInstruction = candidateEmails && candidateEmails.length > 0
    ? `6. email: The user's profile email is missing. Here are emails found in their git commits: ${candidateEmails.join(", ")}. Match one to this user based on name/username similarity. Return null if no confident match.`
    : `6. email: Use the profile email if available: ${profile.email || "N/A"}. Return null if not available.`;

  const { object } = await generateObject({
    model: openrouter("google/gemini-2.5-flash-lite"),
    schema: EnrichedProfileSchema,
    prompt: `Extract structured data from this GitHub profile. Be liberal with country inference but conservative with other fields.

GitHub Profile:
- Username: ${profile.login}
- Name: ${profile.name || "N/A"}
- Bio: ${profile.bio || "N/A"}
- Location: ${profile.location || "N/A"}
- Company: ${profile.company || "N/A"}
- Blog/Website: ${profile.blog || "N/A"}
- Twitter: ${profile.twitter_username || "N/A"}

Extract:
1. country: Be liberal in inferring the country. Use these signals IN PRIORITY ORDER:
   - **PRIORITY 1: Location field** - If present, this is the gold standard. Parse city/region/country from the location.
   - **PRIORITY 2: Company location** - If it's a well-known regional company (e.g., Google → US, Alibaba → China)
   - **PRIORITY 3: Language/cultural signals** - Only use these if location is missing:
     * Japanese characters in bio/name → Japan
     * Simplified Chinese → China
     * Traditional Chinese → Taiwan
     * Korean → South Korea
   - **PRIORITY 4: Username or other cultural indicators**
   
   IMPORTANT: Always use the location field if it exists, even if other signals suggest a different country.
   If you can make a reasonable guess, provide it. Only return null if there are truly no signals.
   Use country names like "China", "Japan", "Taiwan", "Germany", etc. or "US"/"UK" for United States/United Kingdom.

2. employers: Extract past and current employers from the company field and bio. Mark current employer as current=true.

3. linkedin_url: Look for LinkedIn URLs in the bio or blog field. Return null if not found.

4. website_url: Extract personal website URL from the blog field (ignore LinkedIn, Twitter, or GitHub links). Return null if not found.

5. university: Look for university/college names in the bio. Return null if not found.

${emailInstruction}

For non-country fields, return null if you cannot confidently determine the value.`,
  });

  // Standardize the country name
  return {
    ...object,
    country: standardizeCountry(object.country),
  };
}
