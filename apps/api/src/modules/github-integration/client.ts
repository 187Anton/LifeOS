import type {
  GitHubCiRunSummaryResponse,
  GitHubCommitSummaryResponse,
  GitHubIssueSummaryResponse,
  GitHubPullRequestSummaryResponse,
  GitHubRateLimitResponse,
  GitHubReleaseSummaryResponse,
  GitHubRepositorySnapshotResponse,
  GitHubRepositorySummaryResponse,
} from "@lifeos/contracts";
import { z } from "zod";

const API_ORIGIN = "https://api.github.com";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 2;

export interface GitHubClientResult<T> {
  data: T;
  rateLimit: GitHubRateLimitResponse;
}

export interface GitHubReadClient {
  getViewer(token: string): Promise<GitHubClientResult<{ login: string }>>;
  listRepositories(
    token: string,
  ): Promise<GitHubClientResult<GitHubRepositorySummaryResponse[]>>;
  getRepositorySnapshot(
    token: string,
    owner: string,
    repository: string,
  ): Promise<GitHubClientResult<GitHubRepositorySnapshotResponse>>;
}

export class GitHubNetworkError extends Error {
  constructor(
    readonly code: string,
    readonly rateLimit: GitHubRateLimitResponse = {
      remaining: null,
      resetAt: null,
    },
  ) {
    super(
      "Die lesende GitHub-Verbindung konnte nicht sicher verarbeitet werden.",
    );
  }
}

const identifier = z.union([z.string(), z.number()]).transform(String);
const repositorySchema = z.object({
  id: identifier,
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable().optional(),
  private: z.boolean(),
  archived: z.boolean().optional().default(false),
  default_branch: z.string(),
  updated_at: z.string(),
  owner: z.object({ login: z.string() }),
});
const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  updated_at: z.string(),
  pull_request: z.unknown().optional(),
});
const pullRequestSchema = issueSchema.extend({
  draft: z.boolean().nullable().optional(),
});
const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({ date: z.string().nullable() }).nullable().optional(),
  }),
  author: z.object({ login: z.string() }).nullable().optional(),
});
const releaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable().optional(),
});
const workflowRunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: identifier,
      name: z.string().nullable().optional(),
      status: z.string().nullable(),
      conclusion: z.string().nullable(),
      head_branch: z.string().nullable(),
      updated_at: z.string(),
    }),
  ),
});

const cleanText = (value: string, maximum: number) =>
  [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, maximum);
