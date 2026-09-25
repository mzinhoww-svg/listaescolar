// Sem imports: também é carregado pela Edge Function (Deno) por caminho relativo.

type DemoResult = {
  items: { name: string; quantity: number | null; unit: string | null; confidence: number }[];
  overallConfidence: number;
  warnings: string[];
};

export type DemoMode = "fast" | "slow" | "fail";

/** Modo pelo nome do arquivo (E2E): "lento"/"slow" e "falha"/"fail"; senão rápido. */
export function demoModeFor(fileName: string): DemoMode {
  const n = fileName.toLowerCase();
  if (/(lento|slow)/.test(n)) return "slow";
  if (/(falha|fail)/.test(n)) return "fail";
  return "fast";
}

/**
 * Pipeline de demonstração. Só é instanciado com DEMO_PIPELINE=1 (nunca em produção; ver lib/env.ts).
 * Devolve itens FIXOS e rotulados como demonstração: não lê o arquivo e nunca finge extração real.
 */
export class DemoExtractionPipeline {
  readonly isDemo = true;
  constructor(private readonly opts: { slowMs?: number; mode?: DemoMode } = {}) {}

  async extract(
    input: { fileName: string },
    { signal }: { signal: AbortSignal },
  ): Promise<DemoResult> {
    const mode = this.opts.mode ?? demoModeFor(input.fileName);
    if (mode === "fail") throw new Error("falha simulada (demonstração)");
    if (mode === "slow") await abortableSleep(this.opts.slowMs ?? 15_000, signal);
    if (signal.aborted) throw new Error("cancelado");
    return {
      items: [
        { name: "Caderno (item de demonstração)", quantity: 2, unit: "un", confidence: 0.9 },
        { name: "Lápis preto (item de demonstração)", quantity: 12, unit: "un", confidence: 0.9 },
      ],
      overallConfidence: 0.9,
      warnings: ["Demonstração: itens fixos, sem leitura real do arquivo."],
    };
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("cancelado"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("cancelado"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
