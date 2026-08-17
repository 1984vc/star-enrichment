import type { GitHubStargazer, GitHubUserProfile, GitHubRepo, GitHubCommit, GitHubSocialAccount } from "./types.js";

const GITHUB_API_BASE = "https://api.github.com";
const MIN_DELAY_MS = 100; // Minimum delay between requests
const MAX_DELAY_MS = 60000; // Maximum delay (1 minute)
const RATE_LIMIT_THRESHOLD = 500; // Start adaptive pacing when below this
const RATE_LIMIT_RESERVE = 20; // Always keep this many calls in reserve
const GITHUB_API_VERSION = "2026-03-10";

interface GraphQLError {
  message: string;
  type?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface GraphQLStargazersResult {
  repository: {
    stargazers: {
      edges: Array<{ node: { databaseId: number | null; login: string } | null; starredAt: string | null }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

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
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "star-enrichment",
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
      const responseBody = await response.text();
      let message = response.statusText;

      try {
        const parsed = JSON.parse(responseBody) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        // Keep the HTTP status text when GitHub does not return JSON.
      }

      const requiredPermissions = response.headers.get("X-Accepted-GitHub-Permissions");
      const permissionsHint = requiredPermissions ? ` (required permissions: ${requiredPermissions})` : "";
      throw new Error(`GitHub API error: ${response.status} ${message}${permissionsHint}`);
    }

    return response.json() as Promise<T>;
  }

  private async graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    await this.adaptiveWait();

    const response = await fetch(`${GITHUB_API_BASE}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "star-enrichment",
      },
      body: JSON.stringify({ query, variables }),
    });

    this.rateLimitRemaining = parseInt(response.headers.get("X-RateLimit-Remaining") || "5000", 10);
    this.rateLimitReset = parseInt(response.headers.get("X-RateLimit-Reset") || "0", 10);
    this.requestCount++;

    if (this.requestCount === 1 || this.requestCount % 100 === 0 || this.rateLimitRemaining < this.lastLoggedRemaining - 500) {
      this.logRateLimitStatus();
      this.lastLoggedRemaining = this.rateLimitRemaining;
    }

    const body = await response.json() as GraphQLResponse<T>;

    const rateLimited = this.rateLimitRemaining === 0 && (
      response.status === 403 || body.errors?.some((error) => error.type === "RATE_LIMITED")
    );
    if (rateLimited) {
      const waitTime = Math.max(0, this.rateLimitReset * 1000 - Date.now());
      console.log(`Rate limited! Waiting ${Math.ceil(waitTime / 1000)}s until reset...`);
      await this.sleep(waitTime + 1000); // Add 1s buffer
      return this.graphqlRequest<T>(query, variables);
    }

    if (!response.ok || body.errors?.length) {
      const message = body.errors?.map((error) => error.message).join("; ") || response.statusText;
      throw new Error(`GitHub GraphQL API error: ${response.status} ${message}`);
    }

    if (!body.data) {
      throw new Error("GitHub GraphQL API error: response did not contain data");
    }

    return body.data;
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
    let cursor: string | null = null;
    const first = 100;
    let page = 1;

    while (true) {
      console.log(`Fetching stargazers page ${page}...`);
      const result: GraphQLStargazersResult = await this.graphqlRequest<GraphQLStargazersResult>(
        `query ListStargazers($owner: String!, $repo: String!, $first: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            stargazers(first: $first, after: $after) {
              edges { starredAt node { databaseId login } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { owner, repo, first, after: cursor }
      );

      if (!result.repository) {
        throw new Error(`GitHub GraphQL API error: repository ${owner}/${repo} was not found`);
      }

      const connection = result.repository.stargazers;
      const stargazers = connection.edges
        .filter((edge): edge is { node: { databaseId: number; login: string }; starredAt: string } =>
          edge.node !== null && edge.node.databaseId !== null && edge.starredAt !== null
        )
        .map((edge) => ({
          starred_at: edge.starredAt,
          user: { id: edge.node.databaseId, login: edge.node.login },
        }));

      allStargazers.push(...stargazers);

      if (!connection.pageInfo.hasNextPage) {
        break;
      }

      if (!connection.pageInfo.endCursor) {
        throw new Error("GitHub GraphQL API error: response indicated another page but did not provide an end cursor");
      }

      cursor = connection.pageInfo.endCursor;
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
