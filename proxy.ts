import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Tudo, exceto `_next/`, `brand/`, `v1/` e `ingest/`. Não excluir por extensão: `/admin.json` não pode contornar o gate.
// `v1/` (API B2B, S24) fica fora de propósito: sem cookie, sem refresh de sessão, sem redirect de login — a
// autenticação é só pela chave `x-listacerta-key`, verificada no próprio handler de cada rota.
// `ingest/` (proxy de medição, ADR-007) também: Route Handler que repassa só `content-type` ao PostHog, sem sessão nem cookie do app.
export const config = {
  matcher: ["/((?!_next/|brand/|v1/|ingest/).*)"],
};
