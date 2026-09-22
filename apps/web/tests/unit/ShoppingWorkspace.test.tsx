import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listShoppingLists: vi.fn(),
  listShoppingCategories: vi.fn(),
  createShoppingList: vi.fn(),
  archiveAndCreateShoppingList: vi.fn(),
  previewShoppingText: vi.fn(),
  confirmShoppingItems: vi.fn(),
  updateShoppingItem: vi.fn(),
  deleteShoppingItem: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: mocks,
}));

import { ShoppingWorkspace } from "../../src/components/ShoppingWorkspace";

const categories = [
  {
    id: "category-produce",
    ownerId: "owner-1",
    key: "produce",
    name: "Obst & Gemüse",
    sortOrder: 10,
    origin: "system",
    isActive: true,
  },
  {
    id: "category-other",
    ownerId: "owner-1",
    key: "other",
    name: "Sonstiges",
    sortOrder: 90,
    origin: "system",
    isActive: true,
  },
] as const;

const activeList = {
  id: "list-1",
  ownerId: "owner-1",
  title: "Einkaufsliste",
  status: "active",
  archivedAt: null,
  deletedAt: null,
  createdAt: "2032-01-01T00:00:00.000Z",
  updatedAt: "2032-01-01T00:00:00.000Z",
  items: [],
} as const;

describe("Einkaufslistenoberfläche", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listShoppingCategories.mockResolvedValue(categories);
    mocks.createShoppingList.mockResolvedValue(activeList);
    mocks.archiveAndCreateShoppingList.mockResolvedValue(activeList);
    mocks.confirmShoppingItems.mockResolvedValue({ items: [] });
  });

  it("legt eine aktive Liste erst nach ausdrücklicher Aktion an", async () => {
    const user = userEvent.setup();
    mocks.listShoppingLists.mockResolvedValue([]);

    render(<ShoppingWorkspace />);

    const create = await screen.findByRole("button", {
      name: "Einkaufsliste anlegen",
    });
    expect(mocks.createShoppingList).not.toHaveBeenCalled();
    await user.click(create);
    expect(mocks.createShoppingList).toHaveBeenCalledWith();
  });

  it("prüft, korrigiert und bestätigt Textpositionen ohne Mikrofonzugriff", async () => {
    const user = userEvent.setup();
    mocks.listShoppingLists.mockResolvedValue([activeList]);
    mocks.previewShoppingText.mockResolvedValue({
      parserVersion: 1,
      previewVersion: 1,
      items: [
        {
          clientId: "preview-1",
          productName: "Äpfel",
          quantity: 6,
          quantityText: "sechs",
          unit: "piece",
          categoryId: "category-produce",
          categoryName: "Obst & Gemüse",
          uncertain: false,
          source: "dictation",
          rememberCategory: false,
        },
        {
          clientId: "preview-2",
          productName: "Unbekanntes Produkt",
          quantity: null,
          quantityText: null,
          unit: null,
          categoryId: "category-other",
          categoryName: "Sonstiges",
          uncertain: true,
          source: "dictation",
          rememberCategory: false,
        },
      ],
    });

    render(<ShoppingWorkspace />);
    expect(
      await screen.findByRole("heading", { name: "Einkaufsliste" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /mikrofon/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Audio wird weder übertragen noch gespeichert/),
    ).toBeVisible();

    await user.type(
      screen.getByLabelText("Einkaufstext"),
      "sechs Äpfel und etwas Neues",
    );
    await user.click(
      screen.getByLabelText(
        "Der Text wurde mit der System-Diktierfunktion eingegeben",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Vorschau erstellen" }),
    );

    const appleCard = screen.getByDisplayValue("Äpfel").closest("article");
    expect(appleCard).not.toBeNull();
    const apple = within(appleCard!);
    await user.selectOptions(
      apple.getByLabelText("Kategorie"),
      "category-other",
    );
    await user.click(
      apple.getByLabelText("Diese Produkt-Kategorie-Zuordnung künftig merken"),
    );

    const uncertainCard = (
      await screen.findByText(/Zuordnung unsicher/)
    ).closest("article");
    expect(uncertainCard).not.toBeNull();
    const card = within(uncertainCard!);
    await user.click(
      card.getByRole("button", { name: "Aus Vorschau entfernen" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Alle geprüften Positionen speichern",
      }),
    );

    expect(mocks.previewShoppingText).toHaveBeenCalledWith({
      text: "sechs Äpfel und etwas Neues",
      source: "dictation",
    });
    expect(mocks.confirmShoppingItems).toHaveBeenCalledWith("list-1", {
      parserVersion: 1,
      previewVersion: 1,
      items: [
        expect.objectContaining({
          clientId: "preview-1",
          categoryId: "category-other",
          rememberCategory: true,
        }),
      ],
    });
  });
});
