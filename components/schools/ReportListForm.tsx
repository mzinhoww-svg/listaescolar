"use client";

import { useId } from "react";

import { REPORT_REASONS, REPORT_REASON_LABEL } from "@/features/reports/ports";

type Act = (formData: FormData) => Promise<void>;

/**
 * Denúncia pública mínima (S16, Ruling): só autenticado, só sobre a lista publicada em exibição. Motivo por enum;
 * sem campo de texto livre (bloqueia dado pessoal por construção, mesmo sem depender do usuário se conter).
 */
export function ReportListForm({ listId, action, ok, erro }: { listId: string; action: Act; ok: boolean; erro: string | null }) {
  const id = useId();
  // Depois de enviar (sucesso ou erro), o redirect volta com #denunciar; sem abrir de novo, a mensagem fica
  // dentro do <details> fechado (o navegador não expande sozinho: o alvo do fragmento é o próprio <details>,
  // não um elemento dentro dele).
  return (
    <details id="denunciar" open={ok || erro ? true : undefined} className="rounded-campo bg-campo p-4 text-[13px]">
      <summary className="cursor-pointer font-extrabold">Encontrou um problema nesta lista?</summary>
      <div className="mt-3 flex flex-col gap-3">
        {ok ? <p role="status" className="bg-verde-certo/20 text-verde-fundo rounded-campo px-3 py-2 font-bold">Denúncia enviada. A equipe vai revisar.</p> : null}
        {erro ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-3 py-2 font-bold">Não foi possível enviar. Entre e tente de novo.</p> : null}
        <form action={action} className="flex flex-col gap-2.5">
          <input type="hidden" name="targetType" value="school_list" />
          <input type="hidden" name="targetId" value={listId} />
          <label htmlFor={`${id}-reason`} className="font-bold">Motivo</label>
          <select id={`${id}-reason`} name="reason" required className="rounded-campo h-11 bg-white px-3 font-medium">
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>{REPORT_REASON_LABEL[r]}</option>
            ))}
          </select>
          <button type="submit" className="border-tinta text-tinta rounded-botao h-10 border-[1.5px] bg-transparent font-extrabold">Denunciar</button>
        </form>
      </div>
    </details>
  );
}
