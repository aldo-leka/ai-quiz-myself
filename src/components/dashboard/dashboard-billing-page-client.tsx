"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, Loader2, RefreshCcw, Wallet } from "lucide-react";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { focusRemoteControl } from "@/lib/remote-focus";
import { cn } from "@/lib/utils";

type BillingTransaction = {
  id: string;
  amountCents: number;
  currency: string;
  type: "purchase" | "generation" | "auto_reload" | "starter_bonus";
  status: "pending" | "completed" | "failed";
  description: string;
  createdAt: string;
};

type BillingResponse = {
  balanceCents: number;
  hasApiKey: boolean;
  hasPaymentMethod: boolean;
  standardGenerationCostCents: number;
  pdfGenerationCostCents: number;
  baseGenerationCostCents: number;
  autoRecharge: {
    enabled: boolean;
    thresholdCents: number;
    targetCents: number;
    monthlyCapCents: number | null;
  };
  transactions: BillingTransaction[];
};

const topUpOptionsCents = [500, 1000, 2000, 5000, 10000];
const MIN_THRESHOLD_CENTS = 500;
const MAX_THRESHOLD_CENTS = 9500;
const MIN_TARGET_CENTS = 1000;
const MAX_TARGET_CENTS = 10000;
const MIN_MONTHLY_CAP_CENTS = 1000;
const MAX_MONTHLY_CAP_CENTS = 100000;

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function centsToInputDollars(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function normalizeType(type: BillingTransaction["type"]): string {
  switch (type) {
    case "purchase":
      return "Top-up";
    case "generation":
      return "Generation";
    case "auto_reload":
      return "Auto recharge";
    case "starter_bonus":
      return "Starter bonus";
    default:
      return type;
  }
}

function amountClassName(amountCents: number): string {
  return amountCents >= 0 ? "text-emerald-300" : "text-rose-300";
}

type DashboardBillingPageClientProps = {
  topUpStatus?: "success" | "cancel" | null;
};

export function DashboardBillingPageClient({ topUpStatus = null }: DashboardBillingPageClientProps) {
  type TopUpModalFocusTarget = "amount" | "cancel" | "continue";

  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    topUpStatus === "success"
      ? "Top-up completed. Your balance will refresh shortly."
      : topUpStatus === "cancel"
        ? "Top-up was canceled."
        : null,
  );

  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpSelectOpen, setTopUpSelectOpen] = useState(false);
  const [topUpModalFocusTarget, setTopUpModalFocusTarget] =
    useState<TopUpModalFocusTarget>("amount");
  const [topUpAmount, setTopUpAmount] = useState(String(topUpOptionsCents[1]));
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [savingAutoRecharge, setSavingAutoRecharge] = useState(false);
  const [autoRechargeStatusMessage, setAutoRechargeStatusMessage] = useState<string | null>(null);

  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("5.00");
  const [targetInput, setTargetInput] = useState("10.00");
  const [monthlyCapInput, setMonthlyCapInput] = useState("");

  const currentThresholdCents = parseDollarsToCents(thresholdInput);
  const willRechargeImmediately = Boolean(
    data &&
    autoRechargeEnabled &&
    currentThresholdCents !== null &&
    data.balanceCents < currentThresholdCents,
  );

  const topUpSelectOptions = useMemo(
    () =>
      topUpOptionsCents.map((amountCents) => ({
        value: String(amountCents),
        label: `${centsToUsd(amountCents)} top-up`,
      })),
    [],
  );

  async function loadBilling() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/billing", { cache: "no-store" });
      const payload = (await response.json()) as BillingResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load billing");
      }
      setData(payload);
      setAutoRechargeEnabled(payload.autoRecharge.enabled);
      setThresholdInput(centsToInputDollars(payload.autoRecharge.thresholdCents));
      setTargetInput(centsToInputDollars(payload.autoRecharge.targetCents));
      setMonthlyCapInput(centsToInputDollars(payload.autoRecharge.monthlyCapCents));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBilling();
  }, []);

  useEffect(() => {
    setAutoRechargeStatusMessage(null);
  }, [autoRechargeEnabled, thresholdInput, targetInput, monthlyCapInput]);

  useEffect(() => {
    if (!topUpModalOpen) {
      setTopUpSelectOpen(false);
      return;
    }

    setTopUpModalFocusTarget("amount");
  }, [topUpModalOpen]);

  useEffect(() => {
    if (!topUpModalOpen || topUpSelectOpen) return;

    const targetNode = (() => {
      switch (topUpModalFocusTarget) {
        case "amount":
          return document.querySelector<HTMLElement>("[data-tv-id='billing-topup-amount-select']");
        case "cancel":
          return document.querySelector<HTMLElement>("[data-tv-id='billing-topup-cancel']");
        case "continue":
          return document.querySelector<HTMLElement>("[data-tv-id='billing-topup-continue']");
      }
    })();

    if (!targetNode) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(targetNode);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [topUpModalFocusTarget, topUpModalOpen, topUpSelectOpen]);

  const openTopUpCheckout = useCallback(async () => {
    if (topUpLoading) return;

    const amountCents = Number(topUpAmount);
    if (!Number.isInteger(amountCents) || amountCents < 500 || amountCents > 10000) {
      setStatusMessage("Select a top-up amount between $5 and $100.");
      return;
    }

    setTopUpLoading(true);
    setStatusMessage(null);
    posthog.capture("billing_top_up_checkout_started", {
      source: "dashboard_billing",
      amount_cents: amountCents,
    });
    try {
      const response = await fetch("/api/dashboard/billing/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          returnPath: "/dashboard/billing",
        }),
      });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Could not start checkout");
      }
      window.location.href = payload.checkoutUrl;
    } catch (checkoutError) {
      setStatusMessage(
        checkoutError instanceof Error ? checkoutError.message : "Could not start checkout",
      );
      setTopUpLoading(false);
    }
  }, [topUpAmount, topUpLoading]);

  useEffect(() => {
    if (!topUpModalOpen) return;

    function onTopUpModalKeyDown(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const isTextInputActive =
        activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA");

      if (isTextInputActive) {
        return;
      }

      if (topUpSelectOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Enter") {
        if (topUpModalFocusTarget === "amount") {
          const trigger = document.querySelector<HTMLElement>(
            "[data-tv-id='billing-topup-amount-select']",
          );
          trigger?.click();
          return;
        }

        if (topUpModalFocusTarget === "cancel") {
          setTopUpModalOpen(false);
          return;
        }

        void openTopUpCheckout();
        return;
      }

      setTopUpModalFocusTarget((previous) => {
        if (previous === "amount") {
          if (event.key === "ArrowDown") return "cancel";
          return previous;
        }

        if (previous === "cancel") {
          if (event.key === "ArrowUp") return "amount";
          if (event.key === "ArrowRight") return "continue";
          return previous;
        }

        if (previous === "continue") {
          if (event.key === "ArrowUp") return "amount";
          if (event.key === "ArrowLeft") return "cancel";
          return previous;
        }

        return previous;
      });
    }

    window.addEventListener("keydown", onTopUpModalKeyDown, true);
    return () => window.removeEventListener("keydown", onTopUpModalKeyDown, true);
  }, [openTopUpCheckout, topUpModalFocusTarget, topUpModalOpen, topUpSelectOpen]);

  async function openBillingPortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/dashboard/billing/portal", {
        method: "POST",
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Could not open billing portal");
      }
      window.location.href = payload.url;
    } catch (portalError) {
      setStatusMessage(portalError instanceof Error ? portalError.message : "Could not open portal");
      setPortalLoading(false);
    }
  }

  async function saveAutoRecharge() {
    if (!data) return;

    const thresholdCents = parseDollarsToCents(thresholdInput);
    const targetCents = parseDollarsToCents(targetInput);
    const monthlyCapCents = parseDollarsToCents(monthlyCapInput);

    if (thresholdCents === null || targetCents === null) {
      setAutoRechargeStatusMessage("Threshold and target are required dollar amounts.");
      return;
    }
    if (thresholdCents < MIN_THRESHOLD_CENTS || thresholdCents > MAX_THRESHOLD_CENTS) {
      setAutoRechargeStatusMessage("Threshold must be between $5.00 and $95.00.");
      return;
    }
    if (targetCents < MIN_TARGET_CENTS || targetCents > MAX_TARGET_CENTS) {
      setAutoRechargeStatusMessage("Target must be between $10.00 and $100.00.");
      return;
    }
    if (targetCents <= thresholdCents) {
      setAutoRechargeStatusMessage("Target must be greater than threshold.");
      return;
    }
    if (monthlyCapInput.trim().length > 0) {
      if (monthlyCapCents === null) {
        setAutoRechargeStatusMessage("Monthly cap must be a valid dollar amount or empty.");
        return;
      }
      if (monthlyCapCents < MIN_MONTHLY_CAP_CENTS || monthlyCapCents > MAX_MONTHLY_CAP_CENTS) {
        setAutoRechargeStatusMessage("Monthly cap must be between $10.00 and $1000.00.");
        return;
      }
      if (monthlyCapCents < targetCents) {
        setAutoRechargeStatusMessage("Monthly cap should be greater than or equal to target.");
        return;
      }
    }
    if (autoRechargeEnabled && !data.hasPaymentMethod) {
      setAutoRechargeStatusMessage("No saved payment method yet. Complete one top-up first.");
      return;
    }

    setSavingAutoRecharge(true);
    setAutoRechargeStatusMessage(null);
    try {
      const response = await fetch("/api/dashboard/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoRechargeEnabled,
          thresholdCents,
          targetCents,
          monthlyCapCents: monthlyCapInput.trim().length === 0 ? null : monthlyCapCents,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save auto recharge settings");
      }
      setAutoRechargeStatusMessage("Auto recharge settings saved.");
      await loadBilling();
    } catch (saveError) {
      setAutoRechargeStatusMessage(
        saveError instanceof Error ? saveError.message : "Could not save auto recharge settings",
      );
    } finally {
      setSavingAutoRecharge(false);
    }
  }

  return (
    <div className="space-y-8">
      {loading ? (
        <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 text-[#9394a5]">
          Loading billing data...
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-6 text-rose-200">
          {error}
        </section>
      ) : null}

      {!loading && data ? (
        <>
          <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-10">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="space-y-2">
                <p className="text-base font-semibold uppercase tracking-wide text-[#9394a5] md:text-lg">
                  Credit balance
                </p>
                <p className="text-5xl font-black text-[#e4e4e9] md:text-6xl">{centsToUsd(data.balanceCents)}</p>
                <p className="text-base text-[#9394a5] md:text-lg">
                  Quiz generation cost: {centsToUsd(data.standardGenerationCostCents)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => setTopUpModalOpen(true)}
                  data-tv-id="billing-topup-button"
                  className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:text-xl"
                >
                  <Wallet className="mr-2 size-5" />
                  Add to credit balance
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void openBillingPortal()}
                  disabled={portalLoading}
                  data-tv-id="billing-manage-payment-button"
                  className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/86 px-6 text-lg text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9] md:text-xl"
                >
                  <CreditCard className="mr-2 size-5" />
                  {portalLoading ? "Opening..." : "Manage payment method"}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-10">
            <h3 className="text-3xl font-black text-[#e4e4e9] md:text-4xl">Auto recharge</h3>
            <p className="mt-3 text-lg text-[#9394a5] md:text-2xl">
              When enabled, we check your balance periodically and recharge to your target amount.
            </p>

            <div className="mt-5 space-y-4">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-[#252940] bg-[#0f1117]/82 px-5 py-4 text-lg text-[#e4e4e9] md:text-xl">
                <Switch
                  checked={autoRechargeEnabled}
                  onCheckedChange={setAutoRechargeEnabled}
                  aria-label="Enable auto recharge"
                  data-tv-id="billing-auto-recharge-switch"
                  className="data-[state=checked]:bg-[#6c8aff] data-[state=unchecked]:bg-[#252940]"
                />
                <span>Enable auto recharge</span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-3 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
                  <p className="text-lg font-semibold text-[#e4e4e9] md:text-2xl">Trigger threshold ($5-$95)</p>
                  <p className="text-sm text-[#9394a5] md:text-base">Auto recharge starts at or below this balance.</p>
                  <div className="relative">
                    <Input
                      data-tv-id="billing-threshold-input"
                      data-tv-input="true"
                      value={thresholdInput}
                      onChange={(event) => setThresholdInput(event.target.value)}
                      type="text"
                      inputMode="decimal"
                      placeholder="5.00"
                      className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/92 pl-11 text-lg font-semibold text-[#e4e4e9] placeholder:text-[#6b6d7e] md:min-h-16 md:text-xl"
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9394a5]">
                      $
                    </span>
                  </div>
                </div>
                <div className="space-y-3 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
                  <p className="text-lg font-semibold text-[#e4e4e9] md:text-2xl">Target balance ($10-$100)</p>
                  <p className="text-sm text-[#9394a5] md:text-base">Each recharge brings your wallet back to this amount.</p>
                  <div className="relative">
                    <Input
                      data-tv-id="billing-target-input"
                      data-tv-input="true"
                      value={targetInput}
                      onChange={(event) => setTargetInput(event.target.value)}
                      type="text"
                      inputMode="decimal"
                      placeholder="10.00"
                      className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/92 pl-11 text-lg font-semibold text-[#e4e4e9] placeholder:text-[#6b6d7e] md:min-h-16 md:text-xl"
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9394a5]">
                      $
                    </span>
                  </div>
                </div>
                <div className="space-y-3 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4">
                  <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">
                    Monthly cap ($10-$1000, optional)
                  </p>
                  <p className="text-sm text-[#9394a5] md:text-base">Limit total auto recharges per calendar month.</p>
                  <div className="relative">
                    <Input
                      data-tv-id="billing-monthly-cap-input"
                      data-tv-input="true"
                      value={monthlyCapInput}
                      onChange={(event) => setMonthlyCapInput(event.target.value)}
                      type="text"
                      inputMode="decimal"
                      placeholder="No cap"
                      className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/92 pl-11 text-lg font-semibold text-[#e4e4e9] placeholder:text-[#6b6d7e] md:min-h-16 md:text-xl"
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9394a5]">
                      $
                    </span>
                  </div>
                </div>
              </div>

              {willRechargeImmediately ? (
                <div className="rounded-2xl border border-[#6c8aff]/35 bg-[#6c8aff]/12 p-4 text-[#e4e4e9]">
                  <p className="text-xl font-bold md:text-2xl">Recharge will happen immediately</p>
                  <p className="mt-2 text-base text-[#e4e4e9]/90 md:text-lg">
                    Your credit balance is below the recharge threshold you&apos;ve set, so a
                    recharge will happen immediately after you save these settings.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => void saveAutoRecharge()}
                  disabled={savingAutoRecharge}
                  className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:text-xl"
                >
                  <RefreshCcw className={cn("mr-2 size-5", savingAutoRecharge ? "animate-spin" : "")} />
                  {savingAutoRecharge ? "Saving..." : "Save settings"}
                </Button>
              </div>

              {autoRechargeStatusMessage ? (
                <p className="text-base text-[#9394a5] md:text-lg">
                  {autoRechargeStatusMessage}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-10">
            <h3 className="text-3xl font-black text-[#e4e4e9] md:text-4xl">Transaction history</h3>
            <p className="mt-3 text-lg text-[#9394a5] md:text-2xl">
              Recent purchases, recharges, and generation charges.
            </p>

            <div className="mt-5 space-y-3">
              {data.transactions.length === 0 ? (
                <p className="rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4 text-[#9394a5]">
                  No transactions yet.
                </p>
              ) : (
                data.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#252940] bg-[#0f1117]/82 p-5"
                  >
                    <div>
                      <p className="text-xl font-semibold text-[#e4e4e9] md:text-2xl">
                        {normalizeType(transaction.type)}
                      </p>
                      <p className="mt-1 text-base text-[#9394a5] md:text-lg">
                        {transaction.description}
                      </p>
                      <p className="mt-1 text-sm text-[#6b6d7e] md:text-base">
                        {formatDate(transaction.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-2xl font-bold md:text-3xl", amountClassName(transaction.amountCents))}>
                        {transaction.amountCents >= 0 ? "+" : "-"}
                        {centsToUsd(Math.abs(transaction.amountCents))}
                      </p>
                      <p
                        className={cn(
                          "text-sm uppercase tracking-wide",
                          transaction.status === "completed"
                            ? "text-emerald-300"
                            : transaction.status === "pending"
                              ? "text-amber-300"
                              : "text-rose-300",
                        )}
                      >
                        {transaction.status}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {statusMessage ? (
        <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-5 text-[#e4e4e9]">
          <p className="inline-flex items-center gap-2 text-base md:text-lg">
            <AlertTriangle className="size-5 text-[#818cf8]" />
            {statusMessage}
          </p>
        </section>
      ) : null}

      <Dialog open={topUpModalOpen} onOpenChange={setTopUpModalOpen}>
        <DialogContent
          data-tv-id="billing-topup-dialog"
          className="max-w-md rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-6 text-[#e4e4e9]"
        >
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-black text-[#e4e4e9]">Add to credit balance</DialogTitle>
            <DialogDescription className="text-[#9394a5]">
              Choose a top-up amount. You will complete payment in Stripe checkout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-[#9394a5]">Amount</p>
            <Select
              value={topUpAmount}
              onValueChange={setTopUpAmount}
              open={topUpSelectOpen}
              onOpenChange={(open) => {
                setTopUpSelectOpen(open);
                if (!open) {
                  setTopUpModalFocusTarget("amount");
                }
              }}
            >
              <SelectTrigger
                data-tv-id="billing-topup-amount-select"
                className={cn(
                  "min-h-14 w-full rounded-full border-[#252940] bg-[#0f1117]/88 px-6 py-2.5 text-lg font-semibold text-[#e4e4e9] shadow-[0_0_0_1px_rgba(108,138,255,0.14)] transition md:min-h-16 md:px-7 md:text-2xl data-[size=default]:h-auto",
                  "data-[state=open]:border-[#818cf8]/55 data-[state=open]:shadow-[0_0_0_1px_rgba(129,140,248,0.24),0_16px_40px_rgba(15,17,23,0.46)]",
                  "focus-visible:ring-[#818cf8]/55",
                )}
              >
                <SelectValue placeholder="Select amount" />
              </SelectTrigger>
              <SelectContent
                className="rounded-2xl border-[#6c8aff]/40 bg-[#1a1d2e]/96 text-[#e4e4e9] shadow-2xl backdrop-blur-md"
                position="popper"
                align="start"
              >
                {topUpSelectOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="rounded-xl py-3 pr-8 pl-4 text-base text-[#e4e4e9] focus:bg-[#6c8aff]/18 focus:text-[#e4e4e9] data-[state=checked]:bg-[#6c8aff]/14 md:text-lg"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-[#9394a5]">
              Current balance: {centsToUsd(data?.balanceCents ?? 0)}
            </p>
          </div>

          <DialogFooter className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              data-tv-id="billing-topup-cancel"
              className="min-h-11 border-[#252940] bg-[#1a1d2e]/86 text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9]"
              disabled={topUpLoading}
              onClick={() => setTopUpModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-tv-id="billing-topup-continue"
              className="min-h-11 border-[#6c8aff]/45 bg-[#6c8aff]/18 text-[#e4e4e9] hover:bg-[#818cf8]/24"
              disabled={topUpLoading}
              onClick={() => void openTopUpCheckout()}
            >
              {topUpLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Opening...
                </>
              ) : (
                "Continue to checkout"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
