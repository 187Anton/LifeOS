import { createHash, randomUUID } from "node:crypto";

import type {
  AiInteractionStatus,
  AiQueryResponse,
  AiSourceReferenceResponse,
  AiStatusResponse,
  CreateAiQueryRequest,
  SearchResultResponse,
} from "@lifeos/contracts";

import type { LocalSearchService } from "../search/service.js";
import type { AiInteractionRepository } from "./repository.js";

export interface AiProviderInput {
  query: string;
  sources: Array<{
    id: string;
    title: string;
    contentType: string;
    excerpt: string;
  }>;
}

export interface AiProviderOutput {
  answer: string;
  suggestions?: Array<{ actionType: string; summary: string }>;
}

export interface AiProviderAdapter {
  providerId: string | null;
  processingMode: "local" | "external";
  available: boolean;
  generate(input: AiProviderInput): Promise<AiProviderOutput>;
}

export class DisabledAiProviderAdapter implements AiProviderAdapter {
  providerId = null;
  processingMode = "local" as const;
  available = false;

  generate(): Promise<AiProviderOutput> {
    return Promise.reject(new Error("Der KI-Adapter ist deaktiviert."));
  }
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ")
    .trim();

const injectionPatterns = [
  /ignore (all|any|the)? ?(previous|prior) instructions?/i,
  /ignoriere (alle )?(vorherigen|bisherigen) anweisungen/i,
  /system prompt/i,
  /developer message/i,
  /folge (nur )?diesen anweisungen/i,
  /begin (system|developer) message/i,
];

const hasUntrustedInstructions = (value: string) =>
  injectionPatterns.some((pattern) => pattern.test(value));

const sourceReferences = (results: SearchResultResponse[]) => {
  const conflicts = new Set<string>();
  const byTitle = new Map<string, Set<string>>();
  for (const result of results) {
    const title = normalize(result.title);
    const excerpts = byTitle.get(title) ?? new Set<string>();
    excerpts.add(normalize(result.snippet));
    byTitle.set(title, excerpts);
  }
  for (const [title, excerpts] of byTitle) {
    if (excerpts.size > 1) conflicts.add(title);
  }
  return results.map((result) => {
    const warning = hasUntrustedInstructions(result.snippet)
      ? ("untrusted_instructions" as const)
      : conflicts.has(normalize(result.title))
        ? ("possible_conflict" as const)
        : null;
    return {
      result,
      reference: {
        id: result.id,
        title: result.title,
        contentType: result.contentType,
        source: result.source,
        updatedAt: result.updatedAt,
        excerpt: result.snippet,
        detailPath: result.detailPath,
        releaseStatus: "search_enabled" as const,
        usedForResponse: false as boolean,
        warning,
      } satisfies AiSourceReferenceResponse,
    };
  });
};

const messages: Record<AiInteractionStatus, string> = {
  disabled:
    "Die quellengestützte KI ist standardmäßig deaktiviert. Es wurden keine Daten übertragen.",
  no_sources:
    "Für diese Anfrage wurden keine ausdrücklich freigegebenen lokalen Quellen gefunden.",
  insufficient_sources:
    "Die freigegebenen lokalen Quellen reichen für eine belastbare Antwort nicht aus.",
  conflicting_sources:
    "Die lokalen Quellen enthalten möglicherweise widersprüchliche Angaben. Bitte prüfe die markierten Stellen.",
  unsafe_sources:
    "Die gefundenen Quellen enthalten nicht vertrauenswürdige Anweisungen und wurden nicht als KI-Kontext verwendet.",
  external_release_required:
    "Der Anbieter würde Daten extern verarbeiten. Dafür liegt keine getrennte Quellenfreigabe vor.",
  provider_missing: "Es ist kein freigegebener KI-Anbieter eingerichtet.",
  ready:
    "Die Antwort wurde ausschließlich aus den angezeigten Quellen erzeugt.",
};

export class SourceGroundedAiService {
  constructor(
    private readonly search: LocalSearchService,
    private readonly repository: AiInteractionRepository,
    private readonly options: {
      enabled: boolean;
      adapter: AiProviderAdapter | null;
    },
  ) {}

