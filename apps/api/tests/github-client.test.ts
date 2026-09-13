import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubNetworkError,
  HttpGitHubReadClient,
} from "../src/modules/github-integration/client.js";

const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

test("verwendet ausschließlich GET am festen GitHub-Ursprung und redigiert Fremdtext", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const client = new HttpGitHubReadClient((async (input, init) => {
    observedUrl = String(input);
    observedInit = init;
    return jsonResponse(
      { login: "synthetic\naccount" },
      {
        "x-ratelimit-remaining": "42",
        "x-ratelimit-reset": "2022846400",
      },
    );
  }) as typeof fetch);

  const result = await client.getViewer("synthetic-github-client-token");

  assert.equal(observedUrl, "https://api.github.com/user");
  assert.doesNotMatch(observedUrl, /synthetic-github-client-token/);
  assert.equal(observedInit?.method, "GET");
  assert.equal(observedInit?.redirect, "manual");
  assert.equal(
    (observedInit?.headers as Record<string, string>).authorization,
    "Bearer synthetic-github-client-token",
  );
  assert.equal(result.data.login, "synthetic account");
  assert.equal(result.rateLimit.remaining, 42);
});

test("weist ursprungsfremde Weiterleitungen und zu große Antworten ab", async () => {
  const redirectClient = new HttpGitHubReadClient(
    (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.invalid/private" },
      })) as typeof fetch,
  );
  await assert.rejects(
    redirectClient.getViewer("synthetic-github-client-token"),
    (error: unknown) =>
      error instanceof GitHubNetworkError &&
      error.code === "CROSS_ORIGIN_REDIRECT",
  );

  const oversizedClient = new HttpGitHubReadClient((async () =>
    jsonResponse(
      { login: "synthetic" },
      { "content-length": String(2 * 1024 * 1024 + 1) },
    )) as typeof fetch);
  await assert.rejects(
    oversizedClient.getViewer("synthetic-github-client-token"),
    (error: unknown) =>
      error instanceof GitHubNetworkError &&
      error.code === "RESPONSE_TOO_LARGE",
  );
});

test("stoppt auch gleichursprüngliche Weiterleitungen nach zwei Schritten", async () => {
  let calls = 0;
  const client = new HttpGitHubReadClient((async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: `/redirect-${calls}` },
    });
  }) as typeof fetch);

  await assert.rejects(
    client.getViewer("synthetic-github-client-token"),
    (error: unknown) =>
      error instanceof GitHubNetworkError &&
      error.code === "TOO_MANY_REDIRECTS",
  );
  assert.equal(calls, 3);
});

test("weist Anbieterantworten oberhalb der dokumentierten Mengenlimits ab", async () => {
  const repositories = Array.from({ length: 51 }, (_, index) => ({
    id: index + 1,
    name: `repository-${index}`,
    full_name: `synthetic/repository-${index}`,
    description: null,
    private: true,
    archived: false,
    default_branch: "main",
    updated_at: "2034-03-01T10:00:00.000Z",
    owner: { login: "synthetic" },
  }));
  const client = new HttpGitHubReadClient((async () =>
    jsonResponse(repositories)) as typeof fetch);

  await assert.rejects(
    client.listRepositories("synthetic-github-client-token"),
    (error: unknown) =>
      error instanceof GitHubNetworkError && error.code === "INVALID_RESPONSE",
  );
});

test("begrenzt sowohl den Verbindungsaufbau als auch den Antwortstrom", async () => {
  const beforeHeaders = new HttpGitHubReadClient(
    ((_, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("synthetic timeout")),
        );
      })) as typeof fetch,
    5,
  );
  await assert.rejects(
    beforeHeaders.getViewer("synthetic-github-client-token"),
    (error: unknown) =>
      error instanceof GitHubNetworkError &&
      error.code === "TIMEOUT_OR_NETWORK_ERROR",
  );

  const duringBody = new HttpGitHubReadClient(
    (async (_input, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(new Error("synthetic stream timeout")),
            );
          },
        }),
        { status: 200 },
      )) as typeof fetch,
    5,
  );
  await assert.rejects(
    duringBody.getViewer("synthetic-github-client-token"),
    (error: unknown) =>
      error instanceof GitHubNetworkError &&
      error.code === "TIMEOUT_OR_NETWORK_ERROR",
  );
});
