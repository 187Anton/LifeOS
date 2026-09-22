import type {
  ConfirmShoppingItemRequest,
  ShoppingCategoryResponse,
  ShoppingItemResponse,
  ShoppingListResponse,
  ShoppingPreviewItemResponse,
  ShoppingUnit,
} from "@lifeos/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiClientError } from "../api";

type PreviewDraft = ShoppingPreviewItemResponse & {
  originalCategoryId: string;
};

const units: Array<{ value: ShoppingUnit | ""; label: string }> = [
  { value: "", label: "ohne Einheit" },
  { value: "piece", label: "Stück" },
  { value: "pack", label: "Packung" },
  { value: "gram", label: "Gramm" },
  { value: "kilogram", label: "Kilogramm" },
  { value: "milliliter", label: "Milliliter" },
  { value: "liter", label: "Liter" },
];

const message = (error: unknown): string => {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof TypeError) return "Die lokale API ist nicht erreichbar.";
  return "Die Aktion konnte nicht abgeschlossen werden.";
};

const numberValue = (value: FormDataEntryValue | null): number | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? Number(text) : null;
};

const textValue = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value.trim() : "";

const confirmedPreviewItem = (
  item: PreviewDraft,
): ConfirmShoppingItemRequest => ({
  clientId: item.clientId,
  productName: item.productName,
  quantity: item.quantity,
  quantityText: item.quantityText,
  unit: item.unit,
  categoryId: item.categoryId,
  categoryName: item.categoryName,
  uncertain: item.uncertain,
  source: item.source,
  rememberCategory: item.rememberCategory,
});

const quantityLabel = (item: ShoppingItemResponse): string => {
  const unit = units.find((value) => value.value === item.unit)?.label;
  if (item.quantity === null) return "ohne Mengenangabe";
  return `${new Intl.NumberFormat("de-DE").format(item.quantity)}${unit ? ` ${unit}` : ""}`;
};