const repositoryResponse = (
  value: z.infer<typeof repositorySchema>,
): GitHubRepositorySummaryResponse => ({
  id: value.id,
  owner: cleanText(value.owner.login, 100),
  name: cleanText(value.name, 100),
  fullName: cleanText(value.full_name, 201),
  description: value.description
    ? cleanText(value.description, 500) || null
    : null,
  private: value.private,
  archived: value.archived,
  defaultBranch: cleanText(value.default_branch, 255),
  updatedAt: value.updated_at,
});
const rateLimitFrom = (headers: Headers): GitHubRateLimitResponse => {
  const remainingValue = headers.get("x-ratelimit-remaining");
  const resetValue = headers.get("x-ratelimit-reset");
  const remaining = remainingValue === null ? null : Number(remainingValue);
  const resetSeconds = resetValue === null ? null : Number(resetValue);
  return {
    remaining:
      remaining !== null && Number.isInteger(remaining) && remaining >= 0
        ? remaining
        : null,
    resetAt:
      resetSeconds !== null && Number.isFinite(resetSeconds)
        ? new Date(resetSeconds * 1_000).toISOString()
        : null,
  };
};
const mergeRateLimits = (
  values: GitHubRateLimitResponse[],
): GitHubRateLimitResponse => ({
  remaining:
    values.flatMap((value) =>
      value.remaining === null ? [] : [value.remaining],
    ).length > 0
      ? Math.min(
          ...values.flatMap((value) =>
            value.remaining === null ? [] : [value.remaining],
          ),
        )
      : null,
  resetAt:
    values
      .map((value) => value.resetAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null,
});

export class HttpGitHubReadClient implements GitHubReadClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly requestTimeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  async getViewer(token: string) {
    const result = await this.request(
      token,
      "/user",
      z.object({ login: z.string() }),
    );
    return {
      data: { login: cleanText(result.data.login, 100) },
      rateLimit: result.rateLimit,
    };
  }

  async listRepositories(token: string) {
    const result = await this.request(
      token,
      "/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=50",
      z.array(repositorySchema),
    );
    return {
      data: result.data.map(repositoryResponse),
      rateLimit: result.rateLimit,
    };
  }

  async getRepositorySnapshot(
    token: string,
    owner: string,
    repository: string,
  ) {
    const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const [metadata, issues, pulls, commits, releases, runs] =
      await Promise.all([
        this.request(token, root, repositorySchema),
        this.request(
          token,
          `${root}/issues?state=all&per_page=20`,
          z.array(issueSchema),
        ),
        this.request(
          token,
          `${root}/pulls?state=all&per_page=20`,
          z.array(pullRequestSchema),
        ),
        this.request(
          token,
          `${root}/commits?per_page=20`,
          z.array(commitSchema),
        ),
        this.request(
          token,
          `${root}/releases?per_page=20`,
          z.array(releaseSchema),
        ),
        this.request(
          token,
          `${root}/actions/runs?per_page=20`,
          workflowRunsSchema,
        ),
      ]);
    const issueValues: GitHubIssueSummaryResponse[] = issues.data
      .filter((value) => value.pull_request === undefined)
      .map((value) => ({
        number: value.number,
        title: cleanText(value.title, 500),
        state: value.state,
        updatedAt: value.updated_at,
      }));
    const pullValues: GitHubPullRequestSummaryResponse[] = pulls.data.map(
      (value) => ({
        number: value.number,
        title: cleanText(value.title, 500),
        state: value.state,
        draft: value.draft ?? false,
        updatedAt: value.updated_at,
      }),
    );
    const commitValues: GitHubCommitSummaryResponse[] = commits.data.map(
      (value) => ({
        sha: value.sha.slice(0, 40),
        message: cleanText(value.commit.message.split("\n", 1)[0] ?? "", 500),
        authoredAt: value.commit.author?.date ?? null,
        authorLogin: value.author?.login
          ? cleanText(value.author.login, 100)
          : null,
      }),
    );
    const releaseValues: GitHubReleaseSummaryResponse[] = releases.data.map(
      (value) => ({
        tagName: cleanText(value.tag_name, 255),
        name: value.name ? cleanText(value.name, 500) || null : null,
        draft: value.draft,
        prerelease: value.prerelease,
        publishedAt: value.published_at ?? null,
      }),
    );
    const ciValues: GitHubCiRunSummaryResponse[] = runs.data.workflow_runs.map(
      (value) => ({
        id: value.id,
        name: cleanText(value.name ?? "Workflow", 500),
        status: cleanText(value.status ?? "unknown", 50),
        conclusion: value.conclusion ? cleanText(value.conclusion, 50) : null,
        headBranch: value.head_branch
          ? cleanText(value.head_branch, 255)
          : null,
        updatedAt: value.updated_at,
      }),
    );
    const rateLimit = mergeRateLimits([
      metadata.rateLimit,
      issues.rateLimit,
      pulls.rateLimit,
      commits.rateLimit,
      releases.rateLimit,
      runs.rateLimit,
    ]);
    const data: GitHubRepositorySnapshotResponse = {
      repository: repositoryResponse(metadata.data),
      issues: issueValues,
      pullRequests: pullValues,
      commits: commitValues,
      releases: releaseValues,
      ciRuns: ciValues,
      rateLimit,
    };
    return { data, rateLimit };
  }

  private async request<T>(
    token: string,
    path: string,
    schema: z.ZodType<T>,
    redirectCount = 0,
  ): Promise<GitHubClientResult<T>> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new GitHubNetworkError("INVALID_PATH");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${API_ORIGIN}${path}`, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "user-agent": "Anton-LifeOS",
            "x-github-api-version": "2022-11-28",
          },
        });
      } catch {
        throw new GitHubNetworkError("TIMEOUT_OR_NETWORK_ERROR");
      }
      const rateLimit = rateLimitFrom(response.headers);
      if ([301, 302, 307, 308].includes(response.status)) {
        if (redirectCount >= MAX_REDIRECTS)
          throw new GitHubNetworkError("TOO_MANY_REDIRECTS", rateLimit);
        const location = response.headers.get("location");
        if (!location)
          throw new GitHubNetworkError("INVALID_REDIRECT", rateLimit);
        const redirected = new URL(location, API_ORIGIN);
        if (redirected.origin !== API_ORIGIN)
          throw new GitHubNetworkError("CROSS_ORIGIN_REDIRECT", rateLimit);
        return this.request(
          token,
          `${redirected.pathname}${redirected.search}`,
          schema,
          redirectCount + 1,
        );
      }
      if (response.status === 401)
        throw new GitHubNetworkError("AUTHORIZATION_FAILED", rateLimit);
      if (
        response.status === 429 ||
        (response.status === 403 && rateLimit.remaining === 0)
      )
        throw new GitHubNetworkError("RATE_LIMITED", rateLimit);
      if (response.status === 403)
        throw new GitHubNetworkError("PERMISSION_DENIED", rateLimit);
      if (response.status === 404)
        throw new GitHubNetworkError("NOT_FOUND_OR_FORBIDDEN", rateLimit);
      if (!response.ok) throw new GitHubNetworkError("REMOTE_ERROR", rateLimit);
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > MAX_RESPONSE_BYTES)
        throw new GitHubNetworkError("RESPONSE_TOO_LARGE", rateLimit);
      const reader = response.body?.getReader();
      if (!reader) throw new GitHubNetworkError("EMPTY_RESPONSE", rateLimit);
      const chunks: Uint8Array[] = [];
      let received = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new GitHubNetworkError("RESPONSE_TOO_LARGE", rateLimit);
          }
          chunks.push(value);
        }
      } catch (error) {
        if (error instanceof GitHubNetworkError) throw error;
        throw new GitHubNetworkError("TIMEOUT_OR_NETWORK_ERROR", rateLimit);
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new GitHubNetworkError("INVALID_RESPONSE", rateLimit);
      }
      const result = schema.safeParse(parsed);
      if (!result.success)
        throw new GitHubNetworkError("INVALID_RESPONSE", rateLimit);
      return { data: result.data, rateLimit };
    } finally {
      clearTimeout(timeout);
    }
  }
}
