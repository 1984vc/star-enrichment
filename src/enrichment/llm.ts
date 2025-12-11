import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }
  return createOpenRouter({ apiKey });
}
