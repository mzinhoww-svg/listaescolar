import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { protectedPrefix } from "@/features/auth/access";
import { decideAccess } from "@/features/auth/decide-access";
import { roleSchema } from "@/features/auth/schemas";
import { getPublicEnv } from "@/lib/env.public";

/**
 * Renova a sessão e aplica o controle de rota. A decisão usa `auth.getUser()`
 * (valida o token no servidor) e o papel de `public.profiles` via RLS; nunca
 * `getSession()` nem `user_metadata`.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items) {
          for (const { name, value } of items) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of items) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { pathname, search } = request.nextUrl;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  let role = null;
  if (userId !== null && protectedPrefix(pathname) !== null) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const parsed = roleSchema.safeParse(profile?.role);
    role = parsed.success ? parsed.data : null;
  }

  const decision = decideAccess({ pathname, search, userId, role });
  if (decision.action === "next") return response;

  const target = request.nextUrl.clone();
  const [path, query] = decision.location.split("?");
  target.pathname = path ?? "/";
  target.search = query ? `?${query}` : "";
  const out =
    decision.action === "redirect-login"
      ? NextResponse.redirect(target)
      : NextResponse.rewrite(target, { status: 403 });
  for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
  return out;
}
