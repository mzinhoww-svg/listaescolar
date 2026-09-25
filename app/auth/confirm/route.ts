import { NextResponse, type NextRequest } from "next/server";

import { confirmQuerySchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

const ERRO = "/entrar?erro=codigo";

function redirectTo(path: string, headers: Headers) {
  const res = new NextResponse(null, { status: 307, headers: { Location: path } });
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

/**
 * Link mágico: `token_hash` + `verifyOtp` funciona mesmo se o e-mail abrir em outro navegador.
 * Fallback `code` (PKCE) quando o e-mail usa o template padrão (só no mesmo navegador).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const headers = new Headers();
  const query = confirmQuerySchema.safeParse({
    token_hash: p.get("token_hash"),
    type: p.get("type"),
    code: p.get("code"),
    next: p.get("next") ?? undefined,
  });
  if (!query.success) return redirectTo(ERRO, headers);
  const { token_hash, type, code, next } = query.data;
  if (!(token_hash && type) && !code) return redirectTo(ERRO, headers);

  try {
    const supabase = await createClient(headers);
    const { error } =
      token_hash && type
        ? await supabase.auth.verifyOtp({ token_hash, type })
        : await supabase.auth.exchangeCodeForSession(code ?? "");
    if (error) return redirectTo(ERRO, headers);
  } catch {
    return redirectTo(ERRO, headers);
  }
  return redirectTo(next, headers);
}
