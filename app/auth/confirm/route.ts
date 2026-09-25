import { NextResponse, type NextRequest } from "next/server";

import { confirmQuerySchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

function redirectTo(path: string, headers: Headers) {
  const res = new NextResponse(null, { status: 307, headers: { Location: path } });
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

/** Link mágico: `token_hash` + `verifyOtp` funciona mesmo se o e-mail abrir em outro navegador. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const headers = new Headers();
  const query = confirmQuerySchema.safeParse({
    token_hash: p.get("token_hash"),
    type: p.get("type"),
    next: p.get("next") ?? undefined,
  });
  if (!query.success || !query.data.token_hash) return redirectTo("/entrar?erro=codigo", headers);

  try {
    const supabase = await createClient(headers);
    const { error } = await supabase.auth.verifyOtp({
      token_hash: query.data.token_hash,
      type: query.data.type,
    });
    if (error) return redirectTo("/entrar?erro=codigo", headers);
  } catch {
    return redirectTo("/entrar?erro=codigo", headers);
  }
  return redirectTo(query.data.next, headers);
}
