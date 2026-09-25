import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env.public";

/**
 * Cliente de servidor com a sessão do usuário (cookies). RLS vale como o usuário.
 * `responseHeaders`: em Route Handlers, recebe os cabeçalhos anti-cache do @supabase/ssr
 * para o handler aplicá-los à resposta (Server Components/Actions não têm como).
 */
export async function createClient(responseHeaders?: Headers) {
  const env = getPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(items, headers) {
          if (responseHeaders) {
            for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value);
          }
          try {
            for (const { name, value, options } of items) cookieStore.set(name, value, options);
          } catch {
            // Server Component: escrita de cookie não é permitida; o proxy renova a sessão.
          }
        },
      },
    },
  );
}
