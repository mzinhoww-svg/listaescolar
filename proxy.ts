import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Tudo, exceto `_next/` e `brand/`. Não excluir por extensão: `/admin.json` não pode contornar o gate.
export const config = {
  matcher: ["/((?!_next/|brand/).*)"],
};
