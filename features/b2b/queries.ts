import "server-only";

import type { SessionActor } from "@/features/auth/actor";

import type { AdminPartnerRow, PartnerOverview } from "./repository";
import { getB2bService } from "./wiring";

// Leituras de servidor para as páginas do portal B2B (Task 3 consome estas funções, não `repository.ts` direto —
// mesmo padrão de `features/leads/queries.ts`).

/** `null` quando o ator não é dono de nenhum parceiro: o layout de `/b2b` redireciona para `/parceiros?cadastro=1`. */
export async function getMyPartnerOverview(actor: SessionActor): Promise<PartnerOverview | null> {
  return getB2bService().getMyPartner(actor);
}

/** Atalho para o layout de `/b2b`: só precisa saber SE há vínculo, não o quê. */
export async function isB2bMember(actor: SessionActor): Promise<boolean> {
  return (await getMyPartnerOverview(actor)) !== null;
}

export async function listPartnersForAdmin(actor: SessionActor, filter?: { status?: string; partnerType?: string }): Promise<AdminPartnerRow[]> {
  return getB2bService().listPartners(actor, filter);
}

export async function getPartnerForAdmin(actor: SessionActor, partnerId: string): Promise<PartnerOverview | null> {
  return getB2bService().getPartner(actor, partnerId);
}
