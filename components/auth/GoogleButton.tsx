"use client";

import { useActionState } from "react";

import { track } from "@/lib/analytics/track";
import { signInWithGoogle } from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/schemas";

import { GoogleIcon, ShieldIcon } from "./icons";

const initial: AuthActionState = { status: "idle" };

async function run(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  track("login_started", { method: "google" });
  return signInWithGoogle(formData);
}

export function GoogleButton({ next }: { next: string }) {
  const [state, action, pending] = useActionState(run, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="border-tinta text-tinta flex h-[58px] w-full items-center justify-center gap-3 rounded-botao border-[1.5px] bg-white text-base font-extrabold disabled:opacity-60"
      >
        <GoogleIcon />
        {pending ? "Aguarde…" : "Entrar com Google"}
      </button>
      <div className="flex items-start gap-2 px-1">
        <ShieldIcon />
        <p className="text-texto-2 text-[13px] leading-[1.4] font-semibold">Usamos só nome e e-mail da sua conta Google. Nada é publicado.</p>
      </div>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-center text-[13px] font-semibold text-erro-texto">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
