import { NextResponse, type NextRequest } from "next/server";

import { answerSchemaForStep, RespostaEnvelopeSchema } from "@/lib/pesquisa/schemas";
import { countNewSessionsForIpHash, sessionExists, upsertAnswer } from "@/lib/pesquisa/repositorio";
import { hashIp, trustedIpFromHeaders } from "../_lib/ip";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const RATE_LIMIT_PER_HOUR = 30;

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = RespostaEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: NO_STORE });
  }
  const { session_id, step, answers, g, ref, hp } = parsed.data;

  if (hp) return NextResponse.json({ ok: true }, { headers: NO_STORE });

  const answerSchema = answerSchemaForStep(step);
  const answersParsed = answerSchema?.safeParse(answers);
  if (!answerSchema || !answersParsed?.success) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400, headers: NO_STORE });
  }

  const ip = trustedIpFromHeaders(request.headers);
  // Lido direto (não via getServerEnv()): o rate limit não deve desligar por causa de
  // uma variável de servidor não relacionada (ex. OPENROUTER_KEY) estar ausente/inválida.
  const salt = process.env.IP_HASH_SALT || undefined;
  const ipHash = salt ? hashIp(ip, salt) : null;

  const isNewSession = !(await sessionExists(session_id));
  if (isNewSession && ipHash) {
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const count = await countNewSessionsForIpHash(ipHash, sinceIso);
    if (count >= RATE_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
    }
  }

  await upsertAnswer({
    sessionId: session_id,
    step,
    answers: answersParsed.data as Record<string, unknown>,
    sourceGroup: g,
    ref,
    ipHash,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
