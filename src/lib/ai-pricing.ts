import type { LanguageModelUsage } from "ai";

export type CostProviderName = "openai" | "anthropic" | "google";
export type GenerationCostLineItemKind =
  | "quiz_generation"
  | "pdf_ocr"
  | "source_subtopic_planning";

export type AiTokenUsageSnapshot = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
};

export type ModelPricingSnapshot = {
  source: string;
  capturedAt: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number | null;
};

export type SharedAllocationSnapshot = {
  totalParts: number;
  partIndex: number;
  sharedTotalUsdMicros: number | null;
  strategy: "even_split";
};

export type GenerationCostLineItem = {
  kind: GenerationCostLineItemKind;
  provider: CostProviderName;
  model: string;
  usage: AiTokenUsageSnapshot | null;
  pricingSnapshot: ModelPricingSnapshot | null;
  costUsdMicros: number | null;
  pricingUnavailableReason?: string | null;
  sharedAllocation?: SharedAllocationSnapshot;
};

export type GenerationCostBreakdown = {
  currency: "USD";
  totalUsdMicros: number | null;
  hasUnpricedLineItems: boolean;
  lineItems: GenerationCostLineItem[];
};

type ModelPricingEntry = {
  provider: CostProviderName;
  aliases: string[];
  source: string;
  capturedAt: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number | null;
};

type OpenAiResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

const OPENAI_PRICING_SNAPSHOT = {
  source: "https://openai.com/api/pricing",
  capturedAt: "2026-03-12",
} as const;

const ANTHROPIC_PRICING_SNAPSHOT = {
  source: "https://www.anthropic.com/pricing#api",
  capturedAt: "2026-03-12",
} as const;

const GOOGLE_GEMINI_PRICING_SNAPSHOT = {
  source: "https://ai.google.dev/gemini-api/docs/pricing",
  capturedAt: "2026-03-12",
} as const;

const GOOGLE_GEMINI_FLASH_LITE_PRICING_SNAPSHOT = {
  source: "https://developers.googleblog.com/en/gemini-31-flash-updates-and-gemini-31-flash-lite/",
  capturedAt: "2026-03-12",
} as const;

const PRICED_MODELS: ModelPricingEntry[] = [
  {
    provider: "openai",
    aliases: ["gpt-5.4"],
    ...OPENAI_PRICING_SNAPSHOT,
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
    cachedInputUsdPerMillion: 0.25,
  },
  {
    provider: "openai",
    aliases: ["gpt-5-mini"],
    ...OPENAI_PRICING_SNAPSHOT,
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.025,
  },
  {
    provider: "anthropic",
    aliases: ["claude-sonnet-4-6"],
    ...ANTHROPIC_PRICING_SNAPSHOT,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cachedInputUsdPerMillion: 0.3,
  },
  {
    provider: "anthropic",
    aliases: ["claude-haiku-4-5"],
    ...ANTHROPIC_PRICING_SNAPSHOT,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.1,
  },
  {
    provider: "google",
    aliases: ["gemini-3-flash-preview"],
    ...GOOGLE_GEMINI_PRICING_SNAPSHOT,
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
    cachedInputUsdPerMillion: null,
  },
  {
    provider: "google",
    aliases: ["gemini-3.1-flash-lite-preview"],
    ...GOOGLE_GEMINI_FLASH_LITE_PRICING_SNAPSHOT,
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.4,
    cachedInputUsdPerMillion: 0.025,
  },
];

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

function toOptionalNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function costFromTokens(tokens: number, usdPerMillion: number): number {
  return Math.round((tokens / 1_000_000) * usdPerMillion * 1_000_000);
}

function recalculateBreakdown(lineItems: GenerationCostLineItem[]): GenerationCostBreakdown {
  const hasUnpricedLineItems = lineItems.some((lineItem) => lineItem.costUsdMicros === null);
  const totalUsdMicros = hasUnpricedLineItems
    ? null
    : lineItems.reduce((sum, lineItem) => sum + (lineItem.costUsdMicros ?? 0), 0);

  return {
    currency: "USD",
    totalUsdMicros,
    hasUnpricedLineItems,
    lineItems,
  };
}

function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];

  const base = Math.floor(total / parts);
  const remainder = total % parts;

  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function createEmptyGenerationCostBreakdown(): GenerationCostBreakdown {
  return {
    currency: "USD",
    totalUsdMicros: 0,
    hasUnpricedLineItems: false,
    lineItems: [],
  };
}

export function normalizeGenerationCostBreakdown(
  breakdown: GenerationCostBreakdown | null | undefined,
): GenerationCostBreakdown {
  if (!breakdown) {
    return createEmptyGenerationCostBreakdown();
  }

  return recalculateBreakdown(breakdown.lineItems ?? []);
}

export function mergeGenerationCostBreakdowns(
  ...breakdowns: Array<GenerationCostBreakdown | null | undefined>
): GenerationCostBreakdown {
  const mergedLineItems = breakdowns.flatMap(
    (breakdown) => normalizeGenerationCostBreakdown(breakdown).lineItems,
  );

  return recalculateBreakdown(mergedLineItems);
}

