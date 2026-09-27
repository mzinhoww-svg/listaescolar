import { NextResponse } from "next/server";

import { getSessionActor } from "@/features/auth/actor";
import { exportAccountData } from "@/features/privacy/repository";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Exportação dos próprios dados (LGPD, S17): exige sessão; nunca aceita id por parâmetro. JSON para download. */
export async function GET(): Promise<Response> {
  const actor = await getSessionActor();
  if (!actor) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  try {
    const data = await exportAccountData(createAdminClient(), actor.userId);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": "attachment; filename=\"meus-dados-listacerta.json\"",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("exportar dados da conta", error instanceof Error ? error.name : "erro");
    return NextResponse.json({ error: "falha ao exportar" }, { status: 500 });
  }
}
