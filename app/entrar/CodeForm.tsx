"use client";

import { useActionState } from "react";

import { verifyEmailCode } from "@/features/auth/actions";
import { codeSchema, type AuthActionState } from "@/features/auth/schemas";

const initial: AuthActionState = { status: "idle" };

async function run(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!codeSchema.safeParse(formData.get("code")).success) {
    return { status: "error", message: "Informe o código de 6 dígitos.", invalid: true };
  }
  return verifyEmailCode(formData);
}

/** Alternativa ao link: código de 6 dígitos do mesmo e-mail (D-163). Em sucesso a action redireciona. */
export function CodeForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState(run, initial);
  return (
    <form action={action} noValidate className="flex flex-col gap-2.5" data-testid="code-form">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <label htmlFor="code" className="text-texto-2 text-[13px] font-semibold">
        Ou digite o código de 6 dígitos do e-mail
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="000000"
        aria-invalid={state.invalid === true}
        aria-describedby={state.status === "error" ? "code-msg" : undefined}
        className="bg-campo text-tinta rounded-campo focus-visible:ring-verde-fundo h-[52px] w-full px-4 text-center text-[22px] font-bold tracking-[0.3em] outline-none focus-visible:ring-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-verde-fundo text-papel rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold disabled:opacity-60"
      >
        {pending ? "Verificando…" : "Entrar com o código"}
      </button>
      <div aria-live="polite">
        {state.status === "error" && state.message ? (
          <p id="code-msg" role="alert" className="text-[13px] font-semibold text-red-700">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
