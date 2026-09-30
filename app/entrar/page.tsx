import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth/AuthHeader";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { PrivacyNote } from "@/components/auth/PrivacyNote";
import { Screen } from "@/components/auth/Screen";
import { getCurrentUser } from "@/features/auth/queries";
import { loginErrorMessage, sessionEndedNotice } from "@/features/auth/login-context";
import { safeNextPath } from "@/features/auth/redirect";

import { LoginForm } from "./LoginForm";
import { LoginIntro } from "./LoginIntro";

export const metadata: Metadata = { title: "Entrar · ListaCerta" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  if (await getCurrentUser()) redirect(next);
  const erro = Array.isArray(sp.erro) ? sp.erro[0] : sp.erro;
  const erroMsg = erro ? loginErrorMessage(erro) : null;
  const expired = (Array.isArray(sp.sessao) ? sp.sessao[0] : sp.sessao) === "terminou";

  return (
    <Screen top={56}>
      <AuthHeader next={next} />
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex-1" />
        <div className="flex flex-col gap-4">
          <Link href="/" aria-label="ListaCerta, ir para o início" className="inline-flex size-16 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fundo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/simbolo.svg" alt="" width={64} height={64} />
          </Link>
          {expired ? (
            <p role="status" className="bg-branco-tonal text-tinta rounded-campo px-4 py-3 text-[15px] font-semibold">
              {sessionEndedNotice(next)}
            </p>
          ) : null}
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
