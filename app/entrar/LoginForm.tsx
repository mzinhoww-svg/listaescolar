"use client";

import { useActionState } from "react";

import { signInWithMagicLink } from "@/features/auth/actions";
import { emailSchema, type AuthActionState } from "@/features/auth/schemas";

const initial: AuthActionState = { status: "idle" };

async function run(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!emailSchema.safeParse(formData.get("email")).success) {
    return { status: "error", message: "Informe um e-mail válido." };
  }
  return signInWithMagicLink(formData);
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(run, initial);
  const sent = state.status === "sent";
  return (
    <form action={action} noValidate className="flex flex-col gap-2.5">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-texto-2 text-[13px] font-semibold">
        E-mail
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        aria-invalid={state.status === "error"}
        className="bg-campo text-tinta h-[52px] w-full rounded-campo px-4 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo"
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-tinta text-papel flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold disabled:opacity-60"
      >
        {pending ? "Enviando…" : sent ? "Reenviar link" : "Receber link por e-mail"}
      </button>
      <div aria-live="polite">
        {state.status === "error" && state.message ? (
          <p role="alert" className="text-[13px] font-semibold text-red-700">
            {state.message}
          </p>
        ) : null}
        {sent ? (
          <p className="text-verde-fundo text-[13px] font-semibold">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
