"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { googleInputSchema, magicLinkInputSchema, type AuthActionState } from "./schemas";

const GENERIC_ERROR = "Não foi possível continuar. Tente novamente.";

async function callbackUrl(next: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  const origin = h.get("origin") ?? `${proto}://${host}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithMagicLink(formData: FormData): Promise<AuthActionState> {
  const parsed = magicLinkInputSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "Informe um e-mail válido." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true, emailRedirectTo: await callbackUrl(parsed.data.next) },
    });
    if (error) return { status: "error", message: GENERIC_ERROR };
    return { status: "sent", message: "Verifique seu e-mail." };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}

export async function signInWithGoogle(formData: FormData): Promise<AuthActionState> {
  const parsed = googleInputSchema.parse({ next: formData.get("next") ?? undefined });
  let url: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: await callbackUrl(parsed.next), skipBrowserRedirect: true },
    });
    url = error ? null : data.url;
  } catch {
    url = null;
  }
  if (url === null) return { status: "error", message: GENERIC_ERROR };
  redirect(url);
}

export async function signOut(): Promise<AuthActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { status: "error", message: GENERIC_ERROR };
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
  redirect("/entrar");
}
