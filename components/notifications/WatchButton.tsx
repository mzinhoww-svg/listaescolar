"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

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
  const primary = "bg-tinta text-papel rounded-botao flex min-h-14 w-full items-center justify-center text-base font-extrabold disabled:opacity-60";

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
        <Link href={`/entrar?next=${encodeURIComponent(nextPath)}`} className={primary}>Me avise</Link>
      ) : on ? (
        <>
          <p role="status" className="bg-campo rounded-campo px-4 py-3 text-[13px] font-bold">Você será avisado aqui no app quando a lista for publicada.</p>
          <button type="button" disabled={pending} onClick={() => run(unwatch, false)} className="border-tinta text-tinta rounded-botao min-h-11 border-[1.5px] text-[14px] font-extrabold">Parar de avisar</button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(watch, true)} className={primary}>Me avise</button>
      )}
      <div aria-live="polite">{error ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[13px] font-bold">{error}</p> : null}</div>
    </section>
  );
}
