import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env.public";

/** Cliente de navegador. Criado sob demanda, nunca no import. */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
