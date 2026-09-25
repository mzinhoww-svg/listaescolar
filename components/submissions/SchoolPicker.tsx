"use client";

import { useState, useTransition } from "react";

import { searchSchoolsAction, type SchoolHit } from "@/app/enviar-lista/school-search-action";

const field = "bg-campo text-tinta min-h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

export type LinkedSchool = { id: string; name: string; inep: string };

/** Escola do envio da escola: só as vinculadas (uma só = pré-selecionada). Sem vínculo, o servidor recusa de qualquer forma. */
export function LinkedSchoolSelect({ schools, initialId }: { schools: readonly LinkedSchool[]; initialId?: string | null }) {
  const preset = schools.length === 1 ? schools[0]!.id : schools.some((s) => s.id === initialId) ? (initialId as string) : "";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="schoolId" className="text-[13px] font-extrabold">Escola</label>
      <select id="schoolId" name="schoolId" required defaultValue={preset} className={field}>
        <option value="" disabled>Escolha a escola</option>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>{s.name} · INEP {s.inep}</option>
        ))}
      </select>
    </div>
  );
}

/** Busca de escola (S04) para família e admin: nome ou INEP; escolhe uma da lista ou nenhuma (`optional`). */
export function SchoolSearchPicker({ optional = true, label = "Escola da lista (opcional)" }: { optional?: boolean; label?: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SchoolHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<SchoolHit | null>(null);
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      const r = await searchSchoolsAction(query);
      setFailed(r.status === "error");
      setHits(r.status === "ok" ? r.hits : null);
    });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13px] font-extrabold">{label}</legend>
      <input type="hidden" name="schoolId" value={chosen?.id ?? ""} />
      {chosen ? (
        <p data-testid="school-chosen" className="bg-campo flex items-center justify-between gap-3 rounded-campo px-4 py-3 text-[14px] font-bold">
          <span>{chosen.name} · INEP {chosen.inep}</span>
          <button type="button" onClick={() => setChosen(null)} className="underline">Trocar</button>
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="search"
              aria-label="Buscar escola por nome ou INEP"
              placeholder="Nome ou INEP da escola"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
              className={field}
            />
            <button type="button" onClick={search} disabled={pending || query.trim().length < 2} className="bg-tinta text-papel rounded-botao min-h-[52px] shrink-0 px-5 text-[14px] font-extrabold disabled:opacity-50">
              {pending ? "Buscando..." : "Buscar"}
            </button>
          </div>
          <div aria-live="polite">
            {failed ? <p role="alert" className="text-[13px] font-bold text-red-700">Não foi possível buscar agora. Tente de novo.</p> : null}
            {hits && hits.length === 0 ? <p className="text-texto-2 text-[13px] font-semibold">Nenhuma escola encontrada.</p> : null}
            {hits && hits.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => setChosen(h)} className="bg-campo w-full rounded-campo px-4 py-2.5 text-left text-[14px] font-semibold">
                      <span className="font-extrabold">{h.name}</span> · INEP {h.inep}
                      <span className="text-texto-3 block text-[12px]">{[h.neighborhood, h.municipalityName].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {optional ? <p className="text-texto-3 text-[12px] font-semibold">Sem escola escolhida, a equipe identifica a escola na revisão.</p> : null}
        </>
      )}
    </fieldset>
  );
}
