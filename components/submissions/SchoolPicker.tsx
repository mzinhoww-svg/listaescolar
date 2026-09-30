"use client";

import { useEffect, useRef, useState } from "react";

import { searchSchoolsAction, type SchoolHit } from "@/app/enviar-lista/school-search-action";

export type { SchoolHit };

const field = "bg-campo text-tinta min-h-[52px] w-full rounded-campo px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo";

const SEARCH_DELAY_MS = 350;

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

/** Busca de escola (S04) para família e admin: nome ou código INEP; escolhe uma da lista ou nenhuma (`optional`).
 * A busca roda ao digitar (S29 UX-070), sem botão. `initial` pré-seleciona uma escola já escolhida antes (ex.: editar
 * aluno, S15), sem precisar buscar de novo. */
export function SchoolSearchPicker({
  optional = true,
  label = "Escola da lista (opcional)",
  initial,
}: {
  optional?: boolean;
  label?: string;
  initial?: SchoolHit | null;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SchoolHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<SchoolHit | null>(initial ?? null);
  const seq = useRef(0);
  const short = query.trim().length < 2; // busca curta demais: nada de resultado, erro ou "Buscando" de digitação anterior

  useEffect(() => {
    const q = query.trim();
    const id = ++seq.current; // resposta de digitação antiga é ignorada
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await searchSchoolsAction(q);
      if (seq.current !== id) return;
      setSearching(false);
      setFailed(r.status === "error");
      setHits(r.status === "ok" ? r.hits : null);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[14px] font-extrabold">{label}</legend>
      <input type="hidden" name="schoolId" value={chosen?.id ?? ""} />
      {chosen ? (
        <p data-testid="school-chosen" className="bg-campo flex items-center justify-between gap-3 rounded-campo px-4 py-3 text-[14px] font-bold">
          <span className="min-w-0 break-words">{chosen.name} · INEP {chosen.inep}</span>
          <button type="button" onClick={() => setChosen(null)} className="min-h-11 shrink-0 underline">Trocar</button>
        </p>
      ) : (
        <>
          <label htmlFor="school-query" className="text-[13px] font-extrabold">Nome ou código INEP da escola</label>
          <input
            id="school-query"
            type="search"
            aria-describedby="school-query-hint"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault(); // Enter não envia o formulário: a busca já roda ao digitar
            }}
            className={field}
          />
          <p id="school-query-hint" className="text-texto-3 text-[12px] font-semibold">
            O código INEP é o número da escola no Censo Escolar. Escreva ao menos 2 letras ou números.
          </p>
          <div aria-live="polite">
            {searching && !short ? <p className="text-texto-2 text-[13px] font-semibold">Buscando...</p> : null}
            {failed && !short ? <p role="alert" className="text-[13px] font-bold text-erro-texto">Não foi possível buscar agora. Digite de novo para tentar outra vez.</p> : null}
            {!short && !searching && hits && hits.length === 0 ? <p className="text-texto-2 text-[13px] font-semibold">Nenhuma escola encontrada.</p> : null}
            {!short && hits && hits.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => setChosen(h)} className="min-h-11 inline-flex items-center justify-center bg-campo w-full rounded-campo px-4 py-2.5 text-left text-[14px] font-semibold">
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
