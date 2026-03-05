export const BASE_GENERATION_COST_CENTS = 30;
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
