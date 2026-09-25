import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import type { UserRole } from "./access";
import { roleSchema } from "./schemas";

/** Usuário validado no servidor (`getUser`), nunca `getSession`. Um só getUser por request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/** Papel vem de `profiles` (RLS), nunca de `user_metadata`. Um só select por request. */
export const getCurrentRole = cache(async (): Promise<UserRole | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const parsed = roleSchema.safeParse(data?.role);
  return parsed.success ? parsed.data : null;
});
