import type { GitHubStargazer, GitHubUserProfile, GitHubRepo, GitHubCommit, GitHubSocialAccount } from "./types.js";

const GITHUB_API_BASE = "https://api.github.com";
const MIN_DELAY_MS = 100; // Minimum delay between requests
const MAX_DELAY_MS = 60000; // Maximum delay (1 minute)
const RATE_LIMIT_THRESHOLD = 500; // Start adaptive pacing when below this
const RATE_LIMIT_RESERVE = 20; // Always keep this many calls in reserve

export class GitHubClient {
  private token: string;
  private rateLimitRemaining: number = 5000;
  private rateLimitReset: number = 0;
  private requestCount: number = 0;
  private lastLoggedRemaining: number = 5000;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    // Wait based on adaptive rate limiting BEFORE request
    await this.adaptiveWait();

    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...headers,
      },
    });

    // Update rate limit info from response headers
    this.rateLimitRemaining = parseInt(response.headers.get("X-RateLimit-Remaining") || "5000", 10);
    this.rateLimitReset = parseInt(response.headers.get("X-RateLimit-Reset") || "0", 10);
    this.requestCount++;

    // Log rate limit status on first request, every 100 requests, or when it drops significantly
    if (this.requestCount === 1 || this.requestCount % 100 === 0 || this.rateLimitRemaining < this.lastLoggedRemaining - 500) {
      this.logRateLimitStatus();
      this.lastLoggedRemaining = this.rateLimitRemaining;
    }

    if (!response.ok) {
      if (response.status === 403 && this.rateLimitRemaining === 0) {
        const waitTime = Math.max(0, this.rateLimitReset * 1000 - Date.now());
        console.log(`Rate limited! Waiting ${Math.ceil(waitTime / 1000)}s until reset...`);
        await this.sleep(waitTime + 1000); // Add 1s buffer
        return this.request<T>(endpoint, headers);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async adaptiveWait(): Promise<void> {
    const now = Date.now();
    const resetTime = this.rateLimitReset * 1000;
    const timeUntilReset = Math.max(0, resetTime - now);

    // If we don't have rate limit info yet or reset is in the past, use minimum delay
    if (this.rateLimitReset === 0 || timeUntilReset <= 0) {
      await this.sleep(MIN_DELAY_MS);
      return;
    }

    // If we're above the threshold, just use minimum delay
    if (this.rateLimitRemaining > RATE_LIMIT_THRESHOLD) {
      await this.sleep(MIN_DELAY_MS);
      return;
    }

    // Below threshold: spread remaining calls (minus reserve) over time until reset
    const availableCalls = Math.max(1, this.rateLimitRemaining - RATE_LIMIT_RESERVE);

    // Calculate delay to spread remaining calls over time until reset
    const calculatedDelay = Math.floor(timeUntilReset / availableCalls);

    // Clamp between min and max
    const delay = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, calculatedDelay));

    // Log when we're in adaptive mode
    console.log(`Rate limiting: ${this.rateLimitRemaining} calls left, ${Math.ceil(timeUntilReset / 1000)}s until reset, waiting ${Math.ceil(delay / 1000)}s`);

    await this.sleep(delay);
  }

  private logRateLimitStatus(): void {
    const now = Date.now();
    const resetTime = this.rateLimitReset * 1000;
    const timeUntilReset = Math.max(0, resetTime - now);
    const minutes = Math.floor(timeUntilReset / 60000);
    const seconds = Math.floor((timeUntilReset % 60000) / 1000);
    console.log(`[Rate Limit] ${this.rateLimitRemaining} remaining, resets in ${minutes}m ${seconds}s (${this.requestCount} requests made)`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getStargazers(owner: string, repo: string, page: number = 1, perPage: number = 100): Promise<GitHubStargazer[]> {
    return this.request<GitHubStargazer[]>(
      `/repos/${owner}/${repo}/stargazers?page=${page}&per_page=${perPage}`,
      { Accept: "application/vnd.github.star+json" }
    );
  }

  async getAllStargazers(owner: string, repo: string): Promise<GitHubStargazer[]> {
    const allStargazers: GitHubStargazer[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      console.log(`Fetching stargazers page ${page}...`);
      const stargazers = await this.getStargazers(owner, repo, page, perPage);

      if (stargazers.length === 0) {
        break;
      }

      allStargazers.push(...stargazers);

      if (stargazers.length < perPage) {
        break;
      }

      page++;
      // Adaptive rate limiting is handled by request()
    }

    return allStargazers;
  }

  async getUserProfile(username: string): Promise<GitHubUserProfile> {
    return this.request<GitHubUserProfile>(`/users/${username}`);
  }

  async getUserRepos(username: string): Promise<GitHubRepo[]> {
    return this.request<GitHubRepo[]>(`/users/${username}/repos?sort=updated&per_page=10`);
  }

  async getRepoCommits(owner: string, repo: string, author: string): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/commits?author=${author}&per_page=30`);
  }

  async getUserSocialAccounts(username: string): Promise<GitHubSocialAccount[]> {
    return this.request<GitHubSocialAccount[]>(`/users/${username}/social_accounts`);
  }
}
