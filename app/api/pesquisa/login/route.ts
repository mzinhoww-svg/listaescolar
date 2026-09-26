import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { LoginRequestSchema } from "@/lib/pesquisa/schemas";
import {
  RESULTS_COOKIE_MAX_AGE_SECONDS,
  RESULTS_COOKIE_NAME,
  passwordMatches,
  signResultsCookie,
} from "@/lib/pesquisa/auth-resultados";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = LoginRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: NO_STORE });
  }

  const password = getServerEnv().PESQUISA_RESULTS_PASSWORD;
  if (!password || !passwordMatches(parsed.data.senha, password)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401, headers: NO_STORE });
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  response.cookies.set(RESULTS_COOKIE_NAME, signResultsCookie(password), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: RESULTS_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
