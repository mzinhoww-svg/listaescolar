import { NextResponse, type NextRequest } from "next/server";

import { LeadRequestSchema } from "@/lib/pesquisa/schemas";
import { normalizeWhatsappBR } from "@/lib/pesquisa/telefone";
import { createOrUpdateLead } from "@/lib/pesquisa/repositorio";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Texto exato do checkbox da tela final (spec seção 4). */
const CONSENT_TEXT =
  "Aceito receber mensagens da ListaCerta pelo WhatsApp sobre a lista escolar. Posso cancelar quando quiser.";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = LeadRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: NO_STORE });
  }
  const { session_id, name, whatsapp, hp } = parsed.data;

  if (hp) return NextResponse.json({ ok: true }, { headers: NO_STORE });

  const whatsappE164 = normalizeWhatsappBR(whatsapp);
  if (!whatsappE164) {
    return NextResponse.json({ error: "invalid_whatsapp" }, { status: 400, headers: NO_STORE });
  }

  const result = await createOrUpdateLead({
    sessionId: session_id,
    name,
    whatsappE164,
    consentText: CONSENT_TEXT,
  });
  if (result === "session_not_found") {
    return NextResponse.json({ error: "session_not_found" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
