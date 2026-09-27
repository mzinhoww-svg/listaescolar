import { randomUUID } from "node:crypto";
import type { Client } from "pg";

import { attemptH, IDS, withSuperuser, type HintAttempt } from "./helpers";

// Fixtures de comissão/repasse/inadimplência (S23). Tudo passa pelas funções SQL da 0403 (service_role).

/**
 * Limpa vendas/lançamentos de teste que CONFIRMARAM (commit) para uma lista de leads. `sale_payments`/`payout_ledger`
 * são imutáveis por gatilho (`enable always`, disparam mesmo para o dono do banco): desativa, apaga, reativa —
 * mesmo padrão de `purgeBilling`. Só de teste; nunca usar fora de `tests/`.
 */
export async function purgePayouts(opts: { leadIds: readonly string[] }): Promise<void> {
  if (opts.leadIds.length === 0) return;
  const guarded: [string, string][] = [
    ["sale_payment_admin_validations", "sale_payment_admin_validations_no_update_delete"],
    ["sale_payments", "sale_payments_no_update_delete"],
    ["payout_ledger", "payout_ledger_no_update_delete"],
  ];
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      for (const [table, trigger] of guarded) {
        await c.query(`alter table public.${table} disable trigger ${trigger}`);
      }
      await c.query(
        `delete from public.sale_payment_admin_validations where sale_payment_id in (select id from public.sale_payments where lead_id = any($1::uuid[]))`,
        [opts.leadIds],
      );
      await c.query(
        `delete from public.payout_ledger where sale_payment_id in (select id from public.sale_payments where lead_id = any($1::uuid[]))`,
        [opts.leadIds],
      );
      await c.query(`delete from public.sale_payments where lead_id = any($1::uuid[])`, [opts.leadIds]);
      for (const [table, trigger] of guarded) {
        await c.query(`alter table public.${table} enable always trigger ${trigger}`);
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
}

export async function publishPayoutSettings(
  c: Client,
  o: { commissionBps: number; graceDays: number; blockDays: number },
  actorId: string = IDS.admin,
): Promise<HintAttempt> {
  return attemptH(c, "select public.payout_settings_publish($1::uuid, $2::int, $3::int, $4::int) as id", [
    actorId,
    o.commissionBps,
    o.graceDays,
    o.blockDays,
  ]);
}

export async function publishPayoutSettingsOk(c: Client, o: { commissionBps: number; graceDays: number; blockDays: number }): Promise<string> {
  const r = await publishPayoutSettings(c, o);
  if (r.error) throw new Error(`publishPayoutSettings: ${r.error} (${r.hint})`);
  return r.rows[0]!.id as string;
}

export async function publishSchoolConfig(
  c: Client,
  o: {
    schoolId: string;
    target: "none" | "school" | "apm";
    payoutBps?: number;
    beneficiaryName?: string | null;
    pixKey?: string | null;
    pixKeyKind?: string | null;
  },
  actorId: string = IDS.admin,
): Promise<HintAttempt> {
  return attemptH(
    c,
    "select public.payout_school_config_publish($1::uuid, $2::uuid, $3::text, $4::int, $5::text, $6::text, $7::text) as id",
    [
      actorId,
      o.schoolId,
      o.target,
      o.payoutBps ?? 0,
      o.beneficiaryName ?? (o.target === "none" ? null : "APM Fixture"),
      o.pixKey ?? (o.target === "none" ? null : "apm@fixture.invalid"),
      o.pixKeyKind ?? (o.target === "none" ? null : "email"),
    ],
  );
}

export async function confirmSale(
  c: Client,
  o: { actorId: string | null; actorRole: "stationery_member" | "admin" | "system"; leadId: string; schoolId?: string | null },
): Promise<HintAttempt> {
  return attemptH(c, "select public.payout_confirm_sale($1::uuid, $2::text, $3::uuid, $4::uuid) as id", [
    o.actorId,
    o.actorRole,
    o.leadId,
    o.schoolId ?? null,
  ]);
}

export async function validateSale(c: Client, o: { actorId: string; leadId: string; schoolId?: string | null }): Promise<HintAttempt> {
  return attemptH(c, "select public.payout_admin_validate_sale($1::uuid, $2::uuid, $3::uuid) as id", [o.actorId, o.leadId, o.schoolId ?? null]);
}

export async function batchCreate(c: Client, o: { actorId: string; schoolId: string; beneficiaryType?: "school" | "apm" }): Promise<HintAttempt> {
  return attemptH(c, "select public.payout_batch_create($1::uuid, $2::uuid, $3::text) as id", [o.actorId, o.schoolId, o.beneficiaryType ?? "apm"]);
}

export async function batchMarkExecuted(c: Client, o: { actorId: string; batchId: string }): Promise<HintAttempt> {
  return attemptH(c, "select public.payout_batch_mark_executed($1::uuid, $2::uuid) as id", [o.actorId, o.batchId]);
}

export async function flagLatePayment(
  c: Client,
  o: { invoiceId: string; provider?: string; providerChargeId: string; amountCents: number; actorRole?: string },
): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_flag_late_payment($1::uuid, $2::text, $3::text, $4::int, $5::text) as id", [
    o.invoiceId,
    o.provider ?? "fake",
    o.providerChargeId,
    o.amountCents,
    o.actorRole ?? "system",
  ]);
}

