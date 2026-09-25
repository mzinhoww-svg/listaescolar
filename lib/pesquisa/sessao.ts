const STORAGE_KEY = "listacerta_pesquisa_session";

export type EstadoPesquisaLocal = {
  sessionId: string;
  step: number;
  respostas: Record<string, unknown>;
  concluida: boolean;
  g?: string;
  ref?: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function criarSessionId(): string {
  return crypto.randomUUID();
}

export function carregarEstadoLocal(): EstadoPesquisaLocal | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EstadoPesquisaLocal>;
    if (!parsed || typeof parsed.sessionId !== "string") return null;
    return {
      sessionId: parsed.sessionId,
      step: typeof parsed.step === "number" ? parsed.step : 0,
      respostas: parsed.respostas && typeof parsed.respostas === "object" ? parsed.respostas : {},
      concluida: parsed.concluida === true,
      g: typeof parsed.g === "string" ? parsed.g : undefined,
      ref: typeof parsed.ref === "string" ? parsed.ref : undefined,
    };
  } catch {
    return null;
  }
}

export function salvarEstadoLocal(estado: EstadoPesquisaLocal): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  } catch {
    // localStorage indisponível (modo privado, cota etc.): a pesquisa segue, só não retoma depois.
  }
}

export function obterOuCriarEstadoLocal(paramsIniciais: { g?: string; ref?: string }): EstadoPesquisaLocal {
  const existente = carregarEstadoLocal();
  if (existente) return existente;
  const novo: EstadoPesquisaLocal = {
    sessionId: criarSessionId(),
    step: 0,
    respostas: {},
    concluida: false,
    g: paramsIniciais.g,
    ref: paramsIniciais.ref,
  };
  salvarEstadoLocal(novo);
  return novo;
}
