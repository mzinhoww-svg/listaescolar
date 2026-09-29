import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";

import { fail, numericAsNumber, requireActor } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

export type StatementLineItem = {
  id: string;
  source: "api_usage" | "campaign_cpm" | "campaign_cpc";
  campaignId: string | null;
  label: string;
  quantity: number;
  unit: string;
  unitPriceCents: number | null;
  amountCents: number | null;
  pricingStatus: "priced" | "unavailable";
};

export type Statement = {
  id: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  paymentInstruction: string | null;
  createdAt: string;
  lineItems: readonly StatementLineItem[];
};

const lineItemSchema = z.object({
  id: z.uuid(),
  source: z.enum(["api_usage", "campaign_cpm", "campaign_cpc"]),
  campaign_id: z.uuid().nullable(),
  label: z.string(),
  quantity: numericAsNumber,
  unit: z.string(),
  unit_price_cents: z.number().nullable(),
  amount_cents: numericAsNumber.nullable(),
  pricing_status: z.enum(["priced", "unavailable"]),
});

export async function generateStatement(
  client: SupabaseClient,
  actor: SessionActor,
  partnerId: string,
  periodStart: string,
  periodEnd: string,
  paymentInstruction?: string,
): Promise<{ statementId: string }> {
  requireActor(actor);
  const { data, error } = await client.rpc("b2b_statement_generate", {
    p_actor_id: actor.userId,
    p_partner_id: partnerId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_payment_instruction: paymentInstruction ?? null,
  });
  if (error) fail("gerar extrato", error);
  return { statementId: z.uuid().parse(data) };
}

export async function listStatementsForPartner(client: SupabaseClient, partnerId: string): Promise<Statement[]> {
  const { data, error } = await client.from("b2b_statements").select("*, b2b_statement_line_items(*)").eq("partner_id", partnerId).order("period_start", { ascending: false });
  if (error) fail("listar extratos", error);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const items = z.array(lineItemSchema).parse(row.b2b_statement_line_items ?? []);
    return {
      id: z.uuid().parse(row.id),
      partnerId: z.uuid().parse(row.partner_id),
      periodStart: z.string().parse(row.period_start),
      periodEnd: z.string().parse(row.period_end),
      paymentInstruction: z.string().nullable().parse(row.payment_instruction),
      createdAt: z.string().parse(row.created_at),
      lineItems: items.map((i) => ({
        id: i.id,
        source: i.source,
        campaignId: i.campaign_id,
        label: i.label,
        quantity: i.quantity,
        unit: i.unit,
        unitPriceCents: i.unit_price_cents,
        amountCents: i.amount_cents,
        pricingStatus: i.pricing_status,
      })),
    };
  });
}