export const ShoppingWorkspace = () => {
  const [lists, setLists] = useState<ShoppingListResponse[]>([]);
  const [categories, setCategories] = useState<ShoppingCategoryResponse[]>([]);
  const [input, setInput] = useState("");
  const [dictated, setDictated] = useState(false);
  const [preview, setPreview] = useState<PreviewDraft[]>([]);
  const [versions, setVersions] = useState<{
    parserVersion: number;
    previewVersion: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstPreviewRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextLists, nextCategories] = await Promise.all([
        api.listShoppingLists(),
        api.listShoppingCategories(),
      ]);
      setLists(nextLists);
      setCategories(nextCategories);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listShoppingLists(), api.listShoppingCategories()])
      .then(([nextLists, nextCategories]) => {
        if (active) {
          setLists(nextLists);
          setCategories(nextCategories);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeList = lists.find((list) => list.status === "active") ?? null;
  const archivedLists = lists.filter((list) => list.status === "archived");

  const groupedItems = useMemo(() => {
    if (!activeList) return [];
    return categories
      .map((category) => ({
        category,
        items: activeList.items
          .filter((item) => item.categoryId === category.id)
          .sort((left, right) => {
            if (left.status !== right.status)
              return left.status === "open" ? -1 : 1;
            return left.sortOrder - right.sortOrder;
          }),
      }))
      .filter((group) => group.items.length > 0);
  }, [activeList, categories]);

  const run = async (
    operation: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      setSuccess(successMessage);
      await load();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  };

  const parse = async () => {
    if (!input.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.previewShoppingText({
        text: input,
        source: dictated ? "dictation" : "manual",
      });
      setVersions({
        parserVersion: result.parserVersion,
        previewVersion: result.previewVersion,
      });
      setPreview(
        result.items.map((item) => ({
          ...item,
          rememberCategory: false,
          originalCategoryId: item.categoryId,
        })),
      );
      requestAnimationFrame(() => firstPreviewRef.current?.focus());
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  };

  const updatePreview = (clientId: string, changes: Partial<PreviewDraft>) =>
    setPreview((current) =>
      current.map((item) =>
        item.clientId === clientId ? { ...item, ...changes } : item,
      ),
    );

  const confirmPreview = async () => {
    if (!activeList || !versions || preview.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.confirmShoppingItems(activeList.id, {
        ...versions,
        items: preview.map(confirmedPreviewItem),
      });
      setInput("");
      setPreview([]);
      setVersions(null);
      setDictated(false);
      setSuccess("Die geprüften Positionen wurden gemeinsam gespeichert.");
      await load();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-content shopping-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">
            Lokal, prüfbar & ohne Audioübertragung
          </span>
          <h1>Einkaufsliste</h1>
          <p>
            Tippe deine Einkäufe ein oder nutze die Diktierfunktion deines
            Betriebssystems. Life OS verarbeitet ausschließlich den fertigen
            Text; Audio wird weder übertragen noch gespeichert.
          </p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          Neu laden
        </button>
      </header>

      {error ? (
        <p className="status-message error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="status-message success" role="status">
          {success}
        </p>
      ) : null}
      {loading ? <p role="status">Einkaufsliste wird lokal geladen …</p> : null}

      {!loading && !activeList ? (
        <section className="workspace-panel shopping-empty">
          <h2>Noch keine aktive Einkaufsliste</h2>
          <p>Lege bewusst eine neue, leere Liste an.</p>
          <button
            className="primary-button"
            disabled={saving}
            onClick={() =>
              void run(
                () => api.createShoppingList(),
                "Die Einkaufsliste wurde angelegt.",
              )
            }
          >
            Einkaufsliste anlegen
          </button>
        </section>
      ) : null}

      {activeList ? (
        <>
          <div className="shopping-layout">
            <section className="workspace-panel shopping-capture">
              <div className="section-heading-row">
                <div>
                  <span className="eyebrow">Entwurf</span>
                  <h2>Positionen erfassen</h2>
                </div>
              </div>
              <label>
                Einkaufstext
                <textarea
                  ref={inputRef}
                  value={input}
                  maxLength={10_000}
                  rows={5}
                  placeholder="Zum Beispiel: zwei Liter Milch, Käse und sechs Äpfel"
                  onChange={(event) => setInput(event.target.value)}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={dictated}
                  onChange={(event) => setDictated(event.target.checked)}
                />
                Der Text wurde mit der System-Diktierfunktion eingegeben
              </label>
              <p className="field-hint">
                Es gibt hier bewusst keinen eigenen Mikrofonzugriff. Text und
                Systemdiktat bieten denselben vollständigen Ablauf.
              </p>
              <button
                className="primary-button"
                disabled={saving || !input.trim()}
                onClick={() => void parse()}
              >
                Vorschau erstellen
              </button>
            </section>

            <section className="workspace-panel shopping-list-panel">
              <div className="section-heading-row">
                <div>
                  <span className="eyebrow">Aktiv</span>
                  <h2>{activeList.title}</h2>
                </div>
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Aktuelle Liste archivieren und eine neue leere Liste anlegen?",
                      )
                    )
                      void run(
                        () => api.archiveAndCreateShoppingList(activeList.id),
                        "Die bisherige Liste wurde archiviert und eine neue angelegt.",
                      );
                  }}
                >
                  Archivieren & neu beginnen
                </button>
              </div>

              {groupedItems.length === 0 ? (
                <p className="empty-state">Noch keine Position vorhanden.</p>
              ) : (
                <div className="shopping-groups">
                  {groupedItems.map(({ category, items }) => (
                    <section key={category.id} className="shopping-group">
                      <h3>{category.name}</h3>
                      <div className="shopping-items">
                        {items.map((item) => (
                          <ShoppingItemEditor
                            key={item.id}
                            item={item}
                            categories={categories}
                            saving={saving}
                            onRun={run}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </div>

          {preview.length > 0 ? (
            <section
              className="workspace-panel shopping-preview"
              aria-live="polite"
            >
              <div className="section-heading-row">
                <div>
                  <span className="eyebrow">Vor dem Speichern</span>
                  <h2>Vorschau prüfen</h2>
                </div>
                <span>{preview.length} Positionen</span>
              </div>
              <p>
                Unklare Zuordnungen landen sichtbar unter „Sonstiges“. Eine
                persönliche Zuordnung wird nur gespeichert, wenn du sie hier
                ausdrücklich auswählst.
              </p>
              <div className="shopping-preview-grid">
                {preview.map((item, index) => (
                  <article
                    className="shopping-preview-card"
                    key={item.clientId}
                  >
                    <label>
                      Produkt
                      <input
                        ref={index === 0 ? firstPreviewRef : undefined}
                        value={item.productName}
                        maxLength={500}
                        onChange={(event) =>
                          updatePreview(item.clientId, {
                            productName: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="shopping-field-row">
                      <label>
                        Menge
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity ?? ""}
                          onChange={(event) =>
                            updatePreview(item.clientId, {
                              quantity: event.target.value
                                ? Number(event.target.value)
                                : null,
                              quantityText: null,
                            })
                          }
                        />
                      </label>
                      <label>
                        Einheit
                        <select
                          value={item.unit ?? ""}
                          onChange={(event) =>
                            updatePreview(item.clientId, {
                              unit: (event.target.value ||
                                null) as ShoppingUnit | null,
                            })
                          }
                        >
                          {units.map((value) => (
                            <option key={value.value} value={value.value}>
                              {value.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Kategorie
                      <select
                        value={item.categoryId}
                        onChange={(event) => {
                          const category = categories.find(
                            (value) => value.id === event.target.value,
                          );
                          updatePreview(item.clientId, {
                            categoryId: event.target.value,
                            categoryName: category?.name ?? "Sonstiges",
                            uncertain: false,
                            rememberCategory: false,
                          });
                        }}
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {item.uncertain ? (
                      <p className="shopping-uncertain" role="status">
                        Zuordnung unsicher – bitte prüfen.
                      </p>
                    ) : null}
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={item.rememberCategory}
                        onChange={(event) =>
                          updatePreview(item.clientId, {
                            rememberCategory: event.target.checked,
                          })
                        }
                      />
                      Diese Produkt-Kategorie-Zuordnung künftig merken
                    </label>
                    <button
                      className="text-button danger"
                      onClick={() =>
                        setPreview((current) =>
                          current.filter(
                            (value) => value.clientId !== item.clientId,
                          ),
                        )
                      }
                    >
                      Aus Vorschau entfernen
                    </button>
                  </article>
                ))}
              </div>
              <button
                className="primary-button"
                disabled={
                  saving || preview.some((item) => !item.productName.trim())
                }
                onClick={() => void confirmPreview()}
              >
                Alle geprüften Positionen speichern
              </button>
            </section>
          ) : null}
        </>
      ) : null}

      {archivedLists.length > 0 ? (
        <section className="workspace-panel shopping-archive">
          <h2>Archivierte Listen</h2>
          {archivedLists.map((list) => (
            <details key={list.id}>
              <summary>
                {list.title} · {list.items.length} Positionen
              </summary>
              {list.items.length ? (
                <ul>
                  {list.items.map((item) => (
                    <li key={item.id}>
                      {item.productName} · {quantityLabel(item)} ·{" "}
                      {item.category.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Diese Liste war leer.</p>
              )}
            </details>
          ))}
        </section>
      ) : null}
    </main>
  );
};

const ShoppingItemEditor = ({
  item,
  categories,
  saving,
  onRun,
}: {
  item: ShoppingItemResponse;
  categories: ShoppingCategoryResponse[];
  saving: boolean;
  onRun: (
    operation: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<void>;
}) => (
  <article
    className={
      item.status === "completed" ? "shopping-item completed" : "shopping-item"
    }
  >
    <button
      className="shopping-status-button"
      disabled={saving}
      aria-label={
        item.status === "open"
          ? `${item.productName} als erledigt markieren`
          : `${item.productName} wieder öffnen`
      }
      onClick={() =>
        void onRun(
          () =>
            api.updateShoppingItem(item.shoppingListId, item.id, {
              status: item.status === "open" ? "completed" : "open",
            }),
          item.status === "open"
            ? "Die Position wurde erledigt."
            : "Die Position ist wieder offen.",
        )
      }
    >
      {item.status === "open" ? "○" : "✓"}
    </button>
    <form
      className="shopping-item-form"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        void onRun(
          () =>
            api.updateShoppingItem(item.shoppingListId, item.id, {
              productName: textValue(values.get("productName")),
              quantity: numberValue(values.get("quantity")),
              quantityText: null,
              unit: (textValue(values.get("unit")) ||
                null) as ShoppingUnit | null,
              categoryId: textValue(values.get("categoryId")),
            }),
          "Die Position wurde aktualisiert.",
        );
      }}
    >
      <label>
        <span className="visually-hidden">Produkt</span>
        <input
          name="productName"
          defaultValue={item.productName}
          maxLength={500}
          required
        />
      </label>
      <label>
        <span className="visually-hidden">Menge</span>
        <input
          name="quantity"
          aria-label={`Menge für ${item.productName}`}
          type="number"
          min="0.001"
          step="any"
          defaultValue={item.quantity ?? ""}
        />
      </label>
      <label>
        <span className="visually-hidden">Einheit</span>
        <select
          name="unit"
          aria-label={`Einheit für ${item.productName}`}
          defaultValue={item.unit ?? ""}
        >
          {units.map((value) => (
            <option key={value.value} value={value.value}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="visually-hidden">Kategorie</span>
        <select
          name="categoryId"
          aria-label={`Kategorie für ${item.productName}`}
          defaultValue={item.categoryId}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary-button" disabled={saving}>
        Speichern
      </button>
    </form>
    <button
      className="text-button danger"
      disabled={saving}
      onClick={() =>
        void onRun(
          () => api.deleteShoppingItem(item.shoppingListId, item.id),
          "Die Position wurde entfernt.",
        )
      }
    >
      Löschen
    </button>
  </article>
);
