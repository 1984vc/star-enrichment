export interface GitHubStargazer {
  starred_at: string;
  user: {
    id: number;
    login: string;
  };
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitter_username: string | null;
  email: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}
