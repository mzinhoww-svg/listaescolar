"use client";

import { useActionState, useState } from "react";

import { fieldInputClass } from "@/components/ui/Field";
import { signInWithMagicLink } from "@/features/auth/actions";
import { emailSchema, type AuthActionState } from "@/features/auth/schemas";

import { LinkSent } from "./LinkSent";

const initial: AuthActionState = { status: "idle" };

async function run(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!emailSchema.safeParse(formData.get("email")).success) {
    const raw = formData.get("email");
    return {
      status: "error",
      message: "Informe um e-mail válido.",
      invalid: true,
      email: typeof raw === "string" ? raw.trim().toLowerCase() : undefined,
    };
  }
  return signInWithMagicLink(formData);
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(run, initial);
  const [sends, setSends] = useState(0);
  const [changing, setChanging] = useState(false);
  const [typed, setTyped] = useState("");
  const submit = (formData: FormData) => {
    setChanging(false);
    const raw = formData.get("email");
    if (typeof raw === "string") setTyped(raw.trim().toLowerCase());
    setSends((n) => n + 1);
    action(formData);
  };
  if (state.status === "sent" && !changing) {
    return (
      <LinkSent
        key={sends}
        email={state.email ?? typed}
        next={next}
        pending={pending}
        resend={submit}
        onChangeEmail={() => setChanging(true)}
      />
    );
  }
  return (
    <form action={submit} noValidate className="flex flex-col gap-2.5">
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
        defaultValue={changing ? "" : (state.email ?? "")}
        aria-invalid={state.invalid === true}
        aria-describedby={state.status === "error" ? "email-msg" : undefined}
        className={fieldInputClass}
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-tinta text-papel flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Receber link por e-mail"}
      </button>
      <div aria-live="polite">
        {state.status === "error" && state.message ? (
          <p id="email-msg" role="alert" className="text-erro-texto text-[13px] font-semibold">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
