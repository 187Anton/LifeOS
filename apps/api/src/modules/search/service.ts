import type { SearchResponse, SearchResultResponse } from "@lifeos/contracts";

import type { SearchCandidate, SearchRepository } from "./repository.js";

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeSearchQuery = (query: string) => [
  ...new Set(normalize(query).match(/[\p{L}\p{N}]+/gu) ?? []),
];

const snippet = (value: string, tokens: string[]) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "Treffer in lokalen Metadaten.";
  const normalized = normalize(compact);
  const positions = tokens
    .map((token) => normalized.indexOf(token))
    .filter((index) => index >= 0);
  const position = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, position - 55);
  const excerpt = compact.slice(start, start + 180);
  return `${start > 0 ? "…" : ""}${excerpt}${start + 180 < compact.length ? "…" : ""}`;
};

const matchCandidate = (
  candidate: SearchCandidate,
  query: string,
  tokens: string[],
): (SearchResultResponse & { score: number }) | null => {
  const title = normalize(candidate.title);
  const content = normalize(candidate.content);
  const metadata = normalize(candidate.metadata);
  const combined = `${title} ${content} ${metadata}`;
  if (!tokens.every((token) => combined.includes(token))) return null;
  const phrase = normalize(query);
  const titleMatches = tokens.filter((token) => title.includes(token)).length;
  const contentMatches = tokens.filter((token) =>
    content.includes(token),
  ).length;
  const metadataMatches = tokens.filter((token) =>
    metadata.includes(token),
  ).length;
  const reason = titleMatches
    ? "title"
    : contentMatches
      ? "content"
      : "metadata";
  return {
    id: candidate.id,
    title: candidate.title,
    contentType: candidate.contentType,
    source: candidate.source,
    updatedAt: candidate.updatedAt.toISOString(),
    snippet: snippet(
      reason === "title"
        ? `${candidate.title} ${candidate.content}`
        : reason === "content"
          ? candidate.content
          : candidate.metadata,
      tokens,
    ),
    matchReason: reason,
    detailPath: candidate.detailPath,
    ownerId: candidate.ownerId,
    searchEnabled: true,
    score:
      titleMatches * 12 +
      contentMatches * 4 +
      metadataMatches * 2 +
      (phrase && title.includes(phrase) ? 30 : 0) +
      (phrase && content.includes(phrase) ? 8 : 0),
  };
};

const withoutScore = ({
  id,
  title,
  contentType,
  source,
  updatedAt,
  snippet: resultSnippet,
  matchReason,
  detailPath,
  ownerId,
  searchEnabled,
}: SearchResultResponse & { score: number }): SearchResultResponse => ({
  id,
  title,
  contentType,
  source,
  updatedAt,
  snippet: resultSnippet,
  matchReason,
  detailPath,
  ownerId,
  searchEnabled,
});

export class LocalSearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(userId: string, rawQuery: string): Promise<SearchResponse> {
    const query = rawQuery.trim();
    const tokens = tokenizeSearchQuery(query);
    if (!tokens.length) return { query, results: [] };
    const results = (await this.repository.listReleasedCandidates(userId))
      .map((candidate) => matchCandidate(candidate, query, tokens))
      .filter(
        (result): result is SearchResultResponse & { score: number } =>
          result !== null,
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.title.localeCompare(right.title, "de"),
      )
      .slice(0, 50)
      .map(withoutScore);
    return { query, results };
  }
}
