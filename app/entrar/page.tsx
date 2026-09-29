import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { PrivacyNote } from "@/components/auth/PrivacyNote";
import { Screen } from "@/components/auth/Screen";
import { getCurrentUser } from "@/features/auth/queries";
import { safeNextPath } from "@/features/auth/redirect";

import { LoginForm } from "./LoginForm";
import { LoginIntro } from "./LoginIntro";

export const metadata: Metadata = { title: "Entrar · ListaCerta" };

const ERRORS: Record<string, string> = {
  codigo: "Não foi possível entrar. O link expirou ou já foi usado. Peça um novo link abaixo e abra o e-mail neste aparelho.",
};

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  if (await getCurrentUser()) redirect(next);
  const erro = Array.isArray(sp.erro) ? sp.erro[0] : sp.erro;
  const erroMsg = erro ? (ERRORS[erro] ?? "Não foi possível entrar. Tente de novo.") : null;

  return (
    <Screen top={72}>
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex-1" />
        <div className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/simbolo.svg" alt="ListaCerta" width={64} height={64} />
          <LoginIntro next={next} />
        </div>
        <div className="flex-1" />
        <div className="flex flex-col gap-3.5">
          {erroMsg ? (
            <p role="alert" className="text-erro-texto text-sm font-semibold">
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