  status(): AiStatusResponse {
    return {
      enabled: this.options.enabled,
      providerId: this.options.adapter?.providerId ?? null,
      processingMode: this.options.adapter?.processingMode ?? null,
      externalTransferEnabled: false,
    };
  }

  async query(
    userId: string,
    input: CreateAiQueryRequest,
  ): Promise<AiQueryResponse> {
    const fingerprintNonce = randomUUID();
    const protectedHash = (value: string) =>
      hash(`${fingerprintNonce}\u0000${value}`);
    const requestHash = protectedHash(input.query);
    const search = await this.search.search(userId, input.query);
    const prepared = sourceReferences(search.results.slice(0, 8));
    const minimumSources = input.minimumSources ?? 1;
    const clean = prepared.filter((item) => item.reference.warning === null);
    const hasConflicts = prepared.some(
      (item) => item.reference.warning === "possible_conflict",
    );
    const adapter = this.options.adapter;
    let status: AiInteractionStatus;
    let output: AiProviderOutput | null = null;

    if (!this.options.enabled) status = "disabled";
    else if (!prepared.length) status = "no_sources";
    else if (hasConflicts) status = "conflicting_sources";
    else if (!clean.length) status = "unsafe_sources";
    else if (clean.length < minimumSources) status = "insufficient_sources";
    else if (!adapter?.available || !adapter.providerId)
      status = "provider_missing";
    else if (adapter.processingMode === "external")
      status = "external_release_required";
    else {
      output = await adapter.generate({
        query: input.query,
        sources: clean.map(({ result }) => ({
          id: result.id,
          title: result.title,
          contentType: result.contentType,
          excerpt: result.snippet,
        })),
      });
      status = "ready";
      for (const item of clean) item.reference.usedForResponse = true;
    }

    const suggestions = (output?.suggestions ?? []).map((suggestion) => ({
      id: randomUUID(),
      actionType: suggestion.actionType,
      summary: suggestion.summary,
      requiresConfirmation: true as const,
    }));
    const interaction = await this.repository.persist(userId, {
      requestHash,
      status,
      providerId: adapter?.providerId ?? null,
      processingMode: adapter?.processingMode ?? null,
      sourceReferences: prepared.map(({ reference }) => ({
        sourceType: reference.contentType,
        sourceId: reference.id,
        sourceUpdatedAt: reference.updatedAt,
        excerptHash: protectedHash(reference.excerpt),
        releaseStatus: reference.releaseStatus,
        usedForResponse: reference.usedForResponse,
        warning: reference.warning,
      })),
      responseMetadata: {
        messageCode: status,
        answerHash: output ? protectedHash(output.answer) : null,
        sourceCount: prepared.length,
        usableSourceCount: clean.length,
        suggestions: suggestions.map((suggestion) => ({
          id: suggestion.id,
          actionType: suggestion.actionType,
          requiresConfirmation: true,
          status: "pending",
        })),
      },
    });

    return {
      interactionId: interaction.id,
      status,
      message: messages[status],
      answer: output?.answer ?? null,
      sources: prepared.map(({ reference }) => reference),
      suggestions,
      metadata: {
        providerId: adapter?.providerId ?? null,
        processingMode: adapter?.processingMode ?? null,
        externalTransferOccurred: false,
        sourceCount: prepared.length,
        usableSourceCount: clean.length,
        requestHash,
      },
    };
  }

  confirmSuggestion(
    userId: string,
    interactionId: string,
    suggestionId: string,
  ) {
    return this.repository.confirmSuggestion(
      userId,
      interactionId,
      suggestionId,
    );
  }
}
