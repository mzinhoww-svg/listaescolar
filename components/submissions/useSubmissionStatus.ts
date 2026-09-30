"use client";

import { useEffect, useState } from "react";

import { phaseOf, pollDelayMs, statusPayloadSchema, type Phase, type StatusPayload } from "@/features/submissions/status-model";

const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Consulta a rota de status com intervalo crescente e PARA em estado final (resultado pronto, erro ou leitura indisponível).
 * Sem resposta útil 5 vezes seguidas, `lost` fica verdadeiro e a consulta para. Compartilhado pelo painel da família e da escola.
 */
export function useSubmissionStatus(submissionId: string, initial: StatusPayload): { data: StatusPayload; phase: Phase; lost: boolean } {
  const [data, setData] = useState(initial);
  const [lost, setLost] = useState(false);
  const phase = phaseOf(data);

  useEffect(() => {
    if (phase !== "reading") return;
    let cancelled = false;
    let attempt = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let ok = false;
      try {
        const res = await fetch(`/api/submissions/${submissionId}/status`, { cache: "no-store" });
        const parsed = res.ok ? statusPayloadSchema.safeParse(await res.json()) : null;
        if (parsed?.success && !cancelled) {
          ok = true;
          setData(parsed.data);
        }
      } catch {
        // rede instável: conta como falha e tenta de novo
      }
      if (cancelled) return;
      failures = ok ? 0 : failures + 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) return setLost(true);
      attempt += 1;
      timer = setTimeout(tick, pollDelayMs(attempt));
    };
    timer = setTimeout(tick, pollDelayMs(0));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, submissionId]);

  return { data, phase, lost };
}
