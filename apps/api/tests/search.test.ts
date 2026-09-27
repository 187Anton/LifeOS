import assert from "node:assert/strict";
import test from "node:test";

import type { SearchCandidate } from "../src/modules/search/repository.js";
import {
  LocalSearchService,
  MAX_RESULT_UNITS,
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
  locators: values.locators ?? [],
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
        locators: [
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
        locators: [
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
        locators: Array.from({ length: MAX_RESULT_UNITS + 5 }, (_, index) => ({
          page: index + 1,
          text: "Prüfungsplanung",
        })),
      }),
    ],
  });
  const response = await search.search("owner", "Prüfungsplanung");
  assert.equal(response.results[0]?.pages.length, MAX_RESULT_UNITS);
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
        locators: [{ page: 2, text: "Prüfungsplanung im Skript" }],
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

test("nennt bei Foliensätzen die betroffene Folie und nie eine Seite", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "folien",
        title: "Foliensatz",
        contentType: "document",
        locators: [
          { slide: 1, text: "Einleitung ohne Stichwort." },
          { slide: 7, text: "Die Prüfungsplanung steht auf dieser Folie." },
          { slide: 12, text: "Anhang zur Prüfungsplanung." },
        ],
      }),
    ],
  });

  const response = await search.search("owner", "Prüfungsplanung");
  const result = response.results[0];
  assert.equal(result?.slide, 7);
  assert.deepEqual(result?.slides, [7, 12]);
  assert.equal(result?.page, null);
  assert.deepEqual(result?.pages, []);
  assert.equal(result?.paragraph, null);
  assert.deepEqual(result?.paragraphs, []);
  assert.equal(result?.section, null);
});

test("nennt bei Fließtextformaten den betroffenen Absatz und seinen Abschnitt", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "fliesstext",
        title: "Hausarbeit",
        contentType: "document",
        locators: [
          { paragraph: 3, section: "Einleitung", text: "Ohne Stichwort." },
          {
            paragraph: 18,
            section: "Methodik",
            text: "Die Prüfungsplanung wird hier beschrieben.",
          },
          {
            paragraph: 24,
            section: "Ergebnisse",
            text: "Prüfungsplanung kurz.",
          },
        ],
      }),
    ],
  });

  const response = await search.search("owner", "Prüfungsplanung");
  const result = response.results[0];
  assert.equal(result?.paragraph, 18);
  assert.deepEqual(result?.paragraphs, [18, 24]);
  assert.equal(result?.section, "Methodik");
  /** Eine Absatznummer darf nie als Seitenzahl erscheinen. */
  assert.equal(result?.page, null);
  assert.deepEqual(result?.pages, []);
  assert.equal(result?.slide, null);
  assert.deepEqual(result?.slides, []);
});

test("verlangt Absatztreffer vollständig innerhalb eines Absatzes", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "verteilt",
        title: "Hausarbeit",
        contentType: "document",
        locators: [
          { paragraph: 1, section: null, text: "Hier steht nur Planung." },
          { paragraph: 2, section: null, text: "Und hier nur Prüfungs." },
        ],
      }),
    ],
  });
  assert.deepEqual(
    (await search.search("owner", "Prüfungs Planung")).results,
    [],
  );
});

test("liefert ohne Abschnittsüberschrift keinen erfundenen Abschnitt", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "ohne-abschnitt",
        title: "Notizdatei",
        contentType: "document",
        locators: [
          {
            paragraph: 2,
            section: null,
            text: "Prüfungsplanung ohne Kapitel.",
          },
        ],
      }),
    ],
  });
  const response = await search.search("owner", "Prüfungsplanung");
  assert.equal(response.results[0]?.paragraph, 2);
  assert.equal(response.results[0]?.section, null);
});

test("begrenzt Folien und Absätze je Treffer getrennt", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "viele-folien",
        title: "Foliensatz",
        contentType: "document",
        locators: Array.from({ length: MAX_RESULT_UNITS + 5 }, (_, index) => ({
          slide: index + 1,
          text: "Prüfungsplanung",
        })),
      }),
    ],
  });
  const response = await search.search("owner", "Prüfungsplanung");
  assert.equal(response.results[0]?.slides.length, MAX_RESULT_UNITS);
  assert.equal(response.results[0]?.slide, 1);
});

test("toleriert unerwartete gespeicherte Fundstellen ohne Falschzuordnung", async () => {
  const search = new LocalSearchService({
    listReleasedCandidates: async () => [
      candidate({
        id: "gemischt",
        title: "Skript",
        contentType: "document",
        locators: [
          { slide: 2, text: "Prüfungsplanung auf einer Folie." },
          { page: 5, text: "Prüfungsplanung auf einer Seite." },
        ],
      }),
    ],
  });
  const response = await search.search("owner", "Prüfungsplanung");
  const result = response.results[0];
  assert.deepEqual(result?.pages, [5]);
  assert.deepEqual(result?.slides, [2]);
  assert.deepEqual(result?.paragraphs, []);
});
