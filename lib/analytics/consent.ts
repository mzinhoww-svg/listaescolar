/**
 * Escolha de medição de uso. Nada é gravado antes da escolha; a leitura abaixo só consulta uma escolha anterior.
 * `localStorage` sempre em try/catch (modo privado, dados bloqueados).
 */
import type { Consent, IdStore } from "./client";

const CONSENT_KEY = "lc_analytics_consent_v1";
const ID_KEY = "lc_analytics_id";

type Listener = (c: Consent) => void;
let listeners: Listener[] = [];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem storage a escolha vale só nesta página.
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // idem
  }
}

let memory: Consent | null = null;

export function getConsent(): Consent {
  if (memory) return memory;
  const v = read(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : "unset";
}

const emit = (c: Consent) => {
  memory = c;
  for (const l of listeners) l(c);
};

export function grant(): void {
  write(CONSENT_KEY, "granted");
  emit("granted");
}
export function deny(): void {
  write(CONSENT_KEY, "denied");
  emit("denied");
}
/** Retira o aceite dado antes: apaga o identificador e registra a recusa. */
export function revoke(): void {
  remove(ID_KEY);
  write(CONSENT_KEY, "denied");
  emit("denied");
}

export function subscribe(l: Listener): () => void {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

export function resetConsentListenersForTests() {
  listeners = [];
  memory = null;
}

/** Guardado do identificador anônimo: só é chamado pelo cliente depois do aceite. */
export const localIdStore: IdStore = {
  load: () => read(ID_KEY),
  save: (id) => write(ID_KEY, id),
  clear: () => remove(ID_KEY),
};
