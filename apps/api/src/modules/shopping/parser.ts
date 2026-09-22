import type {
  ShoppingCategoryResponse,
  ShoppingItemSource,
  ShoppingPreviewItemResponse,
  ShoppingUnit,
} from "@lifeos/contracts";

export const SHOPPING_PARSER_VERSION = 1;
export const SHOPPING_PREVIEW_VERSION = 1;

export interface ShoppingParserCategory {
  id: string;
  key: string;
  name: string;
}

export interface ShoppingParserOptions {
  categories: ShoppingParserCategory[];
  personalRules: ReadonlyMap<string, string>;
  source: ShoppingItemSource;
}

const aliases: Readonly<Record<string, string>> = {
  apfel: "produce",
  äpfel: "produce",
  banane: "produce",
  bananen: "produce",
  brot: "bakery",
  brötchen: "bakery",
  broetchen: "bakery",
  chips: "snacks",
  hähnchenbrust: "meat",
  hahnchenbrust: "meat",
  käse: "dairy",
  kase: "dairy",
  milch: "dairy",
  nudeln: "pantry",
  wasser: "drinks",
  seife: "household",
};

const numberWords: Readonly<Record<string, number>> = {
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  funf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};

const unitAliases: Readonly<Record<string, ShoppingUnit>> = {
  stück: "piece",
  stueck: "piece",
  stücke: "piece",
  stuecke: "piece",
  stk: "piece",
  packung: "pack",
  packungen: "pack",
  pack: "pack",
  packs: "pack",
  gramm: "gram",
  gram: "gram",
  g: "gram",
  kilogramm: "kilogram",
  kilogram: "kilogram",
  kg: "kilogram",
  milliliter: "milliliter",
  ml: "milliliter",
  liter: "liter",
  litre: "liter",
  l: "liter",
};

export const normalizeShoppingTerm = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const displayName = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/[•·]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;:-]+|[,;:-]+$/g, "")
    .trim();

const parseNumber = (value: string): number | null => {
  const word = numberWords[normalizeShoppingTerm(value)];
  if (word !== undefined) return word;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseQuantity = (
  value: string,
): Pick<
  ShoppingPreviewItemResponse,
  "productName" | "quantity" | "quantityText" | "unit"
> => {
  const quantityPattern =
    /^(\d+(?:[.,]\d+)?|ein|eine|einen|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn)(?:\s+)(stück|stueck|stücke|stuecke|stk|packung|packungen|pack|packs|gramm|gram|g|kilogramm|kilogram|kg|milliliter|ml|liter|litre|l)\b\s+(.+)$/iu;
  const quantityOnlyPattern =
    /^(\d+(?:[.,]\d+)?|ein|eine|einen|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn)\s+(.+)$/iu;

  const withUnit = value.match(quantityPattern);
  if (withUnit) {
    const quantity = parseNumber(withUnit[1]!);
    const unit = unitAliases[normalizeShoppingTerm(withUnit[2]!)];
    if (quantity && unit) {
      return {
        productName: displayName(withUnit[3]!),
        quantity,
        quantityText: null,
        unit,
      };
    }
  }

  const withoutUnit = value.match(quantityOnlyPattern);
  if (withoutUnit) {
    const quantity = parseNumber(withoutUnit[1]!);
    if (quantity) {
      return {
        productName: displayName(withoutUnit[2]!),
        quantity,
        quantityText: null,
        unit: "piece",
      };
    }
  }

  return {
    productName: displayName(value),
    quantity: null,
    quantityText: null,
    unit: null,
  };
};

const splitEntries = (text: string): string[] => {
  const normalized = text
    .normalize("NFKC")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/[\r\n]+/g, ",");
  return normalized
    .split(/[,;]+|\s+(?:und|sowie)\s+/iu)
    .map(displayName)
    .filter(Boolean);
};

const categoryFor = (
  productName: string,
  options: ShoppingParserOptions,
): { category: ShoppingParserCategory; uncertain: boolean } => {
  const normalized = normalizeShoppingTerm(productName);
  const personalKey = options.personalRules.get(normalized);
  const categoryKey = personalKey ?? aliases[normalized];
  const category = options.categories.find(
    (entry) => entry.key === categoryKey,
  );
  if (category) return { category, uncertain: false };
  const other = options.categories.find((entry) => entry.key === "other");
  if (!other) throw new Error("Die Systemkategorie Sonstiges fehlt.");
  return { category: other, uncertain: true };
};

export const parseShoppingText = (
  text: string,
  options: ShoppingParserOptions,
): ShoppingPreviewItemResponse[] =>
  splitEntries(text).map((entry, index) => {
    const parsed = parseQuantity(entry);
    const selected = categoryFor(parsed.productName, options);
    return {
      clientId: `preview-${index + 1}`,
      productName: parsed.productName,
      quantity: parsed.quantity,
      quantityText: parsed.quantityText,
      unit: parsed.unit,
      categoryId: selected.category.id,
      categoryName: selected.category.name,
      uncertain: selected.uncertain,
      source: options.source,
      rememberCategory: false,
    };
  });

export const categoryResponse = (
  category: ShoppingParserCategory & Partial<ShoppingCategoryResponse>,
): ShoppingCategoryResponse => ({
  id: category.id,
  ownerId: category.ownerId ?? "",
  key: category.key,
  name: category.name,
  sortOrder: category.sortOrder ?? 0,
  origin: category.origin ?? "system",
  isActive: category.isActive ?? true,
});
