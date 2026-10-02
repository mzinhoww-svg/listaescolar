/**
 * Escolha de medição de uso. Nada é gravado antes da escolha; a leitura abaixo só consulta uma escolha anterior.
 * `localStorage` sempre em try/catch (modo privado, dados bloqueados).
 */
import type { Consent, IdStore } from "./client";
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE } from "./config";

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

/**
 * Cookie de ESTADO (`lc_analytics_consent=granted`, sem identificador, SameSite=Lax, Path=/): deixa o servidor saber
 * que o aceite existe, para os eventos de servidor que nascem de ação do usuário (revisão I3). Só é gravado com
 * aceite; recusar, revogar ou limpar apaga.
 */
export function syncConsentCookie(c: Consent): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      c === "granted"
        ? `${CONSENT_COOKIE}=granted; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
        : `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  } catch {
    // Sem cookie, o servidor simplesmente não emite.
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
  syncConsentCookie("granted");
  emit("granted");
}
export function deny(): void {
  write(CONSENT_KEY, "denied");
  syncConsentCookie("denied");
  emit("denied");
}
/** Retira o aceite dado antes: apaga o identificador e registra a recusa. */
export function revoke(): void {
  remove(ID_KEY);
  write(CONSENT_KEY, "denied");
  syncConsentCookie("denied");
  emit("denied");
}

/**
 * Propaga a escolha entre abas (revisão M3): `storage` só dispara nas OUTRAS abas. Revogar (ou apagar a escolha)
 * em uma aba derruba memória, fila e identificador nas demais; aceitar em outra aba libera esta. Devolve o `off`.
 */
export function listenForConsentChanges(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== CONSENT_KEY) return;
    const v = e.key === null ? null : e.newValue;
    // Escolha apagada (ou valor desconhecido) vale como recusa SÓ para quem já tinha aceitado: erra para o lado que
    // não envia, sem inventar uma recusa para quem ainda nem escolheu.
    const next: Consent = v === "granted" ? "granted" : v === "denied" || getConsent() === "granted" ? "denied" : getConsent();
    if (next === getConsent()) return;
    if (next === "denied") remove(ID_KEY);
    emit(next);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
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
