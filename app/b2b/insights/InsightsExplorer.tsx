"use client";

import { useState } from "react";

import { queryInsightsAction } from "@/features/campaigns/actions";
import { GRADE_STAGES } from "@/features/campaigns/schemas";
import type { InsightsResult } from "@/features/campaigns/insights-service";
import { GRADE_STAGE_LABEL } from "@/components/b2b/CampaignStatusBadge";

const inputClass = "border-texto-3/30 h-11 w-full rounded-[12px] border bg-white px-3 text-[14px]";

export function InsightsExplorer() {
  const [category, setCategory] = useState("papelaria");
  const [gradeStage, setGradeStage] = useState<"ei" | "ef" | "em">("ef");
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await queryInsightsAction({ category, gradeStage });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      setResult(null);
      return;
    }
    setResult(r.data);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={search} className="flex flex-wrap items-end gap-4 rounded-[20px] bg-white p-6">
        <label className="flex flex-col gap-1">
          <span className="text-texto-2 text-[13px] font-bold">Categoria</span>
          <input name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} maxLength={100} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-texto-2 text-[13px] font-bold">Série</span>
          <select name="gradeStage" value={gradeStage} onChange={(e) => setGradeStage(e.target.value as typeof gradeStage)} className={inputClass}>
            {GRADE_STAGES.map((s) => (
              <option key={s} value={s}>
                {GRADE_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className="bg-tinta text-papel rounded-botao h-11 px-5 text-[14px] font-extrabold disabled:opacity-50">
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {error ? <p className="text-[13px] font-bold text-erro-texto">{error}</p> : null}
      {result ? (
        <div className="rounded-[20px] bg-white p-6">
          <p className="text-texto-2 mb-4 text-[13px] font-bold">
            Ambiente: {result.isDemo ? "demonstração" : "real"} · k mínimo: {result.minK} escolas distintas
          </p>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-[13px] font-bold">Total exibido:</span>
            <span className="text-[20px] font-extrabold">{result.total}</span>
          </div>
          <table className="w-full text-left text-[14px]">
            <thead className="text-texto-3 text-[12px] font-extrabold uppercase">
              <tr>
                <th className="py-2">Cidade</th>
                <th className="py-2">Escolas distintas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {result.cities.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">{c.label}</td>
                  <td className="py-2 font-bold">{c.count}</td>
                </tr>
              ))}
              {result.others !== null ? (
                <tr>
                  <td className="text-texto-2 py-2 italic">Outras localidades (agrupadas por privacidade)</td>
                  <td className="py-2 font-bold">{result.others}</td>
                </tr>
              ) : null}
              {result.cities.length === 0 && result.others === null ? (
                <tr>
                  <td colSpan={2} className="text-texto-3 py-4 font-semibold">
                    Nenhum dado disponível nesse recorte.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {result.partial ? (
            <p className="text-texto-3 mt-3 text-[12px] font-semibold">
              Existem localidades com poucas escolas que não aparecem aqui — abaixo do k mínimo, mesmo agrupadas, para não identificar nenhum caso isolado.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
