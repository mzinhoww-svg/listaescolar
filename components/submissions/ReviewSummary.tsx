import Link from "next/link";

import { PUBLICATION_STATE_COPY, REVIEW_NOTICE } from "@/features/submissions/copy";
import { WARNING_LOW_CONFIDENCE } from "@/supabase/functions/_shared/ai/warnings";
import type { ExtractionResult } from "@/features/submissions/schemas";

// Rótulos neutros: sinalizações para revisão, nunca parecer jurídico.
const ALERT_LABEL: Record<string, string> = {
  low_confidence_item: "leitura incerta",
  ambiguous_item: "item ambíguo",
  possible_collective_item: "possível uso coletivo",
  restrictive_brand_or_spec: "marca ou especificação",
};

/** Resumo do que a leitura encontrou (a revisão do responsável é a S10). Só mostra o que veio do resultado. */
export function ReviewSummary({ result, isDemo, status, publicationDemo = false }: { result?: ExtractionResult; isDemo: boolean; status?: string; publicationDemo?: boolean }) {
  const state = status === "human_review" || status === "approved" || status === "published" ? PUBLICATION_STATE_COPY[status] : null;
  const items = result?.items ?? [];
  // Baixa confiança ou alerta crítico: aviso em destaque (nunca "publicável automático"; a revisão é obrigatória).
  const attention = result?.lowConfidence === true || (result?.criticalAlerts?.length ?? 0) > 0;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Lista lida</h1>
      {isDemo ? (
        <p className="bg-campo text-texto-2 w-fit rounded-full px-3 py-1 text-xs font-extrabold">Demonstração</p>
      ) : null}
      {state ? (
        <section data-testid="publication-state" className="bg-campo rounded-2xl p-3.5">
          <p className="text-[15px] font-extrabold">{state.title}</p>
          <p className="text-texto-2 text-[13px] leading-[1.4] font-semibold">{state.body}</p>
          {status === "published" && publicationDemo ? (
            <p className="bg-white text-texto-2 mt-2 w-fit rounded-full px-3 py-1 text-xs font-extrabold">Demonstração</p>
          ) : null}
        </section>
      ) : null}
      {status === "published" ? null : (
        <p className="text-texto-2 rounded-2xl bg-[#fdebd3] p-3.5 text-[13px] leading-[1.4] font-semibold">{REVIEW_NOTICE}</p>
      )}
      {items.length === 0 ? (
        <p className="text-texto-2 text-[15px] font-semibold">Nenhum item foi identificado neste arquivo.</p>
      ) : (
        <section aria-label="Itens lidos">
          <h2 className="mb-2 flex justify-between text-[13px] font-extrabold">
            Itens <span className="text-texto-3">{items.length === 1 ? "1 item" : `${items.length} itens`}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5">
                <span className="text-[15px] font-bold">
                  {item.name}
                  {(item.alerts ?? []).map((a) =>
                    ALERT_LABEL[a] ? (
                      <span key={a} className="text-texto-3 ml-2 text-[11px] font-semibold">
                        {ALERT_LABEL[a]}
                      </span>
                    ) : null,
                  )}
                </span>
                <span className="text-texto-2 shrink-0 text-sm font-extrabold">
                  {item.quantity ?? "—"} {item.unit ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {result?.warnings.map((w) => (
        <p
          key={w}
          role={w === WARNING_LOW_CONFIDENCE ? "alert" : undefined}
          className={
            attention
              ? "text-tinta rounded-2xl bg-[#fdebd3] p-3.5 text-[13px] leading-[1.4] font-extrabold"
              : "text-texto-3 text-xs font-semibold"
          }
        >
          {w}
        </p>
      ))}
      <Link
        href="/enviar-lista"
        className="border-tinta text-tinta mt-auto flex h-[52px] w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold"
      >
        Enviar outra lista
      </Link>
    </main>
  );
}
