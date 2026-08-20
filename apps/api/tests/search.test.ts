import assert from "node:assert/strict";
import test from "node:test";

import type { SearchCandidate } from "../src/modules/search/repository.js";
import {
  LocalSearchService,
  tokenizeSearchQuery,
} from "../src/modules/search/service.js";

const candidate = (
  values: Partial<SearchCandidate> & Pick<SearchCandidate, "id" | "title">,
): SearchCandidate => ({
  id: values.id,
  ownerId: values.ownerId ?? "owner",
  title: values.title,
  contentType: values.contentType ?? "note",
  source: values.source ?? {
    type: "note",
    id: values.id,
    title: values.title,
  },
  content: values.content ?? "",
  metadata: values.metadata ?? "",
  updatedAt: values.updatedAt ?? new Date("2033-01-01T12:00:00.000Z"),
  detailPath: values.detailPath ?? `/knowledge/notes/${values.id}`,
});

test("normalisiert Sonderzeichen und Akzente providerunabhängig", () => {
  assert.deepEqual(tokenizeSearchQuery("  Prüfungs-Planung, PRÜFUNG! "), [
    "prufungs",
    "planung",
    "prufung",
  ]);
  assert.deepEqual(tokenizeSearchQuery("***"), []);
});

test("liefert nachvollziehbar gewichtete Treffer mit Quellen und Ausschnitten", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "title-hit",
        title: "Prüfungsplanung",
        content: "Synthetischer Semesterablauf",
      }),
      candidate({
        id: "content-hit",
        title: "Semesterablauf",
        content: "Die lokale Prüfungsplanung bleibt nachvollziehbar.",
      }),
      candidate({
        id: "no-hit",
        title: "Unabhängiger Inhalt",
      }),
    ],
  });

  const response = await search.search("owner", "Prüfungsplanung");
  assert.equal(response.query, "Prüfungsplanung");
  assert.deepEqual(
    response.results.map((result) => result.id),
    ["title-hit", "content-hit"],
  );
  assert.equal(response.results[0]?.matchReason, "title");
  assert.equal(response.results[0]?.searchEnabled, true);
  assert.equal(response.results[0]?.source.title, "Prüfungsplanung");
  assert.match(response.results[1]?.snippet ?? "", /Prüfungsplanung/);
});

test("liefert bei leerer oder rein symbolischer Suche bewusst keine Treffer", async () => {
  let repositoryCalls = 0;
  const search = new LocalSearchService({
    listReleasedCandidates: async () => {
      repositoryCalls += 1;
      return [];
    },
  });
  assert.deepEqual(await search.search("owner", ""), {
    query: "",
    results: [],
  });
  assert.deepEqual(await search.search("owner", "***"), {
    query: "***",
    results: [],
  });
  assert.equal(repositoryCalls, 0);
});
