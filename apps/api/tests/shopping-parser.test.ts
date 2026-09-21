import assert from "node:assert/strict";
import test from "node:test";

import { SYSTEM_SHOPPING_CATEGORIES } from "../src/modules/shopping/categories.js";
import {
  normalizeShoppingTerm,
  parseShoppingText,
} from "../src/modules/shopping/parser.js";

const categories = SYSTEM_SHOPPING_CATEGORIES.map((category) => ({
  id: category.key,
  key: category.key,
  name: category.name,
}));

test("zerlegt den deutschen Beispieltext deterministisch mit Mengen", () => {
  const items = parseShoppingText(
    "zwei Liter Milch, Käse, Hähnchenbrust, Chips und sechs Äpfel",
    { categories, personalRules: new Map(), source: "manual" },
  );

  assert.deepEqual(
    items.map((item) => [
      item.productName,
      item.quantity,
      item.unit,
      item.categoryId,
    ]),
    [
      ["Milch", 2, "liter", "dairy"],
      ["Käse", null, null, "dairy"],
      ["Hähnchenbrust", null, null, "meat"],
      ["Chips", null, null, "snacks"],
      ["Äpfel", 6, "piece", "produce"],
    ],
  );
});

test("akzeptiert Aufzählungen, Singularformen und unterstützte Einheiten", () => {
  const items = parseShoppingText(
    "- 500 Gramm Käse\n- eine Packung Chips; 3 kg Äpfel\n- 6 Stück Milch",
    { categories, personalRules: new Map(), source: "dictation" },
  );

  assert.deepEqual(
    items.map((item) => [item.quantity, item.unit]),
    [
      [500, "gram"],
      [1, "pack"],
      [3, "kilogram"],
      [6, "piece"],
    ],
  );
  assert.ok(items.every((item) => item.source === "dictation"));
});

test("ordnet unbekannte Begriffe sichtbar Sonstiges zu und respektiert persönliche Regeln", () => {
  const items = parseShoppingText("Quarx, Milch", {
    categories,
    personalRules: new Map([[normalizeShoppingTerm("Quarx"), "drinks"]]),
    source: "manual",
  });

  assert.equal(items[0]?.categoryId, "drinks");
  assert.equal(items[0]?.uncertain, false);
  assert.equal(items[1]?.categoryId, "dairy");
});

test("leere und reine Satzzeichen-Eingaben erzeugen keine Positionen", () => {
  assert.deepEqual(
    parseShoppingText(" , ;\n• ", {
      categories,
      personalRules: new Map(),
      source: "manual",
    }),
    [],
  );
});
