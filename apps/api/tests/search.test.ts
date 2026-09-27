import assert from "node:assert/strict";
import test from "node:test";

import type { SearchCandidate } from "../src/modules/search/repository.js";
import {
  LocalSearchService,
  MAX_RESULT_PAGES,
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
  studyModuleId: values.studyModuleId ?? null,
  pages: values.pages ?? [],
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

test("nennt bei seitenbezogenen Treffern die betroffene Seite", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "pdf",
        title: "Vorlesungsskript",
        contentType: "document",
        detailPath: "/knowledge/documents/pdf",
        pages: [
          { page: 1, text: "Einleitung ohne Stichwort." },
          { page: 4, text: "Die Prüfungsplanung steht auf dieser Seite." },
          { page: 9, text: "Anhang zur Prüfungsplanung." },
        ],
      }),
      candidate({
        id: "note",
        title: "Notiz",
        content: "Prüfungsplanung als Fließtext.",
      }),
    ],
  });

  const response = await search.search("owner", "Prüfungsplanung");
  const pdf = response.results.find((result) => result.id === "pdf");
  const note = response.results.find((result) => result.id === "note");
  assert.equal(pdf?.matchReason, "content");
  assert.equal(pdf?.page, 4);
  assert.deepEqual(pdf?.pages, [4, 9]);
  assert.match(pdf?.snippet ?? "", /Prüfungsplanung steht auf dieser Seite/);
  /** Formate ohne Seitenangabe bleiben ohne Seitenbezug. */
  assert.equal(note?.page, null);
  assert.deepEqual(note?.pages, []);
});

test("verlangt bei seitenbezogenen Quellen einen vollständigen Treffer auf einer Seite", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "verteilt",
        title: "Skript",
        contentType: "document",
        pages: [
          { page: 1, text: "Hier steht nur Planung." },
          { page: 2, text: "Und hier nur Prüfungs." },
        ],
      }),
    ],
  });
  /** Beide Begriffe stehen je auf einer anderen Seite: kein Seitentreffer. */
  assert.deepEqual(
    (await search.search("owner", "Prüfungs Planung")).results,
    [],
  );
});

test("begrenzt die Zahl gemeldeter Seiten je Treffer", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "viele",
        title: "Skript",
        contentType: "document",
        pages: Array.from({ length: MAX_RESULT_PAGES + 5 }, (_, index) => ({
          page: index + 1,
          text: "Prüfungsplanung",
        })),
      }),
    ],
  });
  const response = await search.search("owner", "Prüfungsplanung");
  assert.equal(response.results[0]?.pages.length, MAX_RESULT_PAGES);
  assert.equal(response.results[0]?.page, 1);
});

test("grenzt die Suche auf ein Studienmodul und dessen freigegebene Quellen ein", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "modul",
        title: "Modul Prüfungsplanung",
        contentType: "study_module",
        studyModuleId: null,
        source: { type: "study_module", id: "modul", title: "Modul" },
      }),
      candidate({
        id: "eintrag",
        title: "Eintrag Prüfungsplanung",
        contentType: "study_entry",
        studyModuleId: "modul-a",
      }),
      candidate({
        id: "notiz",
        title: "Notiz Prüfungsplanung",
        contentType: "note",
        studyModuleId: "modul-a",
      }),
      candidate({
        id: "dokument",
        title: "Dokument Prüfungsplanung",
        contentType: "document",
        studyModuleId: "modul-a",
        pages: [{ page: 2, text: "Prüfungsplanung im Skript" }],
      }),
      candidate({
        id: "fremdmodul",
        title: "Anderes Modul Prüfungsplanung",
        contentType: "note",
        studyModuleId: "modul-b",
      }),
      candidate({
        id: "projekt",
        title: "Projekt Prüfungsplanung",
        contentType: "project",
        studyModuleId: "modul-a",
      }),
    ],
  });

  const response = await search.search("owner", "Prüfungsplanung", {
    studyModuleId: "modul-a",
  });
  assert.deepEqual(response.results.map((result) => result.id).sort(), [
    "dokument",
    "eintrag",
    "notiz",
  ]);
  /** Ohne Modulfilter bleibt die Suche unverändert vollständig. */
  const unbounded = await search.search("owner", "Prüfungsplanung");
  assert.equal(unbounded.results.length, 6);
});
