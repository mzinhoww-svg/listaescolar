"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/stationeries/actor";

import { PACKAGES_MAX } from "./limits";
import { billingErrorCode } from "./messages";
import { parseBrlToCents } from "./money";
import type { PlanDraft } from "./ports";
import { getBillingService } from "./wiring";

/** Linhas fixas do formulário (Admin10): sem JavaScript de "adicionar/remover", linhas em branco são ignoradas. */
const TIER_ROWS = 6;

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function intOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function buildPlanDraft(formData: FormData): PlanDraft | null {
  const freeLeads = intOrNull(text(formData, "freeLeads"));
  const freeLeadsValidityDays = text(formData, "freeLeadsValidityDays") === "" ? null : intOrNull(text(formData, "freeLeadsValidityDays"));
  const startMonth = intOrNull(text(formData, "seasonStartMonth"));
  const endMonth = intOrNull(text(formData, "seasonEndMonth"));
  if (freeLeads === null || startMonth === null || endMonth === null) return null;

  const tiers: PlanDraft["tiers"] = [];
  for (let i = 0; i < TIER_ROWS; i++) {
    const min = text(formData, `tiers.${i}.minItems`);
    const max = text(formData, `tiers.${i}.maxItems`);
    const price = text(formData, `tiers.${i}.priceCents`);
    if (min === "" && price === "") continue;
    const minItems = intOrNull(min);
    const priceCents = parseBrlToCents(price);
    if (minItems === null || priceCents === null) return null;
    tiers.push({ minItems, maxItems: max === "" ? null : intOrNull(max), priceCents });
  }

  const packages: PlanDraft["packages"] = [];
  for (let i = 0; i < PACKAGES_MAX; i++) {
    const amount = text(formData, `packages.${i}.amountCents`);
    if (amount === "") continue;
    const amountCents = parseBrlToCents(amount);
    if (amountCents === null) return null;
    packages.push({ amountCents });
  }

  let pass: PlanDraft["pass"] = null;
  if (formData.get("passEnabled") === "on") {
    const priceCents = parseBrlToCents(text(formData, "passPriceCents"));
    const includedLeads = intOrNull(text(formData, "passIncludedLeads"));
    const maxInstallments = intOrNull(text(formData, "passMaxInstallments"));
    if (priceCents === null || includedLeads === null || maxInstallments === null) return null;
    pass = { priceCents, includedLeads, maxInstallments };
  }

  return { freeLeads, freeLeadsValidityDays, season: { startMonth, endMonth }, tiers, packages, pass };
}

/** Publica uma nova versão do plano (Admin10): arquiva a anterior na mesma transação. */
export async function publishPlanAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fadmin%2Fplanos");
  if (actor.role !== "admin") redirect("/403");
  const draft = buildPlanDraft(formData);
  if (!draft) redirect("/admin/planos?erro=invalid_plan");
  try {
    await getBillingService().publishPlan(actor, draft);
  } catch (error) {
    console.error("publicar plano", error instanceof Error ? `${error.name}: ${error.message}` : "erro");
    redirect(`/admin/planos?erro=${billingErrorCode(error)}`);
  }
  revalidatePath("/admin/planos");
  revalidatePath("/papelaria/creditos");
  redirect("/admin/planos?ok=1");
}
