"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSiteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

import { googleInputSchema, magicLinkInputSchema, type AuthActionState } from "./schemas";

const RATE_LIMIT_ERROR = "Aguarde um minuto para pedir outro link.";
const GENERIC_ERROR = "Não foi possível continuar. Tente novamente.";

async function siteOrigin(): Promise<string> {
  // A origem da requisição só é usada por getSiteOrigin fora de produção.
  const h = await headers();
  return getSiteOrigin(h.get("origin") ?? undefined);
}

function isRateLimit(error: { status?: number; code?: string }): boolean {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  );
}

export async function signInWithMagicLink(formData: FormData): Promise<AuthActionState> {
  const parsed = magicLinkInputSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  const rawEmail = formData.get("email");
  if (!parsed.success) {
    return {
      status: "error",
      message: "Informe um e-mail válido.",
      invalid: true,
      email: typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : undefined,
    };
  }
  const email = parsed.data.email;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(parsed.data.next)}`,
      },
    });
    if (error) {
      return {
        status: "error",
        message: isRateLimit(error) ? RATE_LIMIT_ERROR : GENERIC_ERROR,
        email,
      };
    }
    return { status: "sent", message: "Verifique seu e-mail.", email };
  } catch {
    return { status: "error", message: GENERIC_ERROR, email };
  }
}

export async function signInWithGoogle(formData: FormData): Promise<AuthActionState> {
  const parsed = googleInputSchema.parse({ next: formData.get("next") ?? undefined });
  let url: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(parsed.next)}`,
        skipBrowserRedirect: true,
      },
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