export async function resolveAlert(c: Client, o: { actorId: string; alertId: string; note?: string | null }): Promise<HintAttempt> {
  return attemptH(c, "select public.billing_resolve_payment_alert($1::uuid, $2::uuid, $3::text) as id", [o.actorId, o.alertId, o.note ?? null]);
}

export type LedgerRow = {
  id: string;
  entry_type: string;
  beneficiary_type: string;
  beneficiary_id: string | null;
  amount_cents: number;
  batch_id: string | null;
  sale_payment_id: string | null;
};

export async function ledgerFor(c: Client, beneficiaryType: string, beneficiaryId: string | null): Promise<LedgerRow[]> {
  const r = await c.query(
    `select id, entry_type, beneficiary_type, beneficiary_id, amount_cents, batch_id, sale_payment_id
       from public.payout_ledger where beneficiary_type = $1 and beneficiary_id is not distinct from $2
      order by created_at, id`,
    [beneficiaryType, beneficiaryId],
  );
  return r.rows as LedgerRow[];
}

export async function pendingFor(c: Client, beneficiaryType: string, beneficiaryId: string): Promise<number> {
  const r = await c.query(
    `select coalesce(sum(amount_cents), 0)::bigint as p from public.payout_ledger
      where beneficiary_type = $1 and beneficiary_id = $2 and entry_type in ('repasse_due', 'repasse_settled', 'repasse_reversed')`,
    [beneficiaryType, beneficiaryId],
  );
  return Number(r.rows[0].p);
}

export function randomPixKey(): string {
  return `${randomUUID()}@fixture.invalid`;
}

/**
 * Limpa TUDO de comissão/repasse (payout_settings, school_payout_settings, sale_payments, payout_ledger,
 * payout_batches) de testes que COMMITARAM via cliente REST real (ex.: tests/payouts/repository.test.ts) — sem
 * isso, linhas reais ficam para sempre no banco local e vazam para outros arquivos do `pnpm test:db` (contam a
 * mais em "uma versão ativa por vez", e prendem escolas de fixture que o `cleanupUsers()` não consegue apagar).
 * Só de teste; nunca usar fora de `tests/`.
 */
export async function purgeAllPayoutTestData(): Promise<void> {
  const guarded: [string, string][] = [
    ["sale_payment_admin_validations", "sale_payment_admin_validations_no_update_delete"],
    ["sale_payments", "sale_payments_no_update_delete"],
    ["payout_ledger", "payout_ledger_no_update_delete"],
    ["payout_settings", "payout_settings_guard"],
    ["school_payout_settings", "school_payout_settings_guard"],
    ["payout_batches", "payout_batches_guard"],
  ];
  await withSuperuser(async (c) => {
    await c.query("begin");
    try {
      for (const [table, trigger] of guarded) {
        await c.query(`alter table public.${table} disable trigger ${trigger}`);
      }
      // ordem: validations e ledger antes de sale_payments (FK `on delete restrict` das duas para sale_payments.id).
      await c.query("delete from public.sale_payment_admin_validations");
      await c.query("delete from public.payout_ledger");
      await c.query("delete from public.sale_payments");
      await c.query("delete from public.payout_batches");
      await c.query("delete from public.school_payout_settings");
      await c.query("delete from public.payout_settings");
      for (const [table, trigger] of guarded) {
        await c.query(`alter table public.${table} enable always trigger ${trigger}`);
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
}
