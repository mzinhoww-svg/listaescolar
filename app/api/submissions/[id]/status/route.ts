import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSubmissionStatus } from "@/features/submissions/status";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Status do envio para o painel (polling). Sessão validada no servidor; a RLS limita ao dono e ao admin.
 * Envio alheio e inexistente respondem igual (404): a rota não revela que o envio existe.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const headers = new Headers({ "Cache-Control": "no-store" });
  const supabase = await createClient(headers);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  const status = await getSubmissionStatus(supabase, id);
  if (!status) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  return NextResponse.json(status, { headers });
}
