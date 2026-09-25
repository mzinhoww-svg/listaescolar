import type { Metadata } from "next";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { PrivacyNote } from "@/components/auth/PrivacyNote";
import { Screen } from "@/components/auth/Screen";
import { safeNextPath } from "@/features/auth/redirect";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar · ListaCerta" };

const ERRORS: Record<string, string> = {
  codigo: "Não foi possível entrar. O link expirou ou já foi usado. Tente de novo.",
};

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const erro = Array.isArray(sp.erro) ? sp.erro[0] : sp.erro;
  const erroMsg = erro ? (ERRORS[erro] ?? "Não foi possível entrar. Tente de novo.") : null;

  return (
    <Screen top={72}>
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex-1" />
        <div className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/simbolo.svg" alt="ListaCerta" width={64} height={64} />
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            Entre para acompanhar a lista de cada aluno
          </h1>
          <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
            Um acesso só para todos os alunos da família. Sem senha para lembrar.
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-col gap-3.5">
          {erroMsg ? (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {erroMsg}
            </p>
          ) : null}
          <GoogleButton next={next} />
          <PrivacyNote />
          <LoginForm next={next} />
        </div>
      </div>
    </Screen>
  );
}
