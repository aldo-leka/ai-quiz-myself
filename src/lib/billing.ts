export const BASE_GENERATION_COST_CENTS = 30;
export const QUIZ_GENERATION_COST_SETTING_KEY = "credit_cost_quiz_generation_cents";
export const LEGACY_AI_GENERATION_COST_SETTING_KEY = "credit_cost_ai_generation";
export const LEGACY_PDF_GENERATION_COST_SETTING_KEY = "credit_cost_pdf_generation";
export const TOP_UP_MIN_CENTS = 500;
export const TOP_UP_MAX_CENTS = 10_000;
export const STARTER_CREDITS_CENTS = 300;
export const AUTO_RECHARGE_THRESHOLD_MIN_CENTS = 500;
export const AUTO_RECHARGE_THRESHOLD_MAX_CENTS = 9_500;
export const AUTO_RECHARGE_TARGET_MIN_CENTS = 1_000;
export const AUTO_RECHARGE_TARGET_MAX_CENTS = 10_000;
export const AUTO_RECHARGE_MONTHLY_CAP_MIN_CENTS = 1_000;
export const AUTO_RECHARGE_MONTHLY_CAP_MAX_CENTS = 100_000;

export type GenerationBillingMode = "byok" | "platform_credits";

export function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function dollarsFromCents(amountCents: number): number {
  return amountCents / 100;
}

export function centsFromDollars(amountDollars: number): number {
  return Math.round(amountDollars * 100);
}

export function formatUsdCents(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

export function computeGenerationCostCents(multiplierUnits: number): number {
  const normalized = Number.isFinite(multiplierUnits) && multiplierUnits > 0
    ? Math.floor(multiplierUnits)
    : 1;
  return normalized * BASE_GENERATION_COST_CENTS;
}

export function parseGenerationCostCents(
  value: string | null | undefined,
  fallback = BASE_GENERATION_COST_CENTS,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function resolveGenerationCostCentsFromSettings(
  settings: Array<{ key: string; value: string | null | undefined }>,
): number {
  const universalSetting = settings.find(
    (setting) => setting.key === QUIZ_GENERATION_COST_SETTING_KEY,
  )?.value;
  if (universalSetting) {
    return parseGenerationCostCents(universalSetting, BASE_GENERATION_COST_CENTS);
  }

  const legacyAiSetting = settings.find(
    (setting) => setting.key === LEGACY_AI_GENERATION_COST_SETTING_KEY,
  )?.value;
  if (legacyAiSetting) {
    return computeGenerationCostCents(parsePositiveInt(legacyAiSetting, 1));
  }

  const legacyPdfSetting = settings.find(
    (setting) => setting.key === LEGACY_PDF_GENERATION_COST_SETTING_KEY,
  )?.value;
  if (legacyPdfSetting) {
    return computeGenerationCostCents(parsePositiveInt(legacyPdfSetting, 1));
  }

  return BASE_GENERATION_COST_CENTS;
}
