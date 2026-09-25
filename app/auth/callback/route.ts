import { NextResponse, type NextRequest } from "next/server";

import { callbackQuerySchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/** Redirect com Location relativo: Host/x-forwarded-host são forjáveis e não entram na URL. */
function redirectTo(path: string, headers: Headers) {
  const res = new NextResponse(null, { status: 307, headers: { Location: path } });
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

function fail(code: "provedor" | "codigo", headers: Headers) {
  return redirectTo(`/entrar?erro=${code}`, headers);
}

/** Retorno do OAuth (Google): troca `code` PKCE por sessão. O link mágico usa /auth/confirm. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const query = callbackQuerySchema.parse({
    code: p.get("code"),
    error: p.get("error"),
    error_description: p.get("error_description"),
    next: p.get("next") ?? undefined,
  });
  const headers = new Headers();

  if (query.error || query.error_description) return fail("provedor", headers);
  if (!query.code) return fail("codigo", headers);

  try {
    const supabase = await createClient(headers);
    const { error } = await supabase.auth.exchangeCodeForSession(query.code);
    if (error) return fail("codigo", headers);
  } catch {
    return fail("codigo", headers);
  }
  return redirectTo(query.next, headers);
}
