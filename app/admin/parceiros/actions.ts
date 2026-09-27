"use server";

import { decidePartnerAction as decidePartner, adminRevokeKeyAction as adminRevokeKey } from "@/features/b2b/admin-actions";

// Traduz `FormData` (formulário do `DecisionForm`/`KeyList`) para o formato que as Server Actions de domínio
// esperam (`features/b2b/admin-actions.ts`). Mesmo padrão de `app/admin/reivindicacoes/actions.ts`: a lógica mora
// no domínio, a rota só liga o formulário à action.

function num(formData: FormData, key: string): number | undefined {
  const v = formData.get(key);
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export async function decidePartnerAction(formData: FormData): Promise<void> {
  const partnerId = String(formData.get("partnerId") ?? "");
  const coverageUfs = formData.getAll("coverageUfs");
  await decidePartner(partnerId, {
    to: formData.get("to"),
    plan: str(formData, "plan"),
    coverageUfs: str(formData, "national") ? null : coverageUfs.length > 0 ? coverageUfs : undefined,
    testRatePerMinute: num(formData, "testRatePerMinute"),
    testRatePerDay: num(formData, "testRatePerDay"),
    liveRatePerMinute: num(formData, "liveRatePerMinute"),
    liveRatePerDay: num(formData, "liveRatePerDay"),
    reason: str(formData, "reason"),
  });
}

export async function adminRevokeKeyAction(formData: FormData): Promise<void> {
  const partnerId = String(formData.get("partnerId") ?? "");
  const keyId = String(formData.get("keyId") ?? "");
  await adminRevokeKey(partnerId, keyId, str(formData, "reason"));
}
