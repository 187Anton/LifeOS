import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGitHubIntegration: vi.fn(),
  createGitHubConnection: vi.fn(),
  setGitHubConnectionEnabled: vi.fn(),
  testGitHubConnection: vi.fn(),
  listGitHubRepositories: vi.fn(),
  getGitHubRepositorySnapshot: vi.fn(),
  revokeGitHubConnection: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: mocks,
}));

import { GitHubIntegrationPanel } from "../../src/components/GitHubIntegrationPanel";

const connection = {
  id: "github-connection-1",
  name: "Synthetischer GitHub-Zugang",
  enabled: false,
  readOnly: true as const,
  status: "disabled" as const,
  tokenConfigured: true as const,
  accountLogin: null,
  lastErrorCode: null,
  lastTestedAt: null,
  lastFetchedAt: null,
  rateLimit: { remaining: null, resetAt: null },
};

describe("optionale GitHub-Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGitHubIntegration.mockResolvedValue({
      available: true,
      networkDefault: "disabled",
      mode: "read_only",
      apiHost: "api.github.com",
      connections: [connection],
    });
  });

  it("bleibt standardmäßig deaktiviert und führt keinen GitHub-Aufruf aus", async () => {
    render(<GitHubIntegrationPanel />);

    expect(
      await screen.findByRole("heading", { name: "GitHub-Integration" }),
    ).toBeVisible();
    expect(screen.getByText("Deaktiviert")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Verbindung testen" }),
    ).toBeDisabled();
    expect(mocks.testGitHubConnection).not.toHaveBeenCalled();
    expect(mocks.listGitHubRepositories).not.toHaveBeenCalled();
  });

  it("sendet den Token nur beim lokalen Konfigurieren und leert das Formular", async () => {
    const user = userEvent.setup();
    mocks.createGitHubConnection.mockResolvedValue(connection);
    render(<GitHubIntegrationPanel />);

    await screen.findByRole("heading", { name: "GitHub-Integration" });
    await user.type(screen.getByLabelText("Bezeichnung"), "Privates GitHub");
    await user.type(
      screen.getByLabelText("GitHub-Token"),
      "synthetic-local-github-token",
    );
    await user.click(
      screen.getByRole("button", { name: "Verschlüsselt konfigurieren" }),
    );

    expect(mocks.createGitHubConnection).toHaveBeenCalledWith({
      name: "Privates GitHub",
      token: "synthetic-local-github-token",
    });
    expect(await screen.findByText(/verschlüsselt gespeichert/)).toBeVisible();
    expect(
      screen.queryByDisplayValue("synthetic-local-github-token"),
    ).toBeNull();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("zeigt alle angeforderten Repository-Metadaten nur flüchtig an", async () => {
    const user = userEvent.setup();
    mocks.getGitHubIntegration.mockResolvedValue({
      available: true,
      networkDefault: "disabled",
      mode: "read_only",
      apiHost: "api.github.com",
      connections: [{ ...connection, enabled: true, status: "ready" }],
    });
    mocks.listGitHubRepositories.mockResolvedValue({
      repositories: [
        {
          id: "1",
          owner: "synthetic-owner",
          name: "synthetic-repository",
          fullName: "synthetic-owner/synthetic-repository",
          description: "Synthetische Metadaten",
          private: true,
          archived: false,
          defaultBranch: "main",
          updatedAt: "2034-03-01T10:00:00.000Z",
        },
      ],
      rateLimit: { remaining: 4999, resetAt: null },
    });
    mocks.getGitHubRepositorySnapshot.mockResolvedValue({
      repository: {
        id: "1",
        owner: "synthetic-owner",
        name: "synthetic-repository",
        fullName: "synthetic-owner/synthetic-repository",
        description: "Synthetische Metadaten",
        private: true,
        archived: false,
        defaultBranch: "main",
        updatedAt: "2034-03-01T10:00:00.000Z",
      },
      issues: [
        {
          number: 1,
          title: "Issue-Test",
          state: "open",
          updatedAt: "2034-03-01T10:00:00.000Z",
        },
      ],
      pullRequests: [
        {
          number: 2,
          title: "PR-Test",
          state: "open",
          draft: false,
          updatedAt: "2034-03-01T10:00:00.000Z",
        },
      ],
      commits: [
        {
          sha: "a".repeat(40),
          message: "Commit-Test",
          authoredAt: null,
          authorLogin: null,
        },
      ],
      releases: [
        {
          tagName: "v-test",
          name: "Release-Test",
          draft: false,
          prerelease: true,
          publishedAt: null,
        },
      ],
      ciRuns: [
        {
          id: "3",
          name: "CI-Test",
          status: "completed",
          conclusion: "success",
          headBranch: "main",
          updatedAt: "2034-03-01T10:00:00.000Z",
        },
      ],
      rateLimit: { remaining: 4993, resetAt: null },
    });
    render(<GitHubIntegrationPanel />);

    await user.click(
      await screen.findByRole("button", { name: "Repositories laden" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Repository"),
      "synthetic-owner/synthetic-repository",
    );
    await user.click(
      screen.getByRole("button", { name: "Aktuellen Stand lesen" }),
    );

    expect(await screen.findByText(/Issue-Test/)).toBeVisible();
    expect(screen.getByText(/PR-Test/)).toBeVisible();
    expect(screen.getByText(/Commit-Test/)).toBeVisible();
    expect(screen.getByText(/Release-Test/)).toBeVisible();
    expect(screen.getByText(/CI-Test/)).toBeVisible();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});
