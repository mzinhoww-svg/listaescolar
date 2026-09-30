"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, buttonClass } from "@/components/ui/Button";

type Result = { status: "ok" } | { status: "error"; code: string };
type Input = { inep: string; gradeSlug: string; year: number };

/** App24 "Me avise" (desvio registrado: só canais que existem; WhatsApp e e-mail ficam "indisponível no momento", sem campo de contato). */
export function WatchButton({ inep, gradeSlug, year, loggedIn, watching, nextPath, watch, unwatch, pushAvailable }: Input & {
  loggedIn: boolean;
  watching: boolean;
  nextPath: string;
  watch: (i: Input) => Promise<Result>;
  unwatch: (i: Input) => Promise<Result>;
  pushAvailable: boolean;
}) {
  const [on, setOn] = useState(watching);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = { inep, gradeSlug, year };

  const run = (fn: (i: Input) => Promise<Result>, next: boolean) =>
    start(async () => {
      const r = await fn(input);
      if (r.status === "ok") {
        setOn(next);
        setError(null);
      } else setError(r.code === "limit" ? "Você atingiu o limite de 20 listas acompanhadas." : "Não foi possível agora. Tente de novo.");
    });

  return (
    <section aria-label="Me avise" className="flex flex-col gap-3">
      <div className="rounded-[22px] bg-white p-4">
        <h3 className="text-[15px] font-extrabold">Como você será avisado</h3>
        <ul className="text-texto-2 mt-2 flex flex-col gap-1 text-[13px] font-semibold">
          <li>Central de notificações do app (sempre).</li>
          {pushAvailable ? <li>Navegador, se você ativar em Notificações.</li> : null}
          <li>WhatsApp: <span className="text-texto-3">indisponível no momento</span></li>
          <li>E-mail: <span className="text-texto-3">indisponível no momento</span></li>
        </ul>
      </div>
      {!loggedIn ? (
        <>
          <p className="text-texto-2 text-[13px] leading-[1.4] font-semibold">Para ser avisado, você entra com seu e-mail e volta para esta lista.</p>
          <Link href={`/entrar?next=${encodeURIComponent(nextPath)}`} className={buttonClass("primary", "lg", "w-full")}>Me avise</Link>
        </>
      ) : on ? (
        <>
          <p role="status" className="bg-campo rounded-campo px-4 py-3 text-[13px] font-bold">Você será avisado aqui no app quando a lista for publicada.</p>
          <Button variant="outline" loading={pending} onClick={() => run(unwatch, false)}>Parar de avisar</Button>
        </>
      ) : (
        <Button size="lg" loading={pending} onClick={() => run(watch, true)} className="w-full">Me avise</Button>
      )}
      <div aria-live="polite">{error ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[13px] font-bold">{error}</p> : null}</div>
    </section>
  );
}
