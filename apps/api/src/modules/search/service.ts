import type {
  SearchContentType,
  SearchResponse,
  SearchResultResponse,
} from "@lifeos/contracts";

import type { SearchCandidate, SearchRepository } from "./repository.js";

/** Höchstzahl gleichzeitig genannter Fundstellenseiten je Treffer. */
export const MAX_RESULT_PAGES = 20;

/**
 * Quellarten der Modulsuche. Es sind genau die bereits freigegebenen Modul-,
 * Studien-, Notiz- und Dokumentquellen. Aufgaben bleiben ein normaler
 * Fachfilter und erhalten hier keine Suchfreigabe.
 */
export const MODULE_SCOPED_CONTENT_TYPES: ReadonlySet<SearchContentType> =
  new Set<SearchContentType>([
    "study_module",
    "study_entry",
    "note",
    "document",
  ]);

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

/**
 * Bewertet einen Kandidaten. Bei seitenbasierten Formaten muss der vollständige
 * Treffer auf einer einzelnen Seite liegen; nur dann lässt sich die betroffene
 * Seite verlässlich benennen. Formate ohne Seitenangabe werden weiterhin über
 * ihren gesamten Inhalt bewertet.
 */
const matchCandidate = (
  candidate: SearchCandidate,
  query: string,
  tokens: string[],
): (SearchResultResponse & { score: number }) | null => {
  const title = normalize(candidate.title);
  const metadata = normalize(candidate.metadata);
  const pageHits = candidate.pages.filter((page) => {
    const pageText = normalize(page.text);
    return tokens.every((token) => pageText.includes(token));
  });
  const pages = pageHits.map((page) => page.page).slice(0, MAX_RESULT_PAGES);
  const primaryPageText = pageHits[0]?.text ?? "";
  const contentSource = candidate.pages.length
    ? primaryPageText
    : candidate.content;
  const content = normalize(contentSource);
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
        ? `${candidate.title} ${contentSource}`
        : reason === "content"
          ? contentSource
          : candidate.metadata,
      tokens,
    ),
    matchReason: reason,
    detailPath: candidate.detailPath,
    ownerId: candidate.ownerId,
    searchEnabled: true,
    page: pages[0] ?? null,
    pages,
    score:
      titleMatches * 12 +
      contentMatches * 4 +
      metadataMatches * 2 +
      (phrase && title.includes(phrase) ? 30 : 0) +
      (phrase && content.includes(phrase) ? 8 : 0),
  };
};

export interface SearchOptions {
  /**
   * Beschränkt die Suche auf Objekte mit diesem Studienmodulbezug. Ohne Angabe
   * bleibt die bisherige bereichsübergreifende Suche unverändert.
   */
  studyModuleId?: string | null;
}

export class LocalSearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(
    userId: string,
    rawQuery: string,
    options: SearchOptions = {},
  ): Promise<SearchResponse> {
    const query = rawQuery.trim();
    const tokens = tokenizeSearchQuery(query);
    if (!tokens.length) return { query, results: [] };
    const studyModuleId = options.studyModuleId ?? null;
    const candidates = await this.repository.listReleasedCandidates(userId);
    const scoped = studyModuleId
      ? candidates.filter(
          (candidate) =>
            MODULE_SCOPED_CONTENT_TYPES.has(candidate.contentType) &&
            candidate.studyModuleId === studyModuleId,
        )
      : candidates;
    const results = scoped
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

function withoutScore({
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
  page,
  pages,
}: SearchResultResponse & { score: number }): SearchResultResponse {
  return {
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
    page,
    pages,
  };
}
