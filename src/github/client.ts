import type { GitHubStargazer, GitHubUserProfile } from "./types.js";

const GITHUB_API_BASE = "https://api.github.com";

export class GitHubClient {
  private token: string;
  private rateLimitRemaining: number = 5000;
  private rateLimitReset: number = 0;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    await this.waitForRateLimit();

    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...headers,
      },
    });

    this.rateLimitRemaining = parseInt(response.headers.get("X-RateLimit-Remaining") || "5000", 10);
    this.rateLimitReset = parseInt(response.headers.get("X-RateLimit-Reset") || "0", 10);

    if (!response.ok) {
      if (response.status === 403 && this.rateLimitRemaining === 0) {
        const waitTime = this.rateLimitReset * 1000 - Date.now();
        console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
        return this.request<T>(endpoint, headers);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.rateLimitRemaining < 10) {
      const waitTime = this.rateLimitReset * 1000 - Date.now();
      if (waitTime > 0) {
        console.log(`Rate limit low (${this.rateLimitRemaining}). Waiting ${Math.ceil(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
      }
    }
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
      await this.sleep(100);
    }

    return allStargazers;
  }

  async getUserProfile(username: string): Promise<GitHubUserProfile> {
    return this.request<GitHubUserProfile>(`/users/${username}`);
  }
}
