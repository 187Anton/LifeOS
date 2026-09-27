import assert from "node:assert/strict";
import test from "node:test";

import {
  locatorUnit,
  readStoredLocators,
} from "../src/modules/knowledge/document-locators.js";

/**
 * Paket 8: Die am Dokument gespeicherte Fundstellenform.
 *
 * Paket 7 hat `{ page, text }` gespeichert, Paket 8 ergänzt `{ slide, text }`
 * und `{ paragraph, section, text }`. Alle drei Formen bleiben gültig und
 * werden von genau einer Stelle gedeutet – ohne Migration und ohne zweiten
 * Speicher.
 */

test("liest Seiten-, Folien- und Absatzfundstellen aus derselben Ablage", () => {
  const stored = [
    { page: 2, text: "Seitentext" },
    { slide: 7, text: "Folientext" },
    { paragraph: 18, section: "Methodik", text: "Absatztext" },
  ];
  assert.deepEqual(readStoredLocators(stored), [
    { page: 2, text: "Seitentext" },
    { slide: 7, text: "Folientext" },
    { paragraph: 18, section: "Methodik", text: "Absatztext" },
  ]);
});

test("liefert für einen unerwarteten Wert eine leere Liste", () => {
  assert.deepEqual(readStoredLocators(null), []);
  assert.deepEqual(readStoredLocators({ page: 1 }), []);
  assert.deepEqual(readStoredLocators("[]"), []);
});

test("lässt unbrauchbare Einträge aus, statt sie umzudeuten", () => {
  const stored = [
    { page: 0, text: "ungültige Seite" },
    { page: 1.5, text: "keine ganze Zahl" },
    { page: 3, text: "" },
    { page: 4 },
    { text: "ohne Einheit" },
    null,
    [],
    "kein Objekt",
    { slide: -1, text: "ungültige Folie" },
    { paragraph: 2, text: "gültig" },
  ];
  assert.deepEqual(readStoredLocators(stored), [
    { paragraph: 2, section: null, text: "gültig" },
  ]);
});

test("behält die Abschnittsangabe nur, wenn sie eine Zeichenkette ist", () => {
  assert.deepEqual(
    readStoredLocators([
      { paragraph: 1, section: 7, text: "Absatz" },
      { paragraph: 2, section: "", text: "Absatz" },
    ]),
    [
      { paragraph: 1, section: null, text: "Absatz" },
      { paragraph: 2, section: null, text: "Absatz" },
    ],
  );
});

test("benennt die Einheit einer Fundstelle eindeutig", () => {
  assert.deepEqual(locatorUnit({ page: 2, text: "x" }), {
    kind: "page",
    number: 2,
  });
  assert.deepEqual(locatorUnit({ slide: 7, text: "x" }), {
    kind: "slide",
    number: 7,
  });
  assert.deepEqual(locatorUnit({ paragraph: 18, section: null, text: "x" }), {
    kind: "paragraph",
    number: 18,
  });
});
