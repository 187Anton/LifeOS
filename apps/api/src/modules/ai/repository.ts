import type { DatabaseClient, Prisma } from "@lifeos/database";
import type {
  AiInteractionStatus,
  ConfirmAiSuggestionResponse,
} from "@lifeos/contracts";

export interface StoredAiSourceReference {
  sourceType: string;
  sourceId: string;
  sourceUpdatedAt: string;
  excerptHash: string;
  releaseStatus: "search_enabled";
  usedForResponse: boolean;
  warning: "untrusted_instructions" | "possible_conflict" | null;
}

export interface StoredAiSuggestionMetadata {
  id: string;
  actionType: string;
  requiresConfirmation: true;
  status: "pending" | "confirmed";
}

export interface PersistAiInteractionInput {
  requestHash: string;
  status: AiInteractionStatus;
  providerId: string | null;
  processingMode: "local" | "external" | null;
  sourceReferences: StoredAiSourceReference[];
  responseMetadata: {
    messageCode: AiInteractionStatus;
    answerHash: string | null;
    sourceCount: number;
    usableSourceCount: number;
    suggestions: StoredAiSuggestionMetadata[];
  };
}

export interface AiInteractionRepository {
  persist(
    userId: string,
    input: PersistAiInteractionInput,
  ): Promise<{ id: string }>;
  confirmSuggestion(
    userId: string,
    interactionId: string,
    suggestionId: string,
  ): Promise<ConfirmAiSuggestionResponse>;
}

export class AiSuggestionNotFoundError extends Error {}

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const suggestionsFrom = (metadata: unknown): StoredAiSuggestionMetadata[] => {
  const suggestions = objectValue(metadata)?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions.filter(
    (suggestion): suggestion is StoredAiSuggestionMetadata => {
      const value = objectValue(suggestion);
      return Boolean(
        value &&
        typeof value.id === "string" &&
        typeof value.actionType === "string" &&
        value.requiresConfirmation === true &&
        (value.status === "pending" || value.status === "confirmed"),
      );
    },
  );
};

export class PrismaAiInteractionRepository implements AiInteractionRepository {
  constructor(private readonly database: DatabaseClient) {}

  persist(userId: string, input: PersistAiInteractionInput) {
    return this.database.$transaction(async (transaction) => {
      const interaction = await transaction.aiInteraction.create({
        data: {
          userId,
          requestHash: input.requestHash,
          status: input.status,
          providerId: input.providerId,
          processingMode: input.processingMode ?? "local",
          externalTransferOccurred: false,
          sourceReferences:
            input.sourceReferences as unknown as Prisma.InputJsonValue,
          responseMetadata:
            input.responseMetadata as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "ai.sources.prepared",
          entityType: "AiInteraction",
          entityId: interaction.id,
          metadata: {
            status: input.status,
            sourceCount: input.responseMetadata.sourceCount,
            usableSourceCount: input.responseMetadata.usableSourceCount,
            suggestionCount: input.responseMetadata.suggestions.length,
            externalTransferOccurred: false,
          },
        },
      });
      return interaction;
    });
  }

  confirmSuggestion(
    userId: string,
    interactionId: string,
    suggestionId: string,
  ): Promise<ConfirmAiSuggestionResponse> {
    return this.database.$transaction(async (transaction) => {
      const interaction = await transaction.aiInteraction.findFirst({
        where: { id: interactionId, userId },
      });
      const metadata = objectValue(interaction?.responseMetadata);
      const suggestions = suggestionsFrom(interaction?.responseMetadata);
      const suggestion = suggestions.find(
        (value) => value.id === suggestionId && value.status === "pending",
      );
      if (!interaction || !metadata || !suggestion)
        throw new AiSuggestionNotFoundError();
      const changed = suggestions.map((value) =>
        value.id === suggestionId
          ? ({ ...value, status: "confirmed" } as const)
          : value,
      );
      await transaction.aiInteraction.update({
        where: { id: interaction.id },
        data: {
          responseMetadata: {
            ...metadata,
            suggestions: changed,
          } as Prisma.InputJsonValue,
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId,
          action: "ai.suggestion.confirmed",
          entityType: "AiInteraction",
          entityId: interaction.id,
          metadata: {
            suggestionId,
            actionType: suggestion.actionType,
            domainChangesApplied: false,
          },
        },
      });
      return {
        interactionId: interaction.id,
        suggestionId,
        status: "confirmed",
        domainChangesApplied: false,
      };
    });
  }
}