export function usageSnapshotFromLanguageModelUsage(
  usage: LanguageModelUsage | undefined,
): AiTokenUsageSnapshot | null {
  if (!usage) {
    return null;
  }

  const snapshot: AiTokenUsageSnapshot = {
    inputTokens: toOptionalNumber(usage.inputTokens),
    outputTokens: toOptionalNumber(usage.outputTokens),
    totalTokens: toOptionalNumber(usage.totalTokens),
    cachedInputTokens: toOptionalNumber(usage.cachedInputTokens),
    reasoningTokens: toOptionalNumber(usage.reasoningTokens),
  };

  return Object.values(snapshot).some((value) => value !== null) ? snapshot : null;
}

export function usageSnapshotFromOpenAiResponsesUsage(
  usage: OpenAiResponsesUsage | undefined,
): AiTokenUsageSnapshot | null {
  if (!usage) {
    return null;
  }

  const snapshot: AiTokenUsageSnapshot = {
    inputTokens: toOptionalNumber(usage.input_tokens),
    outputTokens: toOptionalNumber(usage.output_tokens),
    totalTokens: toOptionalNumber(usage.total_tokens),
    cachedInputTokens: toOptionalNumber(usage.input_tokens_details?.cached_tokens),
    reasoningTokens: toOptionalNumber(usage.output_tokens_details?.reasoning_tokens),
  };

  return Object.values(snapshot).some((value) => value !== null) ? snapshot : null;
}

export function addUsageSnapshots(
  left: AiTokenUsageSnapshot | null | undefined,
  right: AiTokenUsageSnapshot | null | undefined,
): AiTokenUsageSnapshot | null {
  if (!left) return right ?? null;
  if (!right) return left;

  const sumField = (
    a: number | null,
    b: number | null,
  ): number | null => {
    if (a === null && b === null) return null;
    return (a ?? 0) + (b ?? 0);
  };

  return {
    inputTokens: sumField(left.inputTokens, right.inputTokens),
    outputTokens: sumField(left.outputTokens, right.outputTokens),
    totalTokens: sumField(left.totalTokens, right.totalTokens),
    cachedInputTokens: sumField(left.cachedInputTokens, right.cachedInputTokens),
    reasoningTokens: sumField(left.reasoningTokens, right.reasoningTokens),
  };
}

export function createGenerationCostLineItem(params: {
  kind: GenerationCostLineItemKind;
  provider: CostProviderName;
  model: string;
  usage: AiTokenUsageSnapshot | null;
}): GenerationCostLineItem {
  const normalizedModel = normalizeModelName(params.model);
  const pricing = PRICED_MODELS.find(
    (entry) =>
      entry.provider === params.provider && entry.aliases.some((alias) => normalizeModelName(alias) === normalizedModel),
  );

  if (!pricing) {
    return {
      kind: params.kind,
      provider: params.provider,
      model: params.model,
      usage: params.usage,
      pricingSnapshot: null,
      costUsdMicros: null,
      pricingUnavailableReason: `No pricing snapshot is configured for ${params.provider}:${params.model}`,
    };
  }

  const inputTokens = params.usage?.inputTokens ?? 0;
  const cachedInputTokens = Math.min(params.usage?.cachedInputTokens ?? 0, inputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = params.usage?.outputTokens ?? 0;

  const inputCostUsdMicros = costFromTokens(uncachedInputTokens, pricing.inputUsdPerMillion);
  const cachedInputCostUsdMicros =
    cachedInputTokens > 0
      ? costFromTokens(cachedInputTokens, pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion)
      : 0;
  const outputCostUsdMicros = costFromTokens(outputTokens, pricing.outputUsdPerMillion);

  return {
    kind: params.kind,
    provider: params.provider,
    model: params.model,
    usage: params.usage,
    pricingSnapshot: {
      source: pricing.source,
      capturedAt: pricing.capturedAt,
      inputUsdPerMillion: pricing.inputUsdPerMillion,
      outputUsdPerMillion: pricing.outputUsdPerMillion,
      cachedInputUsdPerMillion: pricing.cachedInputUsdPerMillion ?? null,
    },
    costUsdMicros: inputCostUsdMicros + cachedInputCostUsdMicros + outputCostUsdMicros,
  };
}

export function createGenerationCostBreakdown(
  lineItems: GenerationCostLineItem[],
): GenerationCostBreakdown {
  return recalculateBreakdown(lineItems);
}

export function allocateSharedCostBreakdown(
  breakdown: GenerationCostBreakdown,
  parts: number,
): GenerationCostBreakdown[] {
  const normalized = normalizeGenerationCostBreakdown(breakdown);

  if (parts <= 1) {
    return [normalized];
  }

  const perLineItemAllocations = normalized.lineItems.map((lineItem) =>
    lineItem.costUsdMicros === null ? null : splitEvenly(lineItem.costUsdMicros, parts),
  );

  return Array.from({ length: parts }, (_, index) =>
    recalculateBreakdown(
      normalized.lineItems.map((lineItem, lineItemIndex) => ({
        ...lineItem,
        costUsdMicros: perLineItemAllocations[lineItemIndex]?.[index] ?? null,
        sharedAllocation: {
          totalParts: parts,
          partIndex: index + 1,
          sharedTotalUsdMicros: lineItem.costUsdMicros,
          strategy: "even_split",
        },
      })),
    ),
  );
}
