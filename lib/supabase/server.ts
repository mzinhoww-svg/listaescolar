import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env.public";

/** Cliente de servidor com a sessão do usuário (cookies). RLS vale como o usuário. */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(items) {
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
