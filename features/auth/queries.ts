import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import type { UserRole } from "./access";
import { roleSchema } from "./schemas";

/** Usuário validado no servidor (`getUser`), nunca `getSession`. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Papel vem de `profiles` (RLS), nunca de `user_metadata`. */
export async function getCurrentRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  const parsed = roleSchema.safeParse(data?.role);
  return parsed.success ? parsed.data : null;
}
