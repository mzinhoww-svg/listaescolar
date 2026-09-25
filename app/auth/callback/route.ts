import { NextResponse, type NextRequest } from "next/server";

import { callbackQuerySchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

function fail(request: NextRequest, code: "provedor" | "codigo") {
  const url = new URL("/entrar", request.nextUrl.origin);
  url.searchParams.set("erro", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const query = callbackQuerySchema.parse({
    code: p.get("code"),
    error: p.get("error"),
    error_description: p.get("error_description"),
    next: p.get("next") ?? undefined,
  });

  if (query.error || query.error_description) return fail(request, "provedor");
  if (!query.code) return fail(request, "codigo");

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(query.code);
    if (error) return fail(request, "codigo");
  } catch {
    return fail(request, "codigo");
  }
  return NextResponse.redirect(new URL(query.next, request.nextUrl.origin));
}
